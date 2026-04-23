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
    status_bad "HQ_SITE_USER is required for watchtower scaffolding."
    exit 1
  }
}

site_home() {
  printf '/home/%s\n' "$site_user"
}

watchtower_root() {
  printf '%s/.sitedata/site/watchtower\n' "$(site_home)"
}

watchtower_env_file() {
  printf '%s/remote-watchtower.env.sample\n' "$(watchtower_root)"
}

watchtower_notes_file() {
  printf '%s/README.md\n' "$(watchtower_root)"
}

lightning_root() {
  printf '%s/.sitedata/site/lightning\n' "$(site_home)"
}

current_lightning_pubkey() {
  if ! command -v lightning-cli >/dev/null 2>&1; then
    return 1
  fi
  run_site sh -eu -c '
lightning_dir=$1
lightning-cli --lightning-dir="$lightning_dir" getinfo 2>/dev/null | awk -F"\"" "/\"id\"/ { print \$4; exit }"
' sh "$(lightning_root)"
}

read_conf_value() {
  file=$1
  key=$2
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, "", $0); print $0; exit }' "$file" 2>/dev/null || true
}

active_site_conf() {
  printf '%s/site/site.conf\n' "$(site_home)"
}

lightning_node_host() {
  value=$(read_conf_value "$(active_site_conf)" lightning_public_host | tr -d '\r\n[:space:]')
  [ -n "$value" ] || value=${site_domain-}
  printf '%s\n' "$value"
}

lightning_node_port() {
  value=$(read_conf_value "$(active_site_conf)" lightning_public_port | tr -d '\r\n[:space:]')
  case "$value" in
    ''|*[!0-9]*) value='' ;;
  esac
  [ -n "$value" ] || value=9735
  printf '%s\n' "$value"
}

check_status() {
  require_site_context
  [ -f "$(watchtower_env_file)" ] || {
    status_bad "Remote watchtower scaffolding has not been prepared yet."
    return 0
  }
  status_bad "Remote watchtower scaffolding is prepared at $(watchtower_root), but no separate watchtower host has been provisioned yet."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
run_root install -d -o "$site_user" -g "$site_user" -m 755 "$(watchtower_root)"
node_pubkey=$(current_lightning_pubkey 2>/dev/null || printf '')

tmp_env=$(mktemp "${TMPDIR:-/tmp}/watchtower-remote-env.XXXXXX")
cat > "$tmp_env" <<EOF_ENV
# Fill these values in when you choose the separate host that will run your watchtower.
TARGET_HOST=
TARGET_SSH_USER=
TARGET_SSH_PORT=22
SITE_DOMAIN=${site_domain-}
LIGHTNING_NODE_HOST=$(lightning_node_host)
LIGHTNING_NODE_PORT=$(lightning_node_port)
LIGHTNING_NODE_PUBKEY=$node_pubkey
EOF_ENV
run_root install -o "$site_user" -g "$site_user" -m 0640 "$tmp_env" "$(watchtower_env_file)"
rm -f "$tmp_env"

tmp_notes=$(mktemp "${TMPDIR:-/tmp}/watchtower-remote-notes.XXXXXX")
cat > "$tmp_notes" <<'EOF_NOTES'
# Remote Watchtower Scaffold

This directory is a handoff point for a future separate watchtower host.

Recommended next step:

1. Pick the separate always-on host for the watchtower.
2. Copy the values from `remote-watchtower.env.sample`.
3. Provision the actual watchtower from Headquarters once the target host is ready.

This scaffold does not deploy a watchtower on its own.
EOF_NOTES
run_root install -o "$site_user" -g "$site_user" -m 0644 "$tmp_notes" "$(watchtower_notes_file)"
rm -f "$tmp_notes"

status_ok "Remote watchtower scaffolding is ready at $(watchtower_root), but no remote watchtower has been provisioned yet."
