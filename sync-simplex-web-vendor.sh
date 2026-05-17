#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
SIMPLEX_WEB_ROOT=${SIMPLEX_WEB_ROOT:-"$ROOT_DIR/../simplex-web"}

if [ ! -d "$SIMPLEX_WEB_ROOT/src" ]; then
  printf 'simplex-web source root not found: %s\n' "$SIMPLEX_WEB_ROOT" >&2
  exit 1
fi

copy_file() {
  src=$1
  dest=$2
  if [ ! -f "$src" ]; then
    printf 'missing source file: %s\n' "$src" >&2
    exit 1
  fi
  cp "$src" "$dest"
}

copy_file "$SIMPLEX_WEB_ROOT/src/default-chat.js" "$ROOT_DIR/site/static/simplex-web-default-chat.js"
copy_file "$SIMPLEX_WEB_ROOT/src/session-store.js" "$ROOT_DIR/site/static/simplex-web-session-store.js"
copy_file "$SIMPLEX_WEB_ROOT/src/transport.js" "$ROOT_DIR/site/static/simplex-web-transport.js"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-smp-core.mjs" "$ROOT_DIR/site/static/browser-smp-core.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-simplex-agent.mjs" "$ROOT_DIR/site/static/browser-simplex-agent.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-simplex-client.mjs" "$ROOT_DIR/site/static/browser-simplex-client.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-simplex-contact-client.mjs" "$ROOT_DIR/site/static/browser-simplex-contact-client.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-simplex-native-ratchet.mjs" "$ROOT_DIR/site/static/browser-simplex-native-ratchet.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-simplex-ratchet.mjs" "$ROOT_DIR/site/static/browser-simplex-ratchet.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-simplex-scheduler.mjs" "$ROOT_DIR/site/static/browser-simplex-scheduler.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-simplex-store.mjs" "$ROOT_DIR/site/static/browser-simplex-store.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-simplex-web-transport-adapter.mjs" "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-smp-native-tls-relay.mjs" "$ROOT_DIR/site/static/browser-smp-native-tls-relay.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-smp-server-profile.mjs" "$ROOT_DIR/site/static/browser-smp-server-profile.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-smp-websocket-transport.mjs" "$ROOT_DIR/site/static/browser-smp-websocket-transport.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-xftp-core.mjs" "$ROOT_DIR/site/static/browser-xftp-core.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-xftp-client.mjs" "$ROOT_DIR/site/static/browser-xftp-client.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-xftp-http-transport.mjs" "$ROOT_DIR/site/static/browser-xftp-http-transport.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-xftp-server-profile.mjs" "$ROOT_DIR/site/static/browser-xftp-server-profile.mjs"
copy_file "$SIMPLEX_WEB_ROOT/src/browser-xftp-web-client.mjs" "$ROOT_DIR/site/static/browser-xftp-web-client.mjs"

printf 'ok\n'
