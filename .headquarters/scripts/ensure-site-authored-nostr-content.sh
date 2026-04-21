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
    status_bad "HQ_SITE_USER is required for authored Nostr content sync."
    exit 1
  }
}

site_home() {
  printf '/home/%s\n' "$site_user"
}

site_root() {
  printf '%s/site\n' "$(site_home)"
}

site_sync_script() {
  printf '%s/cgi/blog-sync-authored-nostr\n' "$(site_root)"
}

site_sync_script_available() {
  sync_path=$(site_sync_script)
  run_root test -x "$sync_path"
}

output_summary_line() {
  printf '%s\n' "${1-}" | awk 'NF { print; exit }'
}

extract_output_value() {
  key=$1
  output=${2-}
  printf '%s\n' "$output" | awk -F= -v key="$key" '$1 == key { print $2; exit }'
}

normalize_nonnegative_int() {
  value=$(printf '%s' "${1-}" | tr -d '\r\n[:space:]')
  case "$value" in
    ''|*[!0-9]*) return 1 ;;
  esac
  printf '%s\n' "$value"
}

run_site_sync() {
  mode=${1-}
  sync_path=$(site_sync_script)
  site_home_path=$(site_home)
  run_root sh -eu -c '
sync_path=$1
site_home=$2
site_user=$3
mode=$4
if command -v sudo >/dev/null 2>&1; then
  if [ -n "$mode" ]; then
    exec sudo -u "$site_user" env HOME="$site_home" WIZARDRY_SITES_DIR="$site_home" WIZARDRY_SITE_NAME=site "$sync_path" "$mode"
  fi
  exec sudo -u "$site_user" env HOME="$site_home" WIZARDRY_SITES_DIR="$site_home" WIZARDRY_SITE_NAME=site "$sync_path"
fi
if command -v su >/dev/null 2>&1; then
  su - "$site_user" -s /bin/sh -c '\''sync_path=$1
site_home=$2
mode=$3
export HOME="$site_home"
export WIZARDRY_SITES_DIR="$site_home"
export WIZARDRY_SITE_NAME=site
if [ -n "$mode" ]; then
  exec "$sync_path" "$mode"
fi
exec "$sync_path"
'\'' sh "$sync_path" "$site_home" "$mode"
  exit $?
fi
export HOME="$site_home"
export WIZARDRY_SITES_DIR="$site_home"
export WIZARDRY_SITE_NAME=site
if [ -n "$mode" ]; then
  exec "$sync_path" "$mode"
fi
exec "$sync_path"
' sh "$sync_path" "$site_home_path" "$site_user" "$mode"
}

run_site_public_post_count() {
  set +e
  output=$(run_site_sync --count-public-posts 2>/dev/null)
  count_rc=$?
  set -e
  if [ "$count_rc" -ne 0 ]; then
    printf '0\n'
    return 0
  fi
  posts_total=$(extract_output_value posts_total "$output")
  posts_total=$(normalize_nonnegative_int "$posts_total" 2>/dev/null || printf '0')
  printf '%s\n' "$posts_total"
}

check_status() {
  require_site_context
  if ! site_sync_script_available; then
    status_bad "Deployed authored Nostr sync script is missing at $(site_sync_script)."
    return 0
  fi
  set +e
  output=$(run_site_sync --check 2>&1)
  check_rc=$?
  set -e
  if [ "$check_rc" -ne 0 ]; then
    summary=$(output_summary_line "$output")
    [ -n "$summary" ] || summary="Authored Nostr content is not fully synced to upstream relays yet."
    status_bad "$summary"
    return 0
  fi

  posts_total=$(extract_output_value posts_total "$output")
  posts_total=$(normalize_nonnegative_int "$posts_total" 2>/dev/null || run_site_public_post_count)
  status_ok "Authored Nostr content is synced for $site_user (${posts_total} public posts plus contact metadata)."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
if ! site_sync_script_available; then
  status_bad "Deployed authored Nostr sync script is missing at $(site_sync_script)."
  exit 1
fi

set +e
output=$(run_site_sync 2>&1)
install_rc=$?
set -e
if [ "$install_rc" -ne 0 ]; then
  summary=$(output_summary_line "$output")
  [ -n "$summary" ] || summary="Could not sync authored Nostr content to upstream relays."
  status_bad "$summary"
  exit 1
fi

posts_total=$(extract_output_value posts_total "$output")
posts_total=$(normalize_nonnegative_int "$posts_total" 2>/dev/null || run_site_public_post_count)
posts_updated=$(extract_output_value posts_updated "$output")
posts_updated=$(normalize_nonnegative_int "$posts_updated" 2>/dev/null || printf '')

if [ -n "$posts_updated" ]; then
  status_ok "Authored Nostr content is synced for $site_user (${posts_updated} updated, ${posts_total} total public posts plus contact metadata)."
  exit 0
fi

status_ok "Authored Nostr content is synced for $site_user (${posts_total} public posts plus contact metadata)."
exit 0
