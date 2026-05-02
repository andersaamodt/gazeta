#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
SITE_SOURCE_ROOT="$ROOT_DIR/site"

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
  if printf '%s' "$haystack" | grep -Fq -- "$needle"; then
    pass
  else
    fail "$label (missing: $needle)"
  fi
}

assert_file_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    pass
  else
    fail "$label (missing: $needle in $file)"
  fi
}

assert_file_not_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    fail "$label (unexpected: $needle in $file)"
  else
    pass
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
export SCRIPT_DIR="$ROOT_DIR/cgi"

. "$ROOT_DIR/cgi/blog-lib.sh"
. "$ROOT_DIR/cgi/blog-secure-chat-common.sh"

blog_init
blog_secure_chat_init_storage

store_dir=$(blog_secure_chat_store_dir)
contacts_dir=$(blog_secure_chat_contacts_dir)
assert_nonempty "$store_dir" 'secure chat store dir is available'

saved_path=$PATH
PATH="$BIN_DIR:/bin:/usr/bin"
cat > "$SITE_ROOT/site.conf" <<'EOFCONF'
secure_chat_node_binary=/tmp/definitely-missing-node
EOFCONF
if blog_secure_chat_service_start; then
  fail 'secure chat service start fails fast when node runtime is unavailable'
else
  pass
fi
PATH=$saved_path
assert_file_contains "$(blog_secure_chat_log_path)" 'Node.js runtime is not installed or configured.' 'service start logs missing node runtime clearly'

custom_node="$TMP_ROOT/custom-node"
mkdir -p "$(dirname "$custom_node")"
cat > "$custom_node" <<'EOS'
#!/bin/sh
exit 0
EOS
chmod +x "$custom_node"
cat > "$SITE_ROOT/site.conf" <<EOFCONF
secure_chat_node_binary=$custom_node
secure_chat_simplex_binary=/tmp/custom-simplex-chat
EOFCONF

node_bin=$(blog_secure_chat_node_binary)
assert_eq "$custom_node" "$node_bin" 'secure chat node binary honors site config override'

simplex_bin=$(blog_secure_chat_simplex_binary)
assert_eq "/tmp/custom-simplex-chat" "$simplex_bin" 'secure chat simplex binary honors site config override'

native_module_root=$(blog_secure_chat_native_module_root)
assert_eq "$SITE_DATA/secure-chat/runtime/native-driver" "$native_module_root" 'secure chat native driver root defaults to persistent site runtime storage'

launch_path=$(blog_secure_chat_launch_path "$custom_node" "/tmp/custom-simplex-chat")
assert_contains "$launch_path" "$(dirname "$custom_node")" 'secure chat launch path includes node binary directory'
assert_contains "$launch_path" '/tmp' 'secure chat launch path includes simplex binary directory'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '--create-bot-display-name' 'secure chat service auto-creates a bot user on fresh SimpleX state'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '--create-bot-allow-files' 'secure chat service enables files for the bootstrap bot user'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'WebSocketImpl.OPEN' 'secure chat service uses the active websocket implementation for ready-state checks'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "node_modules', 'simplex-chat'" 'secure chat service can load the official native SimpleX Node API from a persistent runtime root'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'apiCreateUserAddress' 'secure chat service provisions an owner contact address with the native SimpleX API'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'apiConnectPlan' 'secure chat service prepares bridge contact connections with the native SimpleX API'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'contactReadyForSend' 'secure chat service waits for send-ready direct contacts before provisioning completes'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'chat.sendChatCmd(`/_send ${chatRef} json ' 'secure chat native send path uses the raw controller command shape'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "driverType: 'unknown'" 'secure chat service tracks the active SimpleX driver'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '/create user ' 'secure chat service provisions bridge identities with the current SimpleX create-user command'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "state.simplexProcess.kill('SIGTERM')" 'secure chat service shuts down its child simplex process on daemon exit'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'SECURE_CHAT_SIMPLEX_NATIVE_MODULE_ROOT' 'secure chat launcher passes the persistent native driver root to the daemon'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-install-native-driver.sh" 'npm install --omit=dev' 'secure chat native driver installer provisions the official package into persistent runtime storage'
assert_file_contains "$ROOT_DIR/cgi/secure-chat-native-driver/package.json" '"simplex-chat": "6.5.0"' 'secure chat native driver package pins the official SimpleX Node module version'

restart_kill_log="$TMP_ROOT/restart-kill.log"
restart_pid_path=$(blog_secure_chat_pid_path)
printf '12345\n' > "$restart_pid_path"
MOCK_SERVICE_RESTART=1
MOCK_PID_ALIVE=1
blog_secure_chat_service_ping() {
  if [ "${MOCK_SERVICE_RESTART:-0}" = 1 ]; then
    [ "${MOCK_PID_ALIVE:-0}" = 1 ] || return 0
    return 0
  fi
  return 1
}
ps() {
  if [ "${MOCK_SERVICE_RESTART:-0}" = 1 ]; then
    printf '%s\n' '/old/release/cgi/blog-secure-chat-service.js'
    return 0
  fi
  command ps "$@"
}
kill() {
  if [ "${MOCK_SERVICE_RESTART:-0}" = 1 ]; then
    if [ "${1-}" = '-0' ]; then
      [ "${MOCK_PID_ALIVE:-0}" = 1 ]
      return $?
    fi
    printf '%s\n' "$*" >> "$restart_kill_log"
    MOCK_PID_ALIVE=0
    return 0
  fi
  command kill "$@"
}
sleep() {
  if [ "${MOCK_SERVICE_RESTART:-0}" = 1 ]; then
    return 0
  fi
  command sleep "$@"
}
blog_secure_chat_service_start
MOCK_SERVICE_RESTART=0
assert_file_contains "$restart_kill_log" '12345' 'secure chat service restarts daemon when current pid belongs to an older release'
new_pid=$(cat "$restart_pid_path" 2>/dev/null || printf '')
case "$new_pid" in
  ''|12345) fail 'secure chat service writes a new pid after restarting an older release daemon' ;;
  *) pass ;;
esac

blog_secure_chat_mapping_upsert "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" "101" "active"
blog_secure_chat_mapping_upsert "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" "202" "active"
mapping_json=$(blog_secure_chat_mapping_json "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
assert_contains "$mapping_json" '"simplex_contact_id":"202"' 'mapping upsert updates existing npub row'

mapping_count=$(find "$contacts_dir" -type f -name '*.json' | wc -l | tr -d '[:space:]')
assert_eq "1" "$mapping_count" 'npub uniqueness constraint prevents duplicates'

blog_secure_chat_mapping_mark_inactive "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
inactive_json=$(blog_secure_chat_mapping_json "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
assert_contains "$inactive_json" '"status":"inactive"' 'mapping can be deactivated'

blog_secure_chat_mapping_delete "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
deleted_json=$(blog_secure_chat_mapping_json "npub1aliceexamplexxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
assert_eq "" "$deleted_json" 'mapping delete clears reprovision target'

if blog_secure_chat_mapping_upsert '../escape' '303' 'active'; then
  fail 'path-shaped npub is rejected by file-backed mapping store'
else
  pass
fi
escaped_count=$(find "$store_dir" -type f | wc -l | tr -d '[:space:]')
assert_eq "0" "$escaped_count" 'invalid npub does not create stray secure chat files'

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

request_url_from_script=$(
  HTTP_HOST='localhost:8093' \
  SCRIPT_FILENAME="$ROOT_DIR/cgi/blog-secure-chat-state" \
  blog_secure_chat_request_url
)
assert_eq "http://localhost:8093/cgi/blog-secure-chat-state" "$request_url_from_script" 'request url falls back to script filename when request uri is missing'

request_url_from_origin=$(
  SERVER_NAME='new.andersaamodt.com' \
  HTTP_ORIGIN='http://localhost:8093' \
  SCRIPT_FILENAME="$ROOT_DIR/cgi/blog-secure-chat-state" \
  blog_secure_chat_request_url
)
assert_eq "http://localhost:8093/cgi/blog-secure-chat-state" "$request_url_from_origin" 'request url prefers browser origin when host is rewritten by managed server config'

headers_out=$(HTTPS=on blog_send_json_headers)
assert_contains "$headers_out" 'HEADER:Strict-Transport-Security=max-age=31536000; includeSubDomains; preload' 'json headers emit HSTS on secure requests'

assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-state" 'blog_secure_chat_require_authenticated_request' 'state endpoint requires signed authenticated requests'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'blog_secure_chat_require_authenticated_request' 'send endpoint requires signed authenticated requests'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-upload" 'blog_secure_chat_require_authenticated_request' 'upload endpoint requires signed authenticated requests'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-admin" 'blog_require_session true' 'admin endpoint requires admin session'
assert_file_not_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'new DatabaseSync' 'service no longer uses sqlite-backed storage'
assert_file_not_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'sqlite3 ' 'cgi helper no longer depends on sqlite shell access'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'SECURE_CHAT_STORE_DIR' 'service uses file-backed store root env'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'WebSocketImpl' 'service resolves a usable local WebSocket implementation'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/simplex-web-default-chat.js' 'contact page loads shared simplex-web renderer'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/simplex-web-session-store.js' 'contact page loads shared simplex-web session store'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'SimplexWebDefaultChat' 'shared simplex-web renderer is vendored into nostr-blog'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-session-store.js" 'SimplexWebSessionStore' 'shared simplex-web session store is vendored into nostr-blog'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '/cgi/blog-secure-chat-state' 'contact page polls secure chat state'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '/cgi/blog-secure-chat-send' 'contact page sends secure chat messages'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '/cgi/blog-secure-chat-upload' 'contact page uploads secure chat attachments'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'window.SimplexWebDefaultChat' 'contact page uses shared simplex-web renderer when available'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'window.SimplexWebSessionStore' 'contact page uses shared simplex-web session store when available'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'Secure Chat' 'contact page renders secure chat UI'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'window.blogAuth.startLogin' 'secure chat login prefers the shared Nostr login flow'
assert_file_contains "$ROOT_DIR/cgi/ssh-auth-check-session" 'simplex_contact_info' 'session bootstrap exposes SimpleX account info'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'account-simplex-contact' 'account page renders SimpleX contact field'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
