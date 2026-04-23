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
  cat > "$tmp" <<'EOF_CONF'
server=1
daemon=0
prune=550
txindex=0
listen=0
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
fallbackfee=0.00020000
dbcache=96
maxmempool=32
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
    if "$bitcoin_cli_bin" -conf="$(bitcoin_conf_file)" -datadir="$(bitcoin_data_dir)" getblockchaininfo >/dev/null 2>&1; then
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
  [ -f "$(bitcoin_conf_file)" ] || {
    status_bad "The site Bitcoin Core config file is missing."
    return 0
  }
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
run_root systemctl enable --now "$(service_name)"
if ! wait_for_rpc; then
  status_bad "Bitcoin Core did not become ready after provisioning."
  exit 1
fi
status_ok "Bitcoin Core is provisioned for $site_user via $(service_name)."
