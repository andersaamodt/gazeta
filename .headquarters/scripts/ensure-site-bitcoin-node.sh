#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return 0
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
    status_bad "HQ_SITE_USER is required for Bitcoin node provisioning."
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

service_name() {
  printf 'headquarters-bitcoind-%s\n' "$site_user"
}

service_file() {
  printf '/etc/systemd/system/%s.service\n' "$(service_name)"
}

site_wizardry_dir() {
  printf '%s/.wizardry\n' "$(site_home)"
}

virtualization_kind() {
  if command -v systemd-detect-virt >/dev/null 2>&1; then
    virt=$(systemd-detect-virt 2>/dev/null || printf '')
    case "$virt" in
      ''|none) ;;
      *) printf '%s\n' "$virt"; return 0 ;;
    esac
  fi
  if [ -r /proc/user_beancounters ] || [ -d /proc/vz ]; then
    printf '%s\n' openvz
    return 0
  fi
  printf '\n'
}

total_ram_mb() {
  if command -v free >/dev/null 2>&1; then
    mem=$(free -m 2>/dev/null | awk '/^Mem:/ { print $2; exit }')
    case "$mem" in
      ''|*[!0-9]*) ;;
      *) printf '%s\n' "$mem"; return 0 ;;
    esac
  fi
  if [ -r /proc/meminfo ]; then
    mem_kb=$(awk '/^MemTotal:[[:space:]]+/ { print $2; exit }' /proc/meminfo 2>/dev/null || printf '')
    case "$mem_kb" in
      ''|*[!0-9]*) ;;
      *) printf '%s\n' $((mem_kb / 1024)); return 0 ;;
    esac
  fi
  printf '%s\n' 0
}

recommended_dbcache_mb() {
  total=$(total_ram_mb)
  virt=$(virtualization_kind)
  case "$total" in
    ''|*[!0-9]*) total=0 ;;
  esac
  if [ "$total" -le 0 ]; then
    printf '%s\n' 32
    return 0
  fi
  if [ "$total" -le 768 ]; then
    if [ "$virt" = "openvz" ]; then
      printf '%s\n' 4
    else
      printf '%s\n' 16
    fi
    return 0
  fi
  if [ "$total" -le 1536 ]; then
    printf '%s\n' 32
    return 0
  fi
  if [ "$total" -le 3072 ]; then
    printf '%s\n' 64
    return 0
  fi
  printf '%s\n' 128
}

recommended_prune_mb() {
  disk_mb=$(df -Pm "$(site_home)" 2>/dev/null | awk 'NR==2 { print $2; exit }')
  case "$disk_mb" in
    ''|*[!0-9]*) disk_mb=0 ;;
  esac
  min_target=20000
  floor_target=2000
  if [ "$disk_mb" -le 0 ]; then
    printf '%s\n' "$min_target"
    return 0
  fi
  one_third=$((disk_mb / 3))
  if [ "$one_third" -lt "$min_target" ]; then
    if [ "$one_third" -lt "$floor_target" ]; then
      printf '%s\n' "$floor_target"
    else
      printf '%s\n' "$one_third"
    fi
    return 0
  fi
  printf '%s\n' "$min_target"
}

recommended_maxmempool_mb() {
  total=$(total_ram_mb)
  virt=$(virtualization_kind)
  case "$total" in
    ''|*[!0-9]*) total=0 ;;
  esac
  if [ "$total" -le 0 ]; then
    printf '%s\n' 16
    return 0
  fi
  if [ "$total" -le 768 ]; then
    if [ "$virt" = "openvz" ]; then
      printf '%s\n' 5
    else
      printf '%s\n' 16
    fi
    return 0
  fi
  if [ "$total" -le 1536 ]; then
    printf '%s\n' 16
    return 0
  fi
  printf '%s\n' 32
}

recommended_rpcthreads() {
  total=$(total_ram_mb)
  case "$total" in
    ''|*[!0-9]*) total=0 ;;
  esac
  if [ "$total" -le 768 ]; then
    printf '%s\n' 1
    return 0
  fi
  if [ "$total" -le 1536 ]; then
    printf '%s\n' 4
    return 0
  fi
  printf '%s\n' 8
}

recommended_maxconnections() {
  total=$(total_ram_mb)
  virt=$(virtualization_kind)
  case "$total" in
    ''|*[!0-9]*) total=0 ;;
  esac
  if [ "$total" -le 0 ]; then
    printf '%s\n' 8
    return 0
  fi
  if [ "$total" -le 768 ]; then
    if [ "$virt" = "openvz" ]; then
      printf '%s\n' 4
    else
      printf '%s\n' 8
    fi
    return 0
  fi
  if [ "$total" -le 1536 ]; then
    printf '%s\n' 10
    return 0
  fi
  printf '%s\n' 16
}

recommended_script_threads() {
  total=$(total_ram_mb)
  case "$total" in
    ''|*[!0-9]*) total=0 ;;
  esac
  if [ "$total" -le 768 ]; then
    printf '%s\n' 1
    return 0
  fi
  printf '%s\n' 2
}

bitcoin_binary() {
  command -v bitcoind 2>/dev/null || true
}

bitcoin_cli_binary() {
  command -v bitcoin-cli 2>/dev/null || true
}

run_site_wizardry_spell() {
  spell_rel=$1
  runtime=$(site_wizardry_dir)
  spell="$runtime/$spell_rel"
  [ -x "$spell" ] || return 1
  run_root sh -eu -c '
runtime=$1
spell=$2
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WIZARDRY_DIR=$runtime
export WIZARDRY_DIR
. "$runtime/spells/.imps/sys/invoke-wizardry" >/dev/null 2>&1 || true
if command -v yes >/dev/null 2>&1; then
  yes "" | "$spell"
else
  printf "\n\n\n\n\n" | "$spell"
fi
' sh "$runtime" "$spell"
}

ensure_bitcoin_installed() {
  bitcoind_bin=$(bitcoin_binary)
  bitcoin_cli_bin=$(bitcoin_cli_binary)
  if [ -n "$bitcoind_bin" ] && [ -n "$bitcoin_cli_bin" ]; then
    return 0
  fi
  run_site_wizardry_spell 'spells/.arcana/bitcoin/install-bitcoin' || {
    status_bad "Bitcoin Core is missing and the site Wizardry install spell could not be run."
    exit 1
  }
  bitcoind_bin=$(bitcoin_binary)
  bitcoin_cli_bin=$(bitcoin_cli_binary)
  if [ -z "$bitcoind_bin" ] || [ -z "$bitcoin_cli_bin" ]; then
    status_bad "Bitcoin Core install finished without producing bitcoind and bitcoin-cli."
    exit 1
  fi
}

write_conf_file() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/site-bitcoin-conf.XXXXXX")
  prune_target=$(recommended_prune_mb)
  dbcache_target=$(recommended_dbcache_mb)
  mempool_target=$(recommended_maxmempool_mb)
  rpc_threads=$(recommended_rpcthreads)
  max_connections=$(recommended_maxconnections)
  script_threads=$(recommended_script_threads)
  cat > "$tmp" <<EOF_CONF
server=1
daemon=0
prune=$prune_target
txindex=0
disablewallet=1
persistmempool=0
listen=0
maxconnections=$max_connections
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcthreads=$rpc_threads
par=$script_threads
fallbackfee=0.00020000
dbcache=$dbcache_target
maxmempool=$mempool_target
EOF_CONF
  run_root install -d -o "$site_user" -g "$site_user" -m 700 "$(bitcoin_root)"
  run_root install -d -o "$site_user" -g "$site_user" -m 700 "$(bitcoin_data_dir)"
  run_root install -o "$site_user" -g "$site_user" -m 600 "$tmp" "$(bitcoin_conf_file)"
  rm -f "$tmp"
}

write_service_file() {
  bitcoind_bin=$(bitcoin_binary)
  bitcoin_cli_bin=$(bitcoin_cli_binary)
  [ -n "$bitcoind_bin" ] || {
    status_bad "bitcoind is not installed on this server."
    exit 1
  }
  [ -n "$bitcoin_cli_bin" ] || {
    status_bad "bitcoin-cli is not installed on this server."
    exit 1
  }
  tmp=$(mktemp "${TMPDIR:-/tmp}/site-bitcoin-service.XXXXXX")
  cat > "$tmp" <<EOF_SERVICE
[Unit]
Description=Headquarters Bitcoin Core for $site_user
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$site_user
Group=$site_user
WorkingDirectory=$(site_home)
ExecStart=$bitcoind_bin -conf=$(bitcoin_conf_file) -datadir=$(bitcoin_data_dir) -pid=$(bitcoin_root)/bitcoind.pid -printtoconsole=1
ExecStop=$bitcoin_cli_bin -conf=$(bitcoin_conf_file) -datadir=$(bitcoin_data_dir) stop
Restart=on-failure
RestartSec=10
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF_SERVICE
  run_root install -m 0644 -o root -g root "$tmp" "$(service_file)"
  rm -f "$tmp"
}

wait_for_rpc() {
  bitcoin_cli_bin=$(bitcoin_cli_binary)
  [ -n "$bitcoin_cli_bin" ] || return 1
  attempts=0
  while [ "$attempts" -lt 90 ]; do
    if run_site "$bitcoin_cli_bin" -conf="$(bitcoin_conf_file)" -datadir="$(bitcoin_data_dir)" getblockchaininfo >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  return 1
}

check_status() {
  require_site_context
  bitcoind_bin=$(bitcoin_binary)
  bitcoin_cli_bin=$(bitcoin_cli_binary)
  [ -n "$bitcoind_bin" ] || {
    status_bad "bitcoind is not installed on this server."
    return 0
  }
  [ -n "$bitcoin_cli_bin" ] || {
    status_bad "bitcoin-cli is not installed on this server."
    return 0
  }
  if ! run_root test -f "$(bitcoin_conf_file)"; then
    status_bad "The site Bitcoin Core config file is missing."
    return 0
  fi
  [ -f "$(service_file)" ] || {
    status_bad "The site Bitcoin Core systemd service is missing."
    return 0
  }
  command -v systemctl >/dev/null 2>&1 || {
    status_bad "systemctl is required for Bitcoin node provisioning."
    return 0
  }
  if ! run_root systemctl is-active --quiet "$(service_name)"; then
    status_bad "Bitcoin Core service $(service_name) is not active."
    return 0
  fi
  if ! wait_for_rpc; then
    status_bad "Bitcoin Core RPC is not responding for $(service_name)."
    return 0
  fi
  status_ok "Bitcoin Core is provisioned for $site_user via $(service_name)."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
ensure_bitcoin_installed
write_conf_file
write_service_file
run_root systemctl daemon-reload
run_root systemctl enable "$(service_name)"
if run_root systemctl is-active --quiet "$(service_name)"; then
  run_root systemctl restart "$(service_name)"
else
  run_root systemctl start "$(service_name)"
fi
if ! wait_for_rpc; then
  status_bad "Bitcoin Core did not become ready after provisioning."
  exit 1
fi
status_ok "Bitcoin Core is provisioned for $site_user via $(service_name)."
