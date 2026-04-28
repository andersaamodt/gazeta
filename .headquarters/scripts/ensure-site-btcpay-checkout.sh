#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}
site_domain=${HQ_SITE_DOMAIN-}
btcpay_host=${HQ_BTCPAY_HOST:-pay.andersaamodt.com}
btcpay_rootpath=${HQ_BTCPAY_ROOTPATH:-/}

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
    status_bad "HQ_SITE_USER is required for BTCPay checkout wiring."
    exit 1
  }
  [ -n "$site_domain" ] || {
    status_bad "HQ_SITE_DOMAIN is required for BTCPay checkout wiring."
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

normalize_rootpath() {
  raw=${1-}
  raw=$(printf '%s' "$raw" | tr -d '\r\n' | sed -e 's#^[[:space:]]*##' -e 's#[[:space:]]*$##')
  case "$raw" in
    ''|'/') printf '/\n'; return 0 ;;
    *://*) raw=$(printf '%s' "$raw" | sed -e 's#^[A-Za-z][A-Za-z0-9+.-]*://[^/]*##') ;;
  esac
  raw=$(printf '%s' "$raw" | sed -e 's/[?#].*$//')
  case "$raw" in
    '') raw='/' ;;
    /*) ;;
    *) raw="/$raw" ;;
  esac
  raw=$(printf '%s' "$raw" | sed -e 's#//*#/#g' -e 's#/$##')
  [ -n "$raw" ] || raw='/'
  printf '%s\n' "$raw"
}

btcpay_url() {
  rootpath=$(normalize_rootpath "$btcpay_rootpath")
  if [ "$rootpath" = "/" ]; then
    printf 'https://%s\n' "$btcpay_host"
    return 0
  fi
  printf 'https://%s%s\n' "$btcpay_host" "$rootpath"
}

read_conf_value() {
  file=$1
  key=$2
  run_root awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, "", $0); print $0; exit }' "$file" 2>/dev/null || true
}

write_conf_value() {
  file=$1
  key=$2
  value=$3
  tmp=$(mktemp "${TMPDIR:-/tmp}/btcpay-checkout-conf.XXXXXX")
  run_root awk -F= -v key="$key" -v value="$value" '
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

ensure_webhook_secret() {
  file=$1
  current=$(read_conf_value "$file" payments_webhook_secret | tr -d '\r\n[:space:]')
  if [ -n "$current" ]; then
    printf '%s\n' "$current"
    return 0
  fi
  if command -v openssl >/dev/null 2>&1; then
    secret=$(openssl rand -hex 24)
  else
    secret=$(dd if=/dev/urandom bs=24 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n')
  fi
  write_conf_value "$file" payments_webhook_secret "$secret"
  printf '%s\n' "$secret"
}

write_site_config() {
  rootpath=$(normalize_rootpath "$btcpay_rootpath")
  for conf in "$(active_site_conf)" "$(release_site_conf)"; do
    run_root test -f "$conf" || {
      status_bad "Missing site config: $conf"
      exit 1
    }
    write_conf_value "$conf" btcpay_host "$btcpay_host"
    write_conf_value "$conf" btcpay_rootpath "$rootpath"
    write_conf_value "$conf" plugin_btcpay true
    ensure_webhook_secret "$conf" >/dev/null
  done
}

public_ready() {
  command -v curl >/dev/null 2>&1 || return 1
  curl -fsSI --max-time 12 "$(btcpay_url)/" >/dev/null 2>&1
}

check_status() {
  require_site_context
  rootpath=$(normalize_rootpath "$btcpay_rootpath")
  printf 'btcpay_host=%s\n' "$btcpay_host"
  printf 'btcpay_rootpath=%s\n' "$rootpath"
  printf 'btcpay_url=%s\n' "$(btcpay_url)"
  active_host=$(read_conf_value "$(active_site_conf)" btcpay_host)
  active_plugin=$(read_conf_value "$(active_site_conf)" plugin_btcpay)
  active_secret=$(read_conf_value "$(active_site_conf)" payments_webhook_secret | tr -d '\r\n[:space:]')
  if [ "$active_host" != "$btcpay_host" ]; then
    status_bad "The active site is not pointed at $btcpay_host yet."
    return 0
  fi
  if [ "$active_plugin" != "true" ]; then
    status_bad "The BTCPay plugin is not enabled in site config yet."
    return 0
  fi
  if [ -z "$active_secret" ]; then
    status_bad "The BTCPay webhook secret has not been generated yet."
    return 0
  fi
  if ! public_ready; then
    status_bad "BTCPay is not reachable at $(btcpay_url)/."
    return 0
  fi
  status_ok "BTCPay checkout is wired to $(btcpay_url)/ for $site_domain; API key/store authorization is completed from the site's BTCPay admin panel."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
write_site_config
check_status
