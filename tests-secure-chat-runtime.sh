#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

assert_eq() {
  expected=$1
  actual=$2
  label=$3
  if [ "$actual" = "$expected" ]; then
    pass
  else
    fail "$label (expected: $expected, actual: $actual)"
  fi
}

assert_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    pass
  else
    fail "$label (missing: $needle)"
  fi
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

assert_nonempty() {
  value=$1
  label=$2
  if [ -n "$value" ]; then
    pass
  else
    fail "$label (value empty)"
  fi
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/secure-chat-runtime.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=testsite
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
SITE_DATA="$SITES_DIR/.sitedata/$SITE_NAME"
BIN_DIR="$TMP_ROOT/bin"

mkdir -p "$SITE_ROOT/site/pages" "$SITE_DATA" "$BIN_DIR"

cat > "$BIN_DIR/http-status" <<'EOS'
#!/bin/sh
printf 'STATUS:%s\n' "$*"
EOS
chmod +x "$BIN_DIR/http-status"

cat > "$BIN_DIR/http-header" <<'EOS'
#!/bin/sh
printf 'HEADER:%s=%s\n' "$1" "$2"
EOS
chmod +x "$BIN_DIR/http-header"

cat > "$BIN_DIR/http-end-headers" <<'EOS'
#!/bin/sh
printf 'END-HEADERS\n'
EOS
chmod +x "$BIN_DIR/http-end-headers"

cat > "$BIN_DIR/http-ok-html" <<'EOS'
#!/bin/sh
printf 'OK-HTML\n'
EOS
chmod +x "$BIN_DIR/http-ok-html"

cat > "$BIN_DIR/config-get" <<'EOS'
#!/bin/sh
set -eu
file=${1-}
key=${2-}
[ -f "$file" ] || exit 1
line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)
[ -n "$line" ] || exit 1
printf '%s\n' "${line#*=}"
EOS
chmod +x "$BIN_DIR/config-get"

cat > "$BIN_DIR/config-set" <<'EOS'
#!/bin/sh
set -eu
file=${1-}
key=${2-}
val=${3-}
mkdir -p "$(dirname "$file")"
if [ -f "$file" ]; then
  grep -v -E "^${key}=" "$file" > "$file.tmp" || true
else
  : > "$file.tmp"
fi
printf '%s=%s\n' "$key" "$val" >> "$file.tmp"
mv "$file.tmp" "$file"
EOS
chmod +x "$BIN_DIR/config-set"

cat > "$BIN_DIR/nak" <<'EOS'
#!/bin/sh
set -eu
case "${1-}" in
  help|--help)
    printf 'nak verify\n'
    ;;
  verify)
    payload=$(cat)
    case "$payload" in
      *'"sig":"valid"'*) exit 0 ;;
      *) exit 1 ;;
    esac
    ;;
  *)
    exit 1
    ;;
esac
EOS
chmod +x "$BIN_DIR/nak"

export PATH="$BIN_DIR:$PATH"
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"

. "$ROOT_DIR/cgi/blog-lib.sh"
. "$ROOT_DIR/cgi/blog-secure-chat-common.sh"

blog_init
blog_secure_chat_init_storage

db_path=$(blog_secure_chat_db_path)
assert_nonempty "$db_path" 'secure chat db path is available'

blog_secure_chat_mapping_upsert "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" "101" "active"
blog_secure_chat_mapping_upsert "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" "202" "active"
mapping_json=$(blog_secure_chat_mapping_json "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
assert_contains "$mapping_json" '"simplex_contact_id":"202"' 'mapping upsert updates existing npub row'

mapping_count=$(sqlite3 "$db_path" "select count(*) from secure_chat_contacts where npub = 'npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';")
assert_eq "1" "$mapping_count" 'npub uniqueness constraint prevents duplicates'

blog_secure_chat_mapping_mark_inactive "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
inactive_json=$(blog_secure_chat_mapping_json "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
assert_contains "$inactive_json" '"status":"inactive"' 'mapping can be deactivated'

blog_secure_chat_mapping_delete "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
deleted_json=$(blog_secure_chat_mapping_json "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
assert_eq "" "$deleted_json" 'mapping delete clears reprovision target'

now_epoch=$(date +%s)
valid_event=$(jq -cn \
  --arg pubkey "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  --arg method "POST" \
  --arg url "https://blog.example.com/cgi/blog-secure-chat-send" \
  --argjson created_at "$now_epoch" \
  '{kind:27235,pubkey:$pubkey,created_at:$created_at,tags:[["u",$url],["method",$method]],content:"",sig:"valid"}')

if blog_secure_chat_verify_nip98_event_json "$valid_event" "POST" "https://blog.example.com/cgi/blog-secure-chat-send" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" 300; then
  pass
else
  fail 'valid nip-98 style auth event verifies'
fi

if blog_secure_chat_verify_nip98_event_json "$valid_event" "GET" "https://blog.example.com/cgi/blog-secure-chat-send" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" 300; then
  fail 'method mismatch rejects nip-98 event'
else
  pass
fi

stale_event=$(jq -cn \
  --arg pubkey "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
  --arg method "POST" \
  --arg url "https://blog.example.com/cgi/blog-secure-chat-send" \
  --argjson created_at "$((now_epoch - 301))" \
  '{kind:27235,pubkey:$pubkey,created_at:$created_at,tags:[["u",$url],["method",$method]],content:"",sig:"valid"}')

if blog_secure_chat_verify_nip98_event_json "$stale_event" "POST" "https://blog.example.com/cgi/blog-secure-chat-send" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" 300; then
  fail 'stale nip-98 event is rejected'
else
  pass
fi

headers_out=$(HTTPS=on blog_send_json_headers)
assert_contains "$headers_out" 'HEADER:Strict-Transport-Security=max-age=31536000; includeSubDomains; preload' 'json headers emit HSTS on secure requests'

assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-state" 'blog_secure_chat_require_authenticated_request' 'state endpoint requires signed authenticated requests'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'blog_secure_chat_require_authenticated_request' 'send endpoint requires signed authenticated requests'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-upload" 'blog_secure_chat_require_authenticated_request' 'upload endpoint requires signed authenticated requests'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-admin" 'blog_require_session true' 'admin endpoint requires admin session'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'new DatabaseSync' 'service uses sqlite-backed storage'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'new WebSocket(' 'service opens local SimpleX websocket transport'
assert_file_contains "$ROOT_DIR/static/contact-page.js" '/cgi/blog-secure-chat-state' 'contact page polls secure chat state'
assert_file_contains "$ROOT_DIR/static/contact-page.js" '/cgi/blog-secure-chat-send' 'contact page sends secure chat messages'
assert_file_contains "$ROOT_DIR/static/contact-page.js" '/cgi/blog-secure-chat-upload' 'contact page uploads secure chat attachments'
assert_file_contains "$ROOT_DIR/static/contact-page.js" 'Secure Chat' 'contact page renders secure chat UI'
assert_file_contains "$ROOT_DIR/cgi/ssh-auth-check-session" 'simplex_contact_info' 'session bootstrap exposes SimpleX account info'
assert_file_contains "$ROOT_DIR/pages/admin.md" 'account-simplex-contact' 'account page renders SimpleX contact field'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
