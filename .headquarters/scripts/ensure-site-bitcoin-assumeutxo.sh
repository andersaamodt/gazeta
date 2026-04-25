#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}

# Bitcoin Core v31 carries the mainnet assumeutxo commitment for height 935000.
snapshot_height=${HQ_BITCOIN_ASSUMEUTXO_HEIGHT:-935000}
snapshot_file=${HQ_BITCOIN_ASSUMEUTXO_FILE:-utxo-935000.dat}
snapshot_magnet=${HQ_BITCOIN_ASSUMEUTXO_MAGNET:-magnet:?xt=urn:btih:3492d082655d173d3459f7a5e454f3dd4ed0101b&dn=utxo-935000.dat&tr=udp%3A%2F%2Ftracker.bitcoin.sprovoost.nl%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return $?
  fi
  if [ -n "${HQ_REMOTE_SUDO_PASSWORD-}" ] && command -v sudo >/dev/null 2>&1; then
    printf '%s\n' "$HQ_REMOTE_SUDO_PASSWORD" | sudo -S -p '' "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return $?
  fi
  "$@"
}

run_site() {
  if [ "$(id -u)" -eq 0 ]; then
    runuser -u "$site_user" -- "$@"
    return $?
  fi
  if [ "$(id -un)" = "$site_user" ]; then
    "$@"
    return $?
  fi
  run_root runuser -u "$site_user" -- "$@"
}

status_ok() {
  printf 'status=ok\n'
  printf 'summary=%s\n' "$1"
}

status_bad() {
  printf 'status=bad\n'
  printf 'summary=%s\n' "$1"
}

require_site_context() {
  [ -n "$site_user" ] || {
    status_bad "HQ_SITE_USER is required for Bitcoin UTXO snapshot bootstrap."
    exit 1
  }
}

site_home() {
  printf '/home/%s\n' "$site_user"
}

bitcoin_root() {
  printf '%s/.sitedata/site/bitcoin\n' "$(site_home)"
}

bitcoin_data_dir() {
  printf '%s/data\n' "$(bitcoin_root)"
}

bitcoin_conf_file() {
  printf '%s/bitcoin.conf\n' "$(bitcoin_root)"
}

snapshot_dir() {
  printf '%s/snapshots\n' "$(bitcoin_root)"
}

snapshot_path() {
  printf '%s/%s\n' "$(snapshot_dir)" "$snapshot_file"
}

service_name() {
  printf 'headquarters-bitcoind-%s\n' "$site_user"
}

bitcoin_cli_binary() {
  command -v bitcoin-cli 2>/dev/null || true
}

aria2_binary() {
  command -v aria2c 2>/dev/null || true
}

bitcoin_cli() {
  cli=$(bitcoin_cli_binary)
  [ -n "$cli" ] || return 127
  run_site "$cli" -conf="$(bitcoin_conf_file)" -datadir="$(bitcoin_data_dir)" "$@"
}

wait_for_rpc() {
  attempts=0
  while [ "$attempts" -lt 90 ]; do
    if bitcoin_cli getblockchaininfo >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  return 1
}

wait_for_bitcoind_stopped() {
  attempts=0
  while [ "$attempts" -lt 60 ]; do
    if ! run_root systemctl is-active --quiet "$(service_name)" && ! pgrep -u "$site_user" -x bitcoind >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  return 1
}

snapshot_chainstate_loaded() {
  bitcoin_cli getchainstates 2>/dev/null | jq -e --argjson height "$snapshot_height" '
    .chainstates[]?
    | select((.snapshot_blockhash // "") != "" and (.blocks // 0) >= $height)
  ' >/dev/null 2>&1
}

headers_at_snapshot_height() {
  bitcoin_cli getblockchaininfo 2>/dev/null | jq -e --argjson height "$snapshot_height" '
    (.headers // 0) >= $height
  ' >/dev/null 2>&1
}

download_snapshot() {
  aria2=$(aria2_binary)
  [ -n "$aria2" ] || {
    status_bad "aria2c is required to download the UTXO snapshot torrent before loading it."
    exit 1
  }
  run_root install -d -o "$site_user" -g "$site_user" -m 700 "$(snapshot_dir)"

  # Keep the tiny VPS focused on one heavy job. The node is restarted only after
  # the snapshot file exists, and network syncing is paused during the import RPC.
  run_root systemctl stop "$(service_name)" 2>/dev/null || true
  wait_for_bitcoind_stopped || {
    status_bad "Bitcoin Core did not stop cleanly before the snapshot download."
    exit 1
  }
  run_site "$aria2" \
    --dir="$(snapshot_dir)" \
    --out="$snapshot_file" \
    --continue=true \
    --max-connection-per-server=4 \
    --split=4 \
    --seed-time=0 \
    "$snapshot_magnet"
}

load_snapshot() {
  run_root systemctl start "$(service_name)"
  wait_for_rpc || {
    status_bad "Bitcoin Core RPC did not come up for snapshot loading."
    exit 1
  }
  headers_at_snapshot_height || {
    status_bad "Bitcoin headers have not reached the assumeutxo snapshot height $snapshot_height yet."
    exit 1
  }

  bitcoin_cli setnetworkactive false >/dev/null
  if bitcoin_cli -rpcclienttimeout=0 loadtxoutset "$(snapshot_path)"; then
    bitcoin_cli setnetworkactive true >/dev/null || true
  else
    bitcoin_cli setnetworkactive true >/dev/null || true
    status_bad "Bitcoin Core rejected or failed to load the UTXO snapshot."
    exit 1
  fi
}

check_status() {
  require_site_context
  [ -n "$(bitcoin_cli_binary)" ] || {
    status_bad "bitcoin-cli is not installed on this server."
    return 0
  }
  if ! run_root systemctl is-active --quiet "$(service_name)"; then
    if run_root test -f "$(snapshot_path)"; then
      status_bad "UTXO snapshot file is present, but Bitcoin Core is not running for import."
    else
      status_bad "UTXO snapshot is not loaded, and Bitcoin Core is not running."
    fi
    return 0
  fi
  if ! wait_for_rpc; then
    status_bad "Bitcoin Core RPC is not responding for snapshot status."
    return 0
  fi
  if snapshot_chainstate_loaded; then
    status_ok "Bitcoin Core is running from an assumeutxo snapshot at height $snapshot_height while background validation continues."
    return 0
  fi
  if run_root test -f "$(snapshot_path)"; then
    status_bad "UTXO snapshot file is downloaded but not loaded yet."
    return 0
  fi
  status_bad "UTXO snapshot bootstrap has not been run yet."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
[ -n "$(bitcoin_cli_binary)" ] || {
  status_bad "bitcoin-cli is not installed on this server."
  exit 1
}

if run_root systemctl is-active --quiet "$(service_name)" && wait_for_rpc && snapshot_chainstate_loaded; then
  status_ok "Bitcoin Core is already running from the assumeutxo snapshot at height $snapshot_height."
  exit 0
fi

if ! run_root test -f "$(snapshot_path)"; then
  download_snapshot
fi
load_snapshot
status_ok "Bitcoin Core loaded the assumeutxo snapshot at height $snapshot_height."
