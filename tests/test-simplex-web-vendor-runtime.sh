#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
SIMPLEX_WEB_ROOT=${SIMPLEX_WEB_ROOT:-"$ROOT_DIR/../simplex-web"}

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

assert_file_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq "$needle" "$file"; then
    pass
  else
    fail "$label (missing: $needle in $file)"
  fi
}

assert_same_file() {
  left=$1
  right=$2
  label=$3
  if cmp -s "$left" "$right"; then
    pass
  else
    fail "$label ($left != $right)"
  fi
}

node --check "$ROOT_DIR/site/static/simplex-web-default-chat.js" >/dev/null 2>&1 || fail 'vendored default chat parses in Node'
node --check "$ROOT_DIR/site/static/simplex-web-session-store.js" >/dev/null 2>&1 || fail 'vendored session store parses in Node'
node --check "$ROOT_DIR/site/static/simplex-web-transport.js" >/dev/null 2>&1 || fail 'vendored transport parses in Node'
node --check "$ROOT_DIR/site/static/simplex-web-browser-adapter-init.mjs" >/dev/null 2>&1 || fail 'simplex-web browser adapter bootstrap parses in Node'
node --check "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" >/dev/null 2>&1 || fail 'vendored browser-native adapter parses in Node'
node --check "$ROOT_DIR/site/static/browser-smp-native-tls-relay.mjs" >/dev/null 2>&1 || fail 'vendored native SMP relay parses in Node'
node --check "$ROOT_DIR/site/static/browser-simplex-native-ratchet.mjs" >/dev/null 2>&1 || fail 'vendored native SimpleX ratchet parses in Node'
sh -n "$ROOT_DIR/sync-simplex-web-vendor.sh" >/dev/null 2>&1 || fail 'vendor sync helper parses in POSIX sh'

assert_file_contains "$ROOT_DIR/sync-simplex-web-vendor.sh" '../simplex-web' 'vendor sync helper defaults to sibling simplex-web repo'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'SimplexWebDefaultChat' 'vendored default chat exports renderer'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-session-store.js" 'SimplexWebSessionStore' 'vendored session store exports browser storage api'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-transport.js" 'SimplexWebTransport' 'vendored transport exports browser transport api'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-transport.js" 'registerBrowserTransport' 'vendored transport can register a browser-native adapter'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-transport.js" 'sendReadReceipt' 'vendored transport exposes read receipts'
assert_file_contains "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" 'createSimplexWebTransportAdapter' 'vendored browser-native adapter exports adapter factory'
assert_file_contains "$ROOT_DIR/site/static/browser-smp-native-tls-relay.mjs" 'createSmpNativeTlsRelayServer' 'vendored native SMP relay exposes a server factory'
assert_file_contains "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" 'sendReadReceipt' 'vendored browser-native adapter exposes read receipts'
assert_file_contains "$ROOT_DIR/site/static/browser-simplex-native-ratchet.mjs" 'createNativeSendingRatchet' 'vendored native SimpleX ratchet exposes sending state'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-browser-adapter-init.mjs" 'registerConfiguredSimplexWebTransport' 'browser adapter bootstrap registers configured simplex-web transport'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-browser-adapter-init.mjs" 'simplexWebSmpUrl' 'browser adapter bootstrap reads browser-native SMP endpoint configuration'

if [ -d "$SIMPLEX_WEB_ROOT/src" ]; then
  assert_same_file "$ROOT_DIR/site/static/simplex-web-default-chat.js" "$SIMPLEX_WEB_ROOT/src/default-chat.js" 'vendored default chat matches simplex-web source'
  assert_same_file "$ROOT_DIR/site/static/simplex-web-session-store.js" "$SIMPLEX_WEB_ROOT/src/session-store.js" 'vendored session store matches simplex-web source'
  assert_same_file "$ROOT_DIR/site/static/simplex-web-transport.js" "$SIMPLEX_WEB_ROOT/src/transport.js" 'vendored transport matches simplex-web source'
  assert_same_file "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" "$SIMPLEX_WEB_ROOT/src/browser-simplex-web-transport-adapter.mjs" 'vendored browser-native adapter matches simplex-web source'
  assert_same_file "$ROOT_DIR/site/static/browser-smp-native-tls-relay.mjs" "$SIMPLEX_WEB_ROOT/src/browser-smp-native-tls-relay.mjs" 'vendored native SMP relay matches simplex-web source'
  assert_same_file "$ROOT_DIR/site/static/browser-simplex-contact-client.mjs" "$SIMPLEX_WEB_ROOT/src/browser-simplex-contact-client.mjs" 'vendored browser-native contact client matches simplex-web source'
  assert_same_file "$ROOT_DIR/site/static/browser-simplex-native-ratchet.mjs" "$SIMPLEX_WEB_ROOT/src/browser-simplex-native-ratchet.mjs" 'vendored native SimpleX ratchet matches simplex-web source'
else
  pass
fi

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
