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

btcpay_repo_dir() {
  printf '%s/.sitedata/site/btcpay/btcpayserver-docker\n' "$(site_home)"
}

current_lightning_pubkey() {
  if [ ! -x "$(btcpay_repo_dir)/bitcoin-lightning-cli.sh" ]; then
    return 1
  fi
  run_root sh -eu -c '
repo_dir=$1
cd "$repo_dir"
./bitcoin-lightning-cli.sh getinfo 2>/dev/null | awk -F"\"" "/\"id\"/ { print \$4; exit }"
' sh "$(btcpay_repo_dir)"
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
LIGHTNING_NODE_HOST=${site_domain-}
LIGHTNING_NODE_PORT=9735
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
