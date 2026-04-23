#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}
site_domain=${HQ_SITE_DOMAIN-}

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
    status_bad "HQ_SITE_USER is required for Lightning node provisioning."
    exit 1
  }
  [ -n "$site_domain" ] || {
    status_bad "HQ_SITE_DOMAIN is required for Lightning node provisioning."
    exit 1
  }
}

site_home() {
  printf '/home/%s\n' "$site_user"
}

active_site_conf() {
  printf '%s/site/site.conf\n' "$(site_home)"
}

release_site_conf() {
  printf '%s/.wizardry.hq/release-config/site.conf\n' "$(site_home)"
}

bitcoin_root() {
  printf '%s/.sitedata/site/bitcoin\n' "$(site_home)"
}

bitcoin_data_dir() {
  printf '%s/data\n' "$(bitcoin_root)"
}

bitcoin_service_name() {
  printf 'headquarters-bitcoind-%s\n' "$site_user"
}

lightning_root() {
  printf '%s/.sitedata/site/lightning\n' "$(site_home)"
}

lightning_logs_dir() {
  printf '%s/logs\n' "$(lightning_root)"
}

lightning_conf_file() {
  printf '%s/config\n' "$(lightning_root)"
}

lightning_network_dir() {
  printf '%s/bitcoin\n' "$(lightning_root)"
}

service_name() {
  printf 'headquarters-lightningd-%s\n' "$site_user"
}

service_file() {
  printf '/etc/systemd/system/%s.service\n' "$(service_name)"
}

site_wizardry_dir() {
  printf '%s/.wizardry\n' "$(site_home)"
}

lightningd_binary() {
  command -v lightningd 2>/dev/null || true
}

lightning_cli_binary() {
  command -v lightning-cli 2>/dev/null || true
}

read_conf_value() {
  file=$1
  key=$2
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, "", $0); print $0; exit }' "$file" 2>/dev/null || true
}

write_conf_value() {
  file=$1
  key=$2
  value=$3
  tmp=$(mktemp "${TMPDIR:-/tmp}/site-lightning-meta.XXXXXX")
  awk -F= -v key="$key" -v value="$value" '
BEGIN { replaced = 0 }
$1 == key {
  if (!replaced) {
    printf "%s=%s\n", key, value
    replaced = 1
  }
  next
}
{ print }
END {
  if (!replaced) {
    printf "%s=%s\n", key, value
  }
}
' "$file" > "$tmp"
  run_root install -o "$site_user" -g "$site_user" -m 640 "$tmp" "$file"
  rm -f "$tmp"
}

normalize_host() {
  raw=${1-}
  raw=$(printf '%s' "$raw" | tr -d '\r\n' | sed -e 's#^[[:space:]]*##' -e 's#[[:space:]]*$##')
  raw=$(printf '%s' "$raw" | sed -e 's#^https\{0,1\}://##' -e 's#/.*$##' -e 's/:[0-9][0-9]*$//')
  printf '%s\n' "$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
}

valid_host() {
  candidate=${1-}
  [ -n "$candidate" ] || return 1
  printf '%s' "$candidate" | grep -Eq '^[A-Za-z0-9.-]+$' || return 1
  printf '%s' "$candidate" | grep -q '\.' || return 1
  case "$candidate" in
    localhost|*.local|*..*|.*|*.) return 1 ;;
    [0-9]*.[0-9]*.[0-9]*.[0-9]*) return 1 ;;
  esac
  return 0
}

resolve_public_host() {
  configured=$(normalize_host "$(read_conf_value "$(active_site_conf)" lightning_public_host)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(normalize_host "$(read_conf_value "$(release_site_conf)" lightning_public_host)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(normalize_host "$(read_conf_value "$(active_site_conf)" zap_alias_domain)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(normalize_host "$(read_conf_value "$(release_site_conf)" zap_alias_domain)")
  if valid_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  printf '%s\n' "$site_domain"
}

public_port() {
  configured=$(read_conf_value "$(active_site_conf)" lightning_public_port | tr -d '\r\n[:space:]')
  case "$configured" in
    ''|*[!0-9]*) configured='' ;;
  esac
  if [ -n "$configured" ] && [ "$configured" -gt 0 ]; then
    printf '%s\n' "$configured"
    return 0
  fi
  configured=$(read_conf_value "$(release_site_conf)" lightning_public_port | tr -d '\r\n[:space:]')
  case "$configured" in
    ''|*[!0-9]*) configured='' ;;
  esac
  if [ -n "$configured" ] && [ "$configured" -gt 0 ]; then
    printf '%s\n' "$configured"
    return 0
  fi
  checksum=$(printf '%s\n' "$site_user" | cksum | awk '{print $1}')
  offset=$((checksum % 1000))
  printf '%s\n' $((19000 + (offset * 2)))
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

ensure_lightning_installed() {
  lightningd_bin=$(lightningd_binary)
  lightning_cli_bin=$(lightning_cli_binary)
  if [ -n "$lightningd_bin" ] && [ -n "$lightning_cli_bin" ]; then
    return 0
  fi
  run_site_wizardry_spell 'spells/.arcana/lightning/install-lightning' || {
    status_bad "Core Lightning is missing and the site Wizardry install spell could not be run."
    exit 1
  }
  lightningd_bin=$(lightningd_binary)
  lightning_cli_bin=$(lightning_cli_binary)
  if [ -z "$lightningd_bin" ] || [ -z "$lightning_cli_bin" ]; then
    status_bad "Lightning install finished without producing lightningd and lightning-cli."
    exit 1
  fi
}

write_conf_file() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/site-lightning-conf.XXXXXX")
  cat > "$tmp" <<EOF_CONF
network=bitcoin
alias=$site_user
bitcoin-rpcconnect=127.0.0.1
bitcoin-datadir=$(bitcoin_data_dir)
bind-addr=0.0.0.0:$(public_port)
announce-addr=$(resolve_public_host):$(public_port)
log-file=$(lightning_logs_dir)/lightningd.log
EOF_CONF
  run_root install -d -o "$site_user" -g "$site_user" -m 700 "$(lightning_root)"
  run_root install -d -o "$site_user" -g "$site_user" -m 700 "$(lightning_logs_dir)"
  run_root install -o "$site_user" -g "$site_user" -m 600 "$tmp" "$(lightning_conf_file)"
  rm -f "$tmp"
}

ensure_firewall_port() {
  if ! command -v ufw >/dev/null 2>&1; then
    return 0
  fi
  if ! run_root ufw status 2>/dev/null | grep -Fq 'Status: active'; then
    return 0
  fi
  run_root ufw allow "$(public_port)/tcp" comment "Headquarters Lightning $site_user" >/dev/null 2>&1 || true
}

write_service_file() {
  lightningd_bin=$(lightningd_binary)
  [ -n "$lightningd_bin" ] || {
    status_bad "lightningd is not installed on this server."
    exit 1
  }
  tmp=$(mktemp "${TMPDIR:-/tmp}/site-lightning-service.XXXXXX")
  cat > "$tmp" <<EOF_SERVICE
[Unit]
Description=Headquarters Core Lightning for $site_user
Requires=$(bitcoin_service_name).service
After=$(bitcoin_service_name).service

[Service]
Type=simple
User=$site_user
Group=$site_user
WorkingDirectory=$(site_home)
ExecStart=$lightningd_bin --lightning-dir=$(lightning_root)
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
  lightning_cli_bin=$(lightning_cli_binary)
  [ -n "$lightning_cli_bin" ] || return 1
  attempts=0
  while [ "$attempts" -lt 90 ]; do
    if "$lightning_cli_bin" --lightning-dir="$(lightning_root)" getinfo >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  return 1
}

journal_has_chain_rewind() {
  command -v journalctl >/dev/null 2>&1 || return 1
  run_root sh -eu -c '
journalctl -u "$1" -n 120 --no-pager 2>/dev/null | grep -Fq "bitcoind has gone backwards"
' sh "$(service_name)"
}

repair_chain_rewind() {
  run_root systemctl stop "$(service_name)" >/dev/null 2>&1 || true
  run_root rm -rf "$(lightning_network_dir)"
  run_root systemctl start "$(service_name)"
}

check_status() {
  require_site_context
  lightningd_bin=$(lightningd_binary)
  lightning_cli_bin=$(lightning_cli_binary)
  [ -n "$lightningd_bin" ] || {
    status_bad "lightningd is not installed on this server."
    return 0
  }
  [ -n "$lightning_cli_bin" ] || {
    status_bad "lightning-cli is not installed on this server."
    return 0
  }
  [ -f "$(lightning_conf_file)" ] || {
    status_bad "The site Lightning config file is missing."
    return 0
  }
  [ -f "$(service_file)" ] || {
    status_bad "The site Lightning systemd service is missing."
    return 0
  }
  command -v systemctl >/dev/null 2>&1 || {
    status_bad "systemctl is required for Lightning node provisioning."
    return 0
  }
  if ! run_root systemctl is-active --quiet "$(bitcoin_service_name)"; then
    status_bad "Bitcoin Core service $(bitcoin_service_name) is not active."
    return 0
  fi
  if ! run_root systemctl is-active --quiet "$(service_name)"; then
    status_bad "Lightning service $(service_name) is not active."
    return 0
  fi
  if ! wait_for_rpc; then
    status_bad "Lightning RPC is not responding for $(service_name)."
    return 0
  fi
  status_ok "Core Lightning is provisioned for $site_user via $(service_name) at $(resolve_public_host):$(public_port)."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
[ -f "$(active_site_conf)" ] || {
  status_bad "The active site.conf file is missing."
  exit 1
}
[ -f "$(release_site_conf)" ] || {
  status_bad "The managed release site.conf file is missing."
  exit 1
}
ensure_lightning_installed
write_conf_file
write_conf_value "$(active_site_conf)" lightning_public_host "$(resolve_public_host)"
write_conf_value "$(active_site_conf)" lightning_public_port "$(public_port)"
write_conf_value "$(release_site_conf)" lightning_public_host "$(resolve_public_host)"
write_conf_value "$(release_site_conf)" lightning_public_port "$(public_port)"
write_service_file
run_root systemctl daemon-reload
run_root systemctl enable --now "$(service_name)"
ensure_firewall_port
if ! wait_for_rpc; then
  if journal_has_chain_rewind; then
    repair_chain_rewind
  fi
fi
if ! wait_for_rpc; then
  status_bad "Core Lightning did not become ready after provisioning."
  exit 1
fi
status_ok "Core Lightning is provisioned for $site_user via $(service_name)."
