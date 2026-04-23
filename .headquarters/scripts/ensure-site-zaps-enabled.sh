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
    status_bad "HQ_SITE_USER is required for zap feature activation."
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

site_npub_file() {
  printf '%s/.sitedata/site/nostr/state/site_npub\n' "$(site_home)"
}

read_conf_value() {
  file=$1
  key=$2
  run_site awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, "", $0); print $0; exit }' "$file" 2>/dev/null || true
}

write_conf_value() {
  file=$1
  key=$2
  value=$3
  tmp=$(mktemp "${TMPDIR:-/tmp}/site-zaps-conf.XXXXXX")
  run_site awk -F= -v key="$key" -v value="$value" '
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

wallet_path_available() {
  zap_lud16=$(read_conf_value "$(active_site_conf)" zap_lud16 | tr -d '\r\n[:space:]')
  if [ -n "$zap_lud16" ]; then
    return 0
  fi
  site_npub=$(run_site sed -n '1p' "$(site_npub_file)" 2>/dev/null | tr -d '\r\n[:space:]')
  case "$site_npub" in
    npub1*) return 0 ;;
  esac
  return 1
}

check_status() {
  require_site_context
  if ! run_root test -f "$(active_site_conf)"; then
    status_bad "The active site.conf file is missing."
    return 0
  fi
  if ! run_root test -f "$(release_site_conf)"; then
    status_bad "The managed release site.conf file is missing."
    return 0
  fi
  if ! wallet_path_available; then
    status_bad "No configured Lightning Address or demo zap wallet is available yet."
    return 0
  fi
  if [ "$(read_conf_value "$(active_site_conf)" plugin_zaps)" != "true" ]; then
    status_bad "The active site config does not have plugin_zaps enabled."
    return 0
  fi
  if [ "$(read_conf_value "$(active_site_conf)" zaps_enabled)" != "true" ]; then
    status_bad "The active site config does not have zaps_enabled enabled."
    return 0
  fi
  if [ "$(read_conf_value "$(release_site_conf)" plugin_zaps)" != "true" ]; then
    status_bad "The managed release site config does not have plugin_zaps enabled."
    return 0
  fi
  if [ "$(read_conf_value "$(release_site_conf)" zaps_enabled)" != "true" ]; then
    status_bad "The managed release site config does not have zaps_enabled enabled."
    return 0
  fi
  status_ok "The zap feature is enabled in the managed site config for $site_user."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
if ! run_root test -f "$(active_site_conf)"; then
  status_bad "The active site.conf file is missing."
  exit 1
fi
if ! run_root test -f "$(release_site_conf)"; then
  status_bad "The managed release site.conf file is missing."
  exit 1
fi
if ! wallet_path_available; then
  status_bad "No configured Lightning Address or demo zap wallet is available yet."
  exit 1
fi
write_conf_value "$(active_site_conf)" plugin_zaps true
write_conf_value "$(active_site_conf)" zaps_enabled true
write_conf_value "$(release_site_conf)" plugin_zaps true
write_conf_value "$(release_site_conf)" zaps_enabled true
status_ok "The zap feature is enabled in the managed site config for $site_user."
