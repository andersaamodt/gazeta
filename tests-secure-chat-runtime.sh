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

assert_not_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s' "$haystack" | grep -Fq -- "$needle"; then
    fail "$label (unexpected: $needle)"
  else
    pass
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
assert_eq "" "$native_module_root" 'secure chat native driver is disabled by default'

printf '%s\n' 'secure_chat_native_driver_enabled=true' >> "$SITE_ROOT/site.conf"
native_module_root=$(blog_secure_chat_native_module_root)
assert_eq "$SITE_DATA/secure-chat/runtime/native-driver" "$native_module_root" 'secure chat native driver root is available when explicitly enabled'

launch_path=$(blog_secure_chat_launch_path "$custom_node" "/tmp/custom-simplex-chat")
assert_contains "$launch_path" "$(dirname "$custom_node")" 'secure chat launch path includes node binary directory'
assert_contains "$launch_path" '/tmp' 'secure chat launch path includes simplex binary directory'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '--create-bot-display-name' 'secure chat service auto-creates a bot user on fresh SimpleX state'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '--create-bot-allow-files' 'secure chat service enables files for the bootstrap bot user'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '--yes-migrate' 'secure chat fallback simplex process confirms database migrations noninteractively'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'SERVICE_LOG_PATH' 'secure chat fallback simplex process writes diagnostics to the service log'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'sanitizeSimplexDisplayName' 'secure chat fallback removes invalid characters from SimpleX bot display names'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'state.simplexProcess = null' 'secure chat fallback can restart simplex after child process exit'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'finish(reject, err);' 'secure chat websocket retries settle before closing failed sockets'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'try { commandWs.close(); } catch (_closeErr) {}' 'secure chat command timeouts close their isolated websocket connection'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'owner_address_settings_skipped' 'secure chat CLI fallback does not block on optional owner address settings'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'ownerAddressCheckedUserId' 'secure chat CLI fallback does not repeat optional owner address setup every request'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'SECURE_CHAT_COMMAND_TIMEOUT_MS || 90000' 'secure chat allows bounded slow SimpleX provisioning commands'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'findExistingProvisionedContacts' 'secure chat provisioning recovers existing ready SimpleX bridge contacts'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'userExists' 'secure chat provisioning reuses existing bridge users after partial retries'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'sendPlainTextMessage' 'secure chat text sends use SimpleX text command instead of hanging json command'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'WebSocketImpl.OPEN' 'secure chat service uses the active websocket implementation for ready-state checks'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "node_modules', 'simplex-chat'" 'secure chat service can load the official native SimpleX Node API from a persistent runtime root'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'chat.started = true' 'secure chat native driver does not repeatedly start an already-running ChatApi'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'apiCreateUserAddress' 'secure chat service provisions an owner contact address with the native SimpleX API'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'apiDeleteUserAddress' 'secure chat service can recreate stale owner contact addresses during reprovisioning'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'owner_address_recreate_after_error' 'secure chat owner initialization recreates stale SimpleX addresses'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'owner_user_id_ignored_non_owner_profile' 'secure chat owner initialization ignores saved owner IDs that point at visitor bridge profiles'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'apiConnectPlan' 'secure chat service prepares bridge contact connections with the native SimpleX API'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'contactReadyForSend' 'secure chat service waits for send-ready direct contacts before provisioning completes'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'await setActiveUser(userId);' 'secure chat fallback activates a profile before listing its SimpleX contacts'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'await setActiveUser(ownerUserId);' 'secure chat fallback activates the owner profile before creating invitations'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'await setActiveUser(bridgeUserId);' 'secure chat fallback activates the bridge profile before accepting invitations'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'chat.sendChatCmd(`/_send ${chatRef} json ' 'secure chat native send path uses the raw controller command shape'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'SimpleX send failed' 'secure chat send errors include SimpleX chatError detail'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'freshMappingAfterSendFailure' 'secure chat send retries once with a fresh mapping after stale contact failures'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'send_retry_reprovision_mapping' 'secure chat send retry logs mapping reprovisioning'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '/_get chat @${bridgeContactId} count=${count}' 'secure chat service can reconcile recent direct chat history from SimpleX'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'upsertMessageByRef' 'secure chat service deduplicates reconciled chat items by SimpleX item id'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'text: row.text == null' 'secure chat service stores message text durably for Owl export after daemon restarts'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'withTransportLock' 'secure chat service serializes active-user transport operations during send and reconciliation'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'openCommandWsConnection' 'secure chat commands use fresh WebSocket connections instead of a stale shared command channel'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'sendCommandAsUser(activeUserId' 'secure chat sends activate the bridge user on the same WebSocket connection as the send command'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'envelope.corrId === corrId' 'secure chat command sockets ignore unsolicited events while waiting for their matching command response'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'closeSharedWsConnection();' 'secure chat command sockets close the shared event websocket before issuing command requests'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'sendPlainTextMessageViaChild(activeUserId, chatRef, text)' 'secure chat text sends use the production-verified isolated child command path'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'const WebSocket = globalThis.WebSocket' 'secure chat child sender uses the built-in Node WebSocket when available'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "throw new Error('Node.js WebSocket runtime is unavailable')" 'secure chat child sender reports missing WebSocket support clearly'
handle_send_prefix=$(sed -n '/async function handleSend/,/const tickets = \[\];/p' "$ROOT_DIR/cgi/blog-secure-chat-service.js")
if printf '%s' "$handle_send_prefix" | grep -Fq 'await ensureRuntime();'; then
  fail 'secure chat sends do not block on optional owner runtime warmup before using an active mapping'
else
  pass
fi
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'const rows = rawRows.filter(visibleMessageRow);' 'secure chat service filters protocol/system chat items from website message payloads'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'cursor_seq: cursorSeq' 'secure chat service returns a cursor sequence so polling can advance past hidden protocol items'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'owlExportPayload' 'secure chat service exposes an Owl Native export payload'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'OWL_EXPORT_RECONCILE_TIMEOUT_MS' 'Owl Native export bounds SimpleX reconciliation so queued messages return promptly'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'sendOwnerTextMessage' 'secure chat service can send Owl Native replies through the owner profile'
owl_send_block=$(sed -n '/async function sendOwnerTextMessage/,/function queueUploadTicket/p' "$ROOT_DIR/cgi/blog-secure-chat-service.js")
assert_contains "$owl_send_block" 'sendPlainTextMessage(String(owner.userId)' 'Owl Native replies use the production-verified plaintext SimpleX sender'
assert_not_contains "$owl_send_block" 'sendComposedMessages(String(owner.userId)' 'Owl Native replies avoid the SimpleX json send path that can hang'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'owl_send_reprovision_legacy_mapping' 'Owl send reprovisions legacy single-profile mappings before replying'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'String(mapping.bridge_user_id) === String(owner.userId)' 'Owl send rejects mappings where the bridge user is the owner identity'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'provision_retry_recreate_owner_address' 'secure chat provisioning retries with a fresh owner address if SimpleX reports a stale connection'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-export" 'WIZARDRY_SITE_NAME:=site' 'Owl export helper defaults CLI calls to the live site tenant'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'WIZARDRY_SITE_NAME:=site' 'Owl send helper defaults CLI calls to the live site tenant'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-export" 'WIZARDRY_SITES_DIR:=$HOME' 'Owl export helper defaults CLI calls to the single-site live root'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'WIZARDRY_SITES_DIR:=$HOME' 'Owl send helper defaults CLI calls to the single-site live root'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-export" 'blog-secure-chat-fast-owl-export.js' 'Owl export reads accepted website messages without waiting for the SimpleX service'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-fast-owl-export.js" "status: 'file-export'" 'fast Owl export reports file-backed export status'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'blog-secure-chat-fast-enqueue.js' 'secure chat CGI accepts text messages immediately when direct transport is unavailable'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-fast-enqueue.js" "delivery_status: 'accepted'" 'secure chat fast enqueue stores accepted outgoing messages without waiting for SimpleX provisioning'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "mapping.status !== 'active'" 'secure chat state skips SimpleX reconciliation for inactive mappings'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "delivery_status: 'accepted'" 'secure chat service records accepted outgoing text before transport dispatch'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '!existing.attachment_name && normalized.attachment_name' 'secure chat service preserves friendly attachment filenames when reconciliation sees daemon temp-path names'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "/^upl-[^-]+-/.test(String(attachmentName))" 'secure chat service restores friendly attachment names when older rows already contain daemon temp filenames'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "driverType: 'unknown'" 'secure chat service tracks the active SimpleX driver'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'sendChatCmd(command)' 'secure chat service uses the raw SimpleX create-user command when the native create-user wrapper is incompatible'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "state.simplexProcess.kill('SIGTERM')" 'secure chat service shuts down its child simplex process on daemon exit'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'SECURE_CHAT_SIMPLEX_NATIVE_MODULE_ROOT' 'secure chat launcher passes the persistent native driver root to the daemon'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-install-native-driver.sh" 'npm install --omit=dev' 'secure chat native driver installer provisions the official package into persistent runtime storage'
assert_file_contains "$ROOT_DIR/cgi/secure-chat-native-driver/package.json" '"simplex-chat": "6.5.0"' 'secure chat native driver package pins the official SimpleX Node module version'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'blog_secure_chat_service_request_json' 'send endpoint prints daemon json responses explicitly'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'blog-secure-chat-direct-send.js' 'send endpoint uses the isolated direct sender for text messages with active mappings'
assert_file_not_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'blog_secure_chat_service_request GET /health' 'send endpoint does not block on daemon health before direct SimpleX sends'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-direct-send.js" 'scd-${Date.now()}' 'direct sender correlates SimpleX WebSocket command responses'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-direct-send.js" 'sendTextSequential' 'direct sender can use the production-verified sequential SimpleX command flow'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" "attachments_json='[]'" 'send endpoint defaults omitted attachment metadata to an empty json array'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-state" 'blog_secure_chat_service_request_json' 'state endpoint prints daemon json responses explicitly'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-admin" 'blog_secure_chat_service_request_json' 'admin endpoint prints daemon json responses explicitly'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-upload" "printf '%s\\n' \"\$response\"" 'upload endpoint prints daemon json responses explicitly'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-export" 'blog-secure-chat-fast-owl-export.js' 'secure chat has a local Owl Native export helper'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'action:"owl-send"' 'secure chat has a local Owl Native send helper'

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

saved_service_request=$(command -v blog_secure_chat_service_request >/dev/null 2>&1 && printf yes || printf no)
if [ "$saved_service_request" = "yes" ]; then
  eval "$(printf '%s\n' 'blog_secure_chat_service_request() { printf '\''{"success":true,"uploads":[]}\n'\''; }')"
  service_json=$(blog_secure_chat_service_request_json POST /send /tmp/example application/json)
  assert_eq '{"success":true,"uploads":[]}' "$service_json" 'service request json helper returns daemon body'

  eval "$(printf '%s\n' 'blog_secure_chat_service_request() { return 0; }')"
  if blog_secure_chat_service_request_json POST /send /tmp/example application/json >/dev/null 2>&1; then
    fail 'service request json helper rejects empty daemon bodies'
  else
    pass
  fi
fi

headers_out=$(HTTPS=on blog_send_json_headers)
assert_contains "$headers_out" 'HEADER:Strict-Transport-Security=max-age=31536000; includeSubDomains; preload' 'json headers emit HSTS on secure requests'

assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-state" 'blog_secure_chat_require_authenticated_request' 'state endpoint requires signed authenticated requests'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'blog_secure_chat_require_authenticated_request' 'send endpoint requires signed authenticated requests'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-upload" 'blog_secure_chat_require_authenticated_request' 'upload endpoint requires signed authenticated requests'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-admin" 'blog_require_session true' 'admin endpoint requires admin session'
assert_file_not_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'new DatabaseSync' 'service no longer uses sqlite-backed storage'
assert_file_not_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'sqlite3 ' 'cgi helper no longer depends on sqlite shell access'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'rmdir "$lock_dir"' 'secure chat launcher recovers stale service-start locks'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'secure_chat_native_driver_enabled' 'native SimpleX driver is opt-in so broken installs do not mask CLI fallback'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'SECURE_CHAT_STORE_DIR' 'service uses file-backed store root env'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'WebSocketImpl' 'service resolves a usable local WebSocket implementation'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'disableNativeSimplexDriver' 'service falls back when the native SimpleX driver is present but unusable'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'nativeSimplexDisabled' 'native SimpleX fallback remains disabled after a runtime driver failure'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/simplex-web-default-chat.js' 'contact page loads shared simplex-web renderer'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/simplex-web-session-store.js' 'contact page loads shared simplex-web session store'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'SimplexWebDefaultChat' 'shared simplex-web renderer is vendored into nostr-blog'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-session-store.js" 'SimplexWebSessionStore' 'shared simplex-web session store is vendored into nostr-blog'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '/cgi/blog-secure-chat-state' 'contact page polls secure chat state'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '/cgi/blog-secure-chat-send' 'contact page sends secure chat messages'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '/cgi/blog-secure-chat-upload' 'contact page uploads secure chat attachments'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatCursorSeq(data.cursor_seq)' 'contact page advances poll state using the server cursor sequence'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'window.SimplexWebDefaultChat' 'contact page uses shared simplex-web renderer when available'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'window.SimplexWebSessionStore' 'contact page uses shared simplex-web session store when available'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "'X-Session-Token': auth.session_token" 'secure chat browser requests use the existing session instead of prompting for Nostr signatures on every poll'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'Authorization' 'secure chat polling does not send per-request Nostr signatures'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'signer.signEvent(template)' 'secure chat polling does not trigger repeated signer prompts'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'if [ -z "$auth_event_json" ]; then' 'secure chat server permits session-authenticated requests without per-request NIP-98 signatures'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'return 0' 'secure chat server accepts session plus CSRF without a signer prompt'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'AbortController' 'secure chat browser requests have a bounded timeout'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '20000' 'secure chat browser timeout is short because text sends are accepted immediately'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'restoreSecureChatRenderState(secureChatRenderState)' 'secure chat refresh preserves active composer focus after rerender'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'adminPanel.open = true' 'secure chat refresh preserves open admin mapping console'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'Secure Chat' 'contact page renders secure chat UI'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'function handleSecureChatLoginClick()' 'secure chat login button has an explicit session-aware handler'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'if (hasSecureChatSession()) {' 'secure chat login button reuses an existing browser session before opening login UI'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'refreshSecureChatState({ reset: true })' 'secure chat login button verifies the existing session with the state endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "window.blogAuth.openLoginModal('auto')" 'secure chat login opens the Nostr login modal only when no usable session is present'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'window.blogAuth.startLogin' 'secure chat login does not trigger a browser signer prompt directly'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'hasVerifiedSecureChatSession()' 'secure chat form only renders after the session endpoint verifies login'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'sessionCheckGraceCount < 2' 'nav auth tolerates one transient failed session check before clearing login state'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'scheduleSessionCheckRetry(token)' 'nav auth retries noisy session checks before tearing down signer auth state'
assert_file_contains "$ROOT_DIR/cgi/ssh-auth-check-session" 'simplex_contact_info' 'session bootstrap exposes SimpleX account info'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'account-simplex-contact' 'account page renders SimpleX contact field'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
