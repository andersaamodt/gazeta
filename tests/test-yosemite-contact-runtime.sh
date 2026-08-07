#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)

assert_file_contains() {
  grep -Fq "$2" "$1" || { printf '%s\n' "missing Yosemite contact contract: $2" >&2; exit 1; }
}

assert_file_contains "$ROOT_DIR/site/lodestone/templates/contact.stone.html" '/static/contact-page.js'
if grep -Fq '/static/simplex-web-' "$ROOT_DIR/site/lodestone/templates/contact.stone.html"; then
  printf '%s\n' 'Contact template still loads deprecated SimpleX browser scripts' >&2
  exit 1
fi
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secure-chat-yosemite-frame'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'hasUsableSecureChatSession()'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" "params.set('nostr', pubkey)"
assert_file_contains "$ROOT_DIR/site/static/yosemite/app.js" 'WebGuestSession'
assert_file_contains "$ROOT_DIR/site/static/yosemite/app.js" '[Nostr ${nostrPubkey}]'
assert_file_contains "$ROOT_DIR/site/static/yosemite/index.html" 'Voice call'
assert_file_contains "$ROOT_DIR/site/static/yosemite/index.html" 'Video call'
assert_file_contains "$ROOT_DIR/site/static/yosemite/index.html" 'Attachment (optional, up to 10 GiB)'
assert_file_contains "$ROOT_DIR/cgi/blog-get-config" 'yosemite_descriptor_url'
assert_file_contains "$ROOT_DIR/cgi/blog-get-config" 'yosemite_call_relay_url'
assert_file_contains "$ROOT_DIR/cgi/blog-update-config" 'yosemite_descriptor_url'
assert_file_contains "$ROOT_DIR/site/lodestone/pages/admin.stone.html" 'yosemite-descriptor-url'
assert_file_contains "$ROOT_DIR/site/static/admin.js" 'yosemiteCallRelayUrl'

printf '%s\n' 'yosemite contact runtime: ok'
