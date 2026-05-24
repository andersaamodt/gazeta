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
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '--auto-accept-files' 'secure chat service auto-accepts SimpleX file transfers for Owl Native exports'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '--files-folder' 'secure chat service stores received SimpleX files in a configured folder'
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
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'ensureNativeChatStarted' 'secure chat native driver starts ChatApi before native operations'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'apiCreateUserAddress' 'secure chat service provisions an owner contact address with the native SimpleX API'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'apiDeleteUserAddress' 'secure chat service can recreate stale owner contact addresses during reprovisioning'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'owner_address_recreate_after_error' 'secure chat owner initialization recreates stale SimpleX addresses'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'owner_user_id_ignored_non_owner_profile' 'secure chat owner initialization ignores saved owner IDs that point at visitor bridge profiles'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'apiConnectPlan' 'secure chat service prepares bridge contact connections with the native SimpleX API'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'contactReadyForSend' 'secure chat service waits for send-ready direct contacts before provisioning completes'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'await setActiveUser(userId);' 'secure chat fallback activates a profile before listing its SimpleX contacts'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'await setActiveUser(ownerUserId);' 'secure chat fallback activates the owner profile before creating invitations'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'await setActiveUser(bridgeUserId);' 'secure chat fallback activates the bridge profile before accepting invitations'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'apiSendMessages(simplexChatRef(chatRef)' 'secure chat native send path uses the native SimpleX message API'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'apiSendTextMessage(simplexChatRef(chatRef)' 'secure chat native text sends use the native SimpleX message API'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'SimpleX send failed' 'secure chat send errors include SimpleX chatError detail'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'freshMappingAfterSendFailure' 'secure chat send retries once with a fresh mapping after stale contact failures'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'send_retry_reprovision_mapping' 'secure chat send retry logs mapping reprovisioning'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'bridgeProfileForSession' 'secure chat provisions SimpleX bridge profiles from the authenticated site username'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'bridge_display_name' 'secure chat persists the SimpleX bridge display name for Owl Native exports'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'provision_recreate_for_display_name' 'secure chat reprovisions legacy npub-named bridge contacts with the site username'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'mappingBridgeDisplayMatches' 'secure chat detects active mappings whose SimpleX bridge display name is stale'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'session_display_name: sanitizeSimplexDisplayName(sessionDisplayName' 'secure chat state returns the authenticated site username for browser-native profiles'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "contact_name: String(mapping && mapping.bridge_display_name" 'Owl Native export shows the site username instead of the npub label'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '/_get chat @${bridgeContactId} count=${count}' 'secure chat service can reconcile recent direct chat history from SimpleX'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "apiGetChat('direct', Number(bridgeContactId)" 'secure chat native reconciliation uses the native SimpleX chat API'
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
owl_send_block=$(sed -n '/async function sendOwnerTextMessage/,/function adminAttachmentFromBody/p' "$ROOT_DIR/cgi/blog-secure-chat-service.js")
assert_contains "$owl_send_block" 'sendPlainTextMessage(String(owner.userId)' 'Owl Native replies use the production-verified plaintext SimpleX sender'
assert_not_contains "$owl_send_block" 'sendComposedMessages(String(owner.userId)' 'Owl Native replies avoid the SimpleX json send path that can hang'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'owl_send_reprovision_legacy_mapping' 'Owl send reprovisions legacy single-profile mappings before replying'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'String(mapping.bridge_user_id) === String(owner.userId)' 'Owl send rejects mappings where the bridge user is the owner identity'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'provision_retry_recreate_owner_address' 'secure chat provisioning retries with a fresh owner address if SimpleX reports a stale connection'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-export" 'WIZARDRY_SITE_NAME:=site' 'Owl export helper defaults CLI calls to the live site tenant'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'WIZARDRY_SITE_NAME:=site' 'Owl send helper defaults CLI calls to the live site tenant'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-export" 'WIZARDRY_SITES_DIR:=$HOME' 'Owl export helper defaults CLI calls to the single-site live root'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'WIZARDRY_SITES_DIR:=$HOME' 'Owl send helper defaults CLI calls to the single-site live root'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'direct_sender_unavailable|direct_send_failed' 'secure chat CGI falls back to the daemon when direct send cannot open its WebSocket'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'sessionDisplayName' 'secure chat send payload carries the authenticated site username'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'mapping_identity_stale' 'secure chat CGI falls back to the daemon when direct send sees a legacy npub-named mapping'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" '!existing.attachment_name && normalized.attachment_name' 'secure chat service preserves friendly attachment filenames when reconciliation sees daemon temp-path names'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "/^upl-[^-]+-/.test(String(attachmentName))" 'secure chat service restores friendly attachment names when older rows already contain daemon temp filenames'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "driverType: 'unknown'" 'secure chat service tracks the active SimpleX driver'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'sendChatCmd(command)' 'secure chat service uses the raw SimpleX create-user command when the native create-user wrapper is incompatible'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "state.simplexProcess.kill('SIGTERM')" 'secure chat service shuts down its child simplex process on daemon exit'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'owner_contact_link' 'secure chat state exposes the owner SimpleX contact link for browser-local sends'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'SECURE_CHAT_BROWSER_OWNER_CONTACT_LINK' 'secure chat service can publish an explicit Owl Native browser contact link'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'BROWSER_OWNER_CONTACT_LINK' 'secure chat service prefers the explicit browser-native owner contact link when configured'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'isReusableSimplexContactLink(state.ownerContactLink)' 'secure chat upgrades stale one-time owner invitations to reusable SimpleX contact addresses'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'connFullLink || connLink.connShortLink' 'secure chat exposes the full owner SimpleX link before falling back to short links'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'rotate-owner-address' 'secure chat admin can rotate stale owner SimpleX contact addresses'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "case 'sndNew':" 'secure chat normalizes raw SimpleX sndNew status before returning message rows'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-direct-send.js" "itemStatus.type === 'sndNew'" 'secure chat direct sender normalizes raw SimpleX sndNew status'
assert_file_contains "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" 'createSimplexWebTransportAdapter' 'browser simplex-web adapter exposes the website transport factory'
assert_file_contains "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" 'connectBrowserSmpWebSocketTransport' 'browser simplex-web adapter opens direct browser SMP WebSocket transports'
assert_file_contains "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" 'connectBrowserXftpWebClient' 'browser simplex-web adapter opens direct browser XFTP transports for attachments'
assert_file_contains "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" 'sendReadReceipt' 'browser simplex-web adapter exposes read receipt sending'
assert_file_contains "$ROOT_DIR/site/static/browser-simplex-contact-client.mjs" 'sendReadReceipt' 'browser SimpleX contact client can send read receipts'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-transport.js" 'getMessageStatus' 'simplex-web transport exposes browser-local message status lookup'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-transport.js" 'getMessages' 'simplex-web transport exposes browser-local message receive lookup'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-transport.js" 'normalizeMessageQuery' 'simplex-web transport normalizes browser-local receive queries'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-transport.js" 'sendReadReceipt' 'simplex-web transport exposes browser-local read receipt sending'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-browser-adapter-init.mjs" 'simplexWebSmpUrl' 'browser simplex-web bootstrap reads the configured SMP endpoint'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-browser-adapter-init.mjs" 'simplexWebSmpKeyHash' 'browser simplex-web bootstrap requires a pinned SMP identity hash'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-browser-adapter-init.mjs" 'parseSimplexConnectionLink' 'browser simplex-web bootstrap can derive SMP identity from the owner contact link'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-browser-adapter-init.mjs" 'smpServer: contactProfile && contactProfile.server' 'browser simplex-web bootstrap preserves the parsed SMP server for native file invitation queues'
assert_file_contains "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" 'server: config.server || config.smpServer' 'browser simplex-web adapter passes the SMP server into newly created queues'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'ownerContactLink: ownerContactLink' 'contact page passes the owner SimpleX contact link to the browser-native transport bootstrap'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'if (!ownerContactLink) {' 'contact page only configures browser-native XFTP when the owner link is not Owl-native'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'transportConfig.xftpWebUrl = secureChatSimplexXftpUrl' 'contact page passes the browser-native XFTP endpoint to the non-native transport bootstrap'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'transportConfig.xftpKeyHash = secureChatSimplexXftpKeyHash' 'contact page pins the browser-native XFTP server identity hash for non-native transport'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-browser-adapter-init.mjs" 'SimplexWebBrowserAdapter' 'browser simplex-web bootstrap publishes a first-party adapter registration hook'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'reconcileSecureChatPendingLocalOutgoing' 'Secure Chat reconciles old browser-local sending rows against SimpleX status'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'refreshSecureChatBrowserMessages' 'Secure Chat polls browser-local SimpleX history for Owl Native replies'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatMergeBrowserTransportMessages' 'Secure Chat merges browser-local incoming SimpleX replies into the widget'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatStatusNeedsFollowup' 'Secure Chat continues reconciling sent outgoing rows until SimpleX reports delivered or failed'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" "raw === 'sndSent' || raw === 'sent'" 'Secure Chat treats sent as a follow-up state for delivered status lookup'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'markPageLifecycleClosing' 'Secure Chat tracks browser refresh lifecycle'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'isPageLifecycleClosing()' 'Secure Chat suppresses transient refresh teardown errors'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'timeout_ms: 15000' 'Secure Chat browser sends fail quickly instead of leaving the send button busy for a long timeout'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'status_timeout_ms: 60000' 'Secure Chat keeps listening for actual SimpleX status after the send button is released'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-transport.js" 'on_status' 'simplex-web transport preserves status callbacks for browser sends'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'verifySecureChatStoredAuth' 'Secure Chat verifies stored auth directly instead of waiting on nav auth hydration'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatAuthPending' 'Secure Chat treats a stored session token as an auth-pending loading state'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'secure-chat-loading-spinner' 'Secure Chat shared renderer shows a spinner while auth is pending'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-loading-spinner' 'Secure Chat loading spinner has explicit layout styling'
assert_file_contains "$ROOT_DIR/site/static/style.css" 'white-space: nowrap' 'Secure Chat loading row keeps the spinner attached to the loading label'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'secure-chat-status-spinner' 'Secure Chat pending message status renders with a spinner'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'secure-chat-status is-delivered' 'Secure Chat shared renderer shows delivered states as compact check marks'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'aria-label="' 'Secure Chat shared status icons keep accessible labels'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'formatRelativeTime' 'Secure Chat shared renderer shows friendly relative message timestamps'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatRelativeTime' 'Secure Chat fallback renderer shows friendly relative message timestamps'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatStatusIconHtml' 'Secure Chat fallback renderer shows delivered states as compact check marks'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" '<time datetime="' 'Secure Chat timestamps preserve raw datetime metadata'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'spinnerPhaseStyle' 'Secure Chat shared spinner render keeps animation phase across re-renders'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatSpinnerPhaseStyle' 'Secure Chat fallback spinner render keeps animation phase across re-renders'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'animation-delay:-' 'Secure Chat shared spinner starts at the current animation phase'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'animation-delay:-' 'Secure Chat fallback spinner starts at the current animation phase'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatStatusHtml' 'Secure Chat fallback renderer can render rich status labels'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-status-spinner' 'Secure Chat pending message status spinner has explicit layout styling'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'secure-chat-input-wrap' 'Secure Chat renderer wraps the textarea so attach can sit inside it'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'secure-chat-send-icon' 'Secure Chat send button renders as an icon'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secure-chat-send-icon' 'Secure Chat fallback send button renders as an icon'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'currentSecureChatDraftValue' 'Secure Chat fallback send action reads the live textarea value'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'target instanceof Element' 'Secure Chat click handler accepts SVG icon click targets'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatLocalDeliveryStatus' 'Secure Chat local sends display the status reported by SimpleX'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatUpdateLocalOutgoingStatus' 'Secure Chat updates browser-local outgoing rows from SimpleX status events'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" "state.chat.draftText = ''" 'Secure Chat clears the composer as soon as a text message send starts'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" "delivery_status: 'sending'" 'Secure Chat immediately renders a browser-local sending row for optimistic text sends'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatUpdateLocalOutgoingStatus(clientMessageId, receipt || {})' 'Secure Chat upgrades the optimistic sending row when SimpleX returns a receipt'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" "delivery_status: 'sending'" 'Secure Chat keeps optimistic file rows in a generic sending state when browser file sends resolve without receipts'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatKeepPendingFilesSending' 'Secure Chat keeps pending file rows generic while the SimpleX peer accepts the contact'
assert_file_not_contains "$ROOT_DIR/site/static/contact-page.js" 'Waiting for Owl' 'Secure Chat status copy remains generic and client-agnostic'
assert_file_not_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'Waiting for Owl' 'Secure Chat shared renderer status copy remains generic and client-agnostic'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatLocalOutgoingRows(state.chat.messages)' 'Secure Chat refresh reset preserves browser-local outgoing rows'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatStoredLocalOutgoingRows' 'Secure Chat refresh loads browser-local outgoing rows before merging server state'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatMergeLocalBrowserRows(secureChatStoredLocalBrowserRows())' 'Secure Chat refresh cannot overwrite stored browser-local message rows'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'if (storedPubkey)' 'Secure Chat browser session storage uses the stable stored pubkey account key'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" "owner-native-inline-v7-' + secureChatStableLinkHash(ownerContactLink + '|' + secureChatStorageAccountKey())" 'Secure Chat browser-native contact ids are stable per signed-in Nostr account, not per display name'
assert_file_not_contains "$ROOT_DIR/site/static/contact-page.js" 'nostrPubkey: pubkey' 'Secure Chat browser profile does not add site-specific identity fields to SimpleX messages'
assert_file_not_contains "$ROOT_DIR/site/static/contact-page.js" 'nostrNpub: npub' 'Secure Chat browser profile does not add site-specific npub fields to SimpleX messages'
assert_file_not_contains "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" 'SECURE_CHAT_IDENTITY_MARKER' 'browser-native sends do not include custom site identity markers'
assert_file_not_contains "$ROOT_DIR/site/static/browser-simplex-web-transport-adapter.mjs" 'withNativeIdentityMarker' 'browser-native text sends use native SimpleX profile/contact state instead of message markers'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'stripLegacySecureChatIdentityMarker' 'Secure Chat owner import strips legacy identity markers without using them for grouping'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'thread_id: `secure-chat-contact-${contactId}`' 'owner-direct reconciliation groups by the remembered SimpleX contact'
assert_file_contains "$ROOT_DIR/site/static/style.css" 'right: 0.58rem' 'Secure Chat send button is positioned at the lower right of the textarea'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'rows="2"' 'Secure Chat shared renderer uses a compact message textarea'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'rows="2"' 'Secure Chat fallback renderer uses a compact message textarea'
assert_file_contains "$ROOT_DIR/site/static/style.css" 'min-height: 6.2rem' 'Secure Chat message textarea stays compact while reserving a control row'
assert_file_contains "$ROOT_DIR/site/static/style.css" 'background: var(--accent' 'Secure Chat send button uses the blue theme accent'
assert_file_contains "$ROOT_DIR/site/static/style.css" 'position: absolute' 'Secure Chat attach button is positioned inside the textarea wrapper'
assert_file_contains "$ROOT_DIR/site/static/style.css" 'border: 0' 'Secure Chat paperclip button has no default border'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-attach-button:hover' 'Secure Chat paperclip button shows a theme hover circle'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'data-secure-chat-action="emoji-toggle"' 'Secure Chat shared renderer exposes an emoji picker button next to attachments'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'data-secure-chat-action="emoji-toggle"' 'Secure Chat fallback renderer exposes an emoji picker button next to attachments'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-emoji-button {' 'Secure Chat emoji button has dedicated icon-button styling'
assert_file_contains "$ROOT_DIR/site/static/style.css" 'appearance: none' 'Secure Chat emoji button suppresses native button chrome at rest'
assert_file_not_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-emoji-button[aria-expanded="true"]' 'Secure Chat emoji button does not show a persistent open-state background'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'https://cdn.jsdelivr.net/npm/emoji-picker-element@^1/index.js' 'Secure Chat lazy-loads the standard emoji picker library only when opened'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'new module.Database()' 'Secure Chat uses the maintained emoji picker database for standard emoji data'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secure-chat-recent-emoji-v1:' 'Secure Chat stores recently used emojis in browser localStorage'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'data-secure-chat-action="emoji-search"' 'Secure Chat emoji picker has a first-class search box'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'getEmojiBySearchQuery' 'Secure Chat emoji search filters through the emoji database'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'getEmojiByGroup' 'Secure Chat loads standard emoji sections from the emoji database'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'data-secure-chat-action="emoji-pick"' 'Secure Chat inserts selected emoji into the live compose textarea'
assert_file_not_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'secure-chat-emoji-mode-row' 'Secure Chat emoji picker does not render a redundant top mode tab'
assert_file_not_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" '<emoji-picker' 'Secure Chat custom picker UI does not expose the library top category bar'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'secure-chat-emoji-section-tabs' 'Secure Chat emoji picker renders a bottom section tab rail'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'data-secure-chat-action="emoji-section"' 'Secure Chat emoji section tabs are delegated actions'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'jumpSecureChatEmojiSection' 'Secure Chat section tabs jump to picker categories'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-emoji-popover' 'Secure Chat emoji picker popover has dedicated layout styling'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-emoji-scroll' 'Secure Chat emoji picker scrolls recents and sections together'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" '<h3>Recently Used</h3>' 'Secure Chat Recently Used is the first scrollable emoji section'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-emoji-section h3' 'Secure Chat emoji sections render headings'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-emoji-section-tabs' 'Secure Chat emoji picker bottom section tabs have dedicated styling'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-emoji-section-tabs svg' 'Secure Chat emoji section tabs use monochrome icons'
assert_file_contains "$ROOT_DIR/site/static/style.css" 'font-size: 1.68rem' 'Secure Chat emoji picker uses slightly larger emoji'
assert_file_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'data-secure-chat-action="voice-note"' 'Secure Chat shared renderer exposes a gated voice note button'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'data-secure-chat-action="voice-note"' 'Secure Chat fallback renderer exposes a gated voice note button'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'Voice note permission request' 'Secure Chat asks the SimpleX contact before enabling voice notes'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'navigator.mediaDevices.getUserMedia({ audio: true })' 'Secure Chat only asks browser microphone permission from the voice-note action'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'secureChatAudioFileLike(file) && state.chat.voicePermission !== '\''granted'\''' 'Secure Chat blocks audio attachments until voice notes are allowed'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" 'new File([blob], '\''voice-note-'\''' 'Secure Chat turns microphone recordings into encrypted audio attachments'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-voice-btn' 'Secure Chat voice note button has dedicated layout styling'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-mic-icon' 'Secure Chat microphone icon has dedicated SVG styling'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-voice-btn {' 'Secure Chat mic button has dedicated icon-button styling'
assert_file_contains "$ROOT_DIR/site/static/style.css" 'background-image: none' 'Secure Chat icon buttons suppress native button backgrounds'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.secure-chat-voice-btn.is-recording' 'Secure Chat mic button has a recording state'
secure_chat_voice_recording_css=$(sed -n '/^\.secure-chat-voice-btn\.is-recording {/,/^}/p' "$ROOT_DIR/site/static/style.css")
assert_contains "$secure_chat_voice_recording_css" 'background: transparent;' 'Secure Chat mic recording state stays backgroundless at rest'
assert_not_contains "$secure_chat_voice_recording_css" 'danger-soft' 'Secure Chat mic button does not show a persistent recording background'
assert_file_not_contains "$ROOT_DIR/site/static/simplex-web-default-chat.js" 'Admin Mapping Console' 'Secure Chat widget does not render the admin mapping console inline'
assert_file_not_contains "$ROOT_DIR/site/static/contact-page.js" 'Admin Mapping Console' 'Secure Chat fallback renderer does not render the admin mapping console inline'
assert_file_contains "$ROOT_DIR/site/static/contact-page.js" "include_admin: 'false'" 'Secure Chat widget does not request admin mappings for inline rendering'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'reconcileOwnerDirectMessagesForOwlExport' 'Owl export reconciles browser-local owner-direct SimpleX messages'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'simplex-owner-direct' 'Owl export identifies owner-direct SimpleX messages without npub mapping'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" ".filter((item) => String(item.direction || '') === 'incoming')" 'Owl export does not re-import owner-sent SimpleX replies back into Owl Native'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'secure-chat-contact-[0-9]*' 'Owl Secure Chat replies can target owner-direct SimpleX contacts'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'SECURE_CHAT_SIMPLEX_NATIVE_MODULE_ROOT' 'secure chat launcher passes the persistent native driver root to the daemon'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-install-native-driver.sh" 'npm install --omit=dev' 'secure chat native driver installer provisions the official package into persistent runtime storage'
assert_file_contains "$ROOT_DIR/cgi/secure-chat-native-driver/package.json" '"simplex-chat": "6.5.0"' 'secure chat native driver package pins the official SimpleX Node module version'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'blog_secure_chat_service_request_json' 'send endpoint prints daemon json responses explicitly'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'blog-secure-chat-direct-send.js' 'send endpoint uses the isolated direct sender for text messages with active mappings'
assert_file_not_contains "$ROOT_DIR/cgi/blog-secure-chat-send" 'blog_secure_chat_service_request GET /health' 'send endpoint does not block on daemon health before direct SimpleX sends'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-direct-send.js" 'scd-${Date.now()}' 'direct sender correlates SimpleX WebSocket command responses'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-direct-send.js" 'sendTextSequential' 'direct sender can use the production-verified sequential SimpleX command flow'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-direct-send.js" 'mapping_identity_stale' 'direct sender rejects legacy mappings so the daemon can reprovision the username profile'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-send" "attachments_json='[]'" 'send endpoint defaults omitted attachment metadata to an empty json array'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-state" 'blog_secure_chat_service_request_json' 'state endpoint prints daemon json responses explicitly'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-state" 'sessionDisplayName' 'secure chat state payload carries the authenticated site username'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-admin" 'blog_secure_chat_service_request_json' 'admin endpoint prints daemon json responses explicitly'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-upload" "printf '%s\\n' \"\$response\"" 'upload endpoint prints daemon json responses explicitly'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-upload" 'X-Session-Display-Name' 'secure chat upload sends preserve the authenticated username for file messages'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-export" 'action:"owl-export"' 'secure chat has a local Owl Native export helper'
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
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/simplex-web-transport.js' 'contact page loads shared simplex-web transport facade'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'type="importmap"' 'contact page loads an import map for browser-native simplex-web dependencies'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/simplex-web-browser-adapter-init.mjs' 'contact page loads the browser-native simplex-web adapter bootstrap'
assert_file_not_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/simplex-chat-websocket-adapter.js' 'contact page no longer loads the loopback SimpleX Chat WebSocket adapter'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'SimplexWebDefaultChat' 'shared simplex-web renderer is vendored into gazeta'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-session-store.js" 'SimplexWebSessionStore' 'shared simplex-web session store is vendored into gazeta'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-transport.js" 'SimplexWebTransport' 'shared simplex-web transport is vendored into gazeta'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-transport.js" 'registerBrowserTransport' 'shared simplex-web transport exposes adapter registration'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-browser-adapter-init.mjs" 'registerConfiguredSimplexWebTransport' 'vendored simplex-web browser bootstrap registers configured browser-native transports'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'createSimplexWebTransportAdapter' 'vendored simplex-web browser adapter registers with simplex-web'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'connectBrowserSmpWebSocketTransport' 'vendored simplex-web browser adapter connects directly to SMP servers'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'connectBrowserXftpWebClient' 'vendored simplex-web browser adapter connects directly to XFTP servers'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '/cgi/blog-secure-chat-state' 'contact page polls secure chat state'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatRegisterBrowserNativeTransport()' 'contact page configures browser-native simplex-web transport'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'waitForSecureChatBrowserNativeTransport' 'contact page waits briefly for browser-native SimpleX transport before sending selected attachments'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'waitForSecureChatSendDestination' 'contact page waits for SimpleX contact destination before sending selected attachments'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'return waitForSecureChatSendDestination(3000).then(function (destination) {' 'contact page resolves the SimpleX destination before registering the browser transport'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'SimplexWebBrowserAdapter' 'contact page uses the first-party simplex-web browser bootstrap'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'simplexBrowserTransportConfigured' 'contact page tracks browser-native simplex-web transport readiness'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatRegisterLoopbackTransport' 'contact page no longer configures the removed loopback transport'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'waitForSecureChatLoopbackTransport' 'contact page no longer waits for the removed loopback transport'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'simplexWebSocketUrl' 'contact page no longer exposes loopback SimpleX Chat WebSocket configuration'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'ws://127.0.0.1:5225' 'contact page no longer defaults to a loopback SimpleX Chat WebSocket endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatOwnerContactLink()' 'contact page reads the owner SimpleX contact link from service state'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatBrowserTransport()' 'contact page requires browser-native simplex-web transport for secure chat sends'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatSessionDisplayName' 'contact page derives the authenticated site username for browser-native SimpleX profiles'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'profile: secureChatBrowserProfile()' 'contact page gives simplex-web the site username for its browser-local SimpleX profile'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'this.store.saveProfile(this.profile)' 'simplex-web persists its own local browser profile in the browser store'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-store.mjs" "saveProfile(profile) { return this.save('profile', 'local'" 'simplex-web store owns the local profile record'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'staleNativeContactError(error)' 'simplex-web recovers stale browser-local native contacts after AUTH failures'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" "contacts.deleteContact(contactId, { hardDelete: true, localOnly: true })" 'simplex-web clears stale local contact state before re-requesting the owner contact'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'owner-native-inline-v7-' 'contact page isolates browser-native SimpleX contacts by owner link and signed-in account'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-browser-adapter-init.mjs" 'profile: options.profile || {}' 'browser simplex-web bootstrap forwards the site username profile to the transport adapter'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'transport.sendText({' 'contact page routes secure chat messages through the browser simplex-web transport'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatOwnerContactId(ownerContactLink)' 'contact page uses an isolated browser-local contact id for owner contact links'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'bridge_user_id' 'contact page passes the active SimpleX user id to the browser transport'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'contact_link: ownerContactLink' 'contact page passes the owner contact link to browser-local SimpleX'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'https://new.andersaamodt.com:18443/' 'contact page configures the production browser-native XFTP endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'R-xa4iaMWHaCAK8iMzmJKFtODWn-nSw1FSl3ycoqDXQ=' 'contact page pins the production XFTP server identity'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatAppendLocalOutgoing' 'contact page records browser-local outbound messages after send'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "delivery_status: 'sending'" 'contact page records browser-local outbound messages before send completion'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatUpdateLocalOutgoingStatus(clientMessageId, receipt || {})' 'contact page updates the optimistic outbound row after send completion'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'client_message_id: clientMessageId' 'contact page gives browser transport sends a client message id'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'transport.sendFiles({' 'contact page routes secure chat attachments through the browser simplex-web transport'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'skipXftp' 'browser simplex-web adapter can skip XFTP setup for Owl native direct-file sends'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'nativeDirectFile' 'browser simplex-web adapter detects native direct-file sends before requiring XFTP'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" '!nativeDirectFile && !this.injectedContactClient && !hasConfiguredXftpClient' 'browser simplex-web adapter only requires XFTP for browser-profile file sends'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'nativeInlineAttachmentText' 'browser simplex-web adapter sends verified native-owner attachments inside encrypted SimpleX messages'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'contacts.sendText(contactId, nativeInlineAttachmentText' 'browser simplex-web adapter avoids unaccepted native direct-file queues for owner attachments'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'simplex-web-file-chunk:v1:' 'browser simplex-web adapter chunks larger encrypted native-owner attachments'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'SIMPLEX_WEB_ADAPTER_NATIVE_INLINE_FILE_SIZE' 'browser simplex-web adapter caps encrypted inline native attachments'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'parseAttachmentChunkMarker' 'secure chat service reassembles chunked encrypted browser attachments for Owl export'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-browser-adapter-init.mjs" 'smpServer: contactProfile && contactProfile.server' 'browser simplex-web bootstrap preserves owner contact SMP server for native direct-file queues'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'server: config.server || config.smpServer' 'browser simplex-web adapter passes the parsed SMP server to queue creation'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'simplexWebFileBridgeUrl' 'contact page no longer exposes loopback simplex-web file bridge configuration'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'http://127.0.0.1:5226' 'contact page no longer defaults attachments to a loopback file bridge'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'pendingFiles' 'contact page keeps selected secure chat attachments pending in compose'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'stableSecureChatFile' 'contact page snapshots selected browser files before handing them to SimpleX file staging'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatReadyPendingFiles' 'contact page waits for selected attachment snapshots before sending'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatPendingFileReceipt' 'contact page creates optimistic Secure Chat attachment rows before network send'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'pendingRefs.forEach' 'contact page marks optimistic Secure Chat attachment rows failed when send fails'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'threadScrollTop' 'contact page preserves explicit Secure Chat scroll offset across rerenders'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'threadMaxScrollTop' 'contact page tracks the Secure Chat scrollable range, not just absolute scrollTop'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" "contactId + ':native'" 'browser adapter isolates Owl-native SimpleX contacts from legacy browser-profile contacts'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'maxTop - previousDistance' 'contact page preserves Secure Chat scroll distance across video layout growth'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'threadPinnedToBottom' 'contact page only pins Secure Chat to bottom when the user is already at bottom'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'state.lastContentHtml === nextContentSignature' 'contact page skips unchanged full rerenders that flicker media rows'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'stableSecureChatContentHtml' 'contact page ignores spinner animation phase when deciding whether to rerender chat media rows'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatHasVolatileLocalOutgoingRows' 'contact page avoids full polling rerenders while optimistic local chat rows are volatile'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatHasIncomingServerRows' 'contact page still rerenders immediately when incoming Secure Chat replies arrive'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'overflow-anchor: none' 'secure chat thread disables browser scroll anchoring that fights video attachment scrolling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'aspect-ratio: 16 / 9' 'secure chat video attachments reserve layout space before metadata loads'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'remove-pending-file' 'contact page lets users remove pending secure chat attachments before send'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'addSecureChatPendingFiles(event.dataTransfer.files)' 'contact page accepts dropped files into secure chat compose'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'class="secure-chat-file-input"' 'contact page file input receives direct Firefox clicks instead of relying on hidden label activation'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secure-chat-file-input" type="file" multiple hidden' 'contact page file input is not hidden from Firefox picker change events'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'filePickerOpen' 'contact page tracks when the native file picker is open'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'renderDeferredWhileFilePickerOpen' 'contact page defers Secure Chat rerenders while the native file picker owns selected files'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "window.addEventListener('focus', releaseSecureChatFilePickerSoon)" 'contact page releases deferred renders after file picker cancel without detaching the selected input early'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'secure-chat-pending-files' 'shared secure chat renderer shows pending attachments above the draft'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'class="secure-chat-file-input"' 'shared secure chat renderer uses a transparent file input for attachment clicks'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'onRemovePendingFile' 'shared secure chat renderer exposes pending attachment removal'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-transport.js" 'sendFiles: function' 'simplex-web transport exposes browser-local file sending'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-transport.js" 'native_file_accept_timeout_ms: message && message.native_file_accept_timeout_ms' 'simplex-web transport facade preserves native file accept timeouts'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-transport.js" 'sendReadReceipt' 'simplex-web transport exposes browser-local read receipts'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/simplex-web-transport.js" 'file_bridge_url' 'simplex-web transport no longer reports a loopback file bridge'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-xftp-web-client.mjs" 'connectBrowserXftpWebClient' 'browser XFTP client exposes the browser-native file transfer client'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-xftp-web-client.mjs" 'uploadXftpWebFile' 'browser XFTP client uploads selected browser File objects directly'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-xftp-web-client.mjs" 'xftpWebErrorIsRetriable' 'browser XFTP client retries transient relay auth/session failures'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-xftp-web-client.mjs" 'client.reconnect' 'browser XFTP client can re-handshake before retrying file commands'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-xftp-web-client.mjs" 'downloadXftpWebFile' 'browser XFTP client downloads XFTP files directly for inline rendering'
assert_file_contains "$SITE_SOURCE_ROOT/static/browser-xftp-web-client.mjs" 'safeXftpWebFileName' 'browser XFTP client rejects path separators and control characters in transferred filenames'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" '/_send @' 'browser-native adapter no longer sends through the SimpleX Chat command API'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/browser-simplex-web-transport-adapter.mjs" 'stageFileWithBridge' 'browser-native adapter no longer stages files through a loopback bridge'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'parseAttachmentMarker' 'secure chat service exports SimpleX attachment envelopes as attachment metadata'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'adminAttachmentFromBody' 'secure chat admin send validates Owl Native attachment files before sending'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'fileComposedMessage' 'secure chat service sends Owl Native attachments as SimpleX ComposedMessage files'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'sendOwnerDirectFileMessage' 'secure chat service can send Owl Native owner-direct attachment replies'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'nostr-pubkey:' 'browser-native Secure Chat profile carries the signed-in Nostr key in SimpleX profile metadata'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'contactNpub(contact)' 'secure chat service binds owner-direct SimpleX contacts back to the signed-in Nostr user'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'ownerDirectStateRow' 'secure chat state returns owner-direct replies to the matching browser session'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'const stableThreadId = String(row.npub' 'Owl export groups owner-direct Secure Chat rows by stable Nostr identity when available'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'npub: String(row.npub ||' 'Owl export preserves the Nostr identity on owner-direct Secure Chat rows'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'rememberOwnerDirectSentAttachment' 'secure chat service preserves Owl Native owner-direct media for browser inline rendering'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'attachment_data_url' 'secure chat service stores small owner-direct reply media before temp cleanup'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'dataUrlFromAttachmentPath' 'secure chat service exports small received media files for native inline previews'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'attachment_path' 'secure chat service preserves SimpleX file paths while reconciling attachments'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'attachment_name_b64' 'Owl send helper accepts streamed attachment metadata from Owl Native'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'client_message_id' 'Owl send helper forwards Owl outbox ids as send idempotency keys'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'BLOG_SECURE_CHAT_OWL_SEND_TIMEOUT' 'Owl send helper waits long enough for SimpleX file sends to complete'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'safe_attachment_name=${attachment_name##*/}' 'Owl send helper strips path components from streamed attachment names'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'mktemp -d "${TMPDIR:-/tmp}/secure-chat-owl-send-file.XXXXXX"' 'Owl send helper stages streamed attachments in a private temp directory'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-owl-send" 'attachment_file="$attachment_dir/$safe_attachment_name"' 'Owl send helper preserves the original attachment basename for SimpleX transfers'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'OWL_SEND_RECEIPTS_FILE' 'secure chat service records Owl send receipts for idempotent retries'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'owl_send_idempotent_replay' 'secure chat service suppresses duplicate Owl send retries'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" "fs.mkdtempSync(path.join(STORE_ROOT, 'simplex-tmp', 'owl-send-'))" 'secure chat service copies Owl attachment files before asynchronous sends'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'cleanupAdminAttachment' 'secure chat service removes copied Owl attachment files after send attempts'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-service.js" 'const parsedAttachment = parseAttachmentMarker(cleanText)' 'owner-direct Owl export parses SimpleX attachment envelopes after legacy marker cleanup'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" '<video class="secure-chat-attachment-media"' 'shared secure chat renderer renders videos inline'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" '<audio class="secure-chat-attachment-audio"' 'shared secure chat renderer renders audio inline'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '<audio class="secure-chat-attachment-audio"' 'contact page fallback renderer renders audio inline'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-attachment-audio' 'secure chat styles size inline audio players'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-attachment-line' 'secure chat styles attachment filename and metadata on one wrapping line'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-status-check' 'secure chat styles compact delivered check marks'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'padding: 0.18rem 0' 'secure chat attachment links are flattened inside message bubbles'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatAttachmentHtml' 'contact page fallback renderer renders typed attachments'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'Message was not sent to the server.' 'contact page fails closed when browser-native simplex-web transport is unavailable'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "secureChatFormPost('/cgi/blog-secure-chat-send'" 'contact page does not post secure chat message bodies to the server'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "/cgi/blog-secure-chat-upload" 'contact page does not upload secure chat attachment bytes to the server'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatCursorSeq(data.cursor_seq)' 'contact page advances poll state using the server cursor sequence'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'window.SimplexWebDefaultChat' 'contact page uses shared simplex-web renderer when available'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'window.SimplexWebSessionStore' 'contact page uses shared simplex-web session store when available'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "'X-Session-Token': auth.session_token" 'secure chat browser requests use the existing session instead of prompting for Nostr signatures on every poll'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'Authorization' 'secure chat polling does not send per-request Nostr signatures'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'signer.signEvent(template)' 'secure chat polling does not trigger repeated signer prompts'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'if [ -z "$auth_event_json" ]; then' 'secure chat server permits session-authenticated requests without per-request NIP-98 signatures'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'return 0' 'secure chat server accepts session plus CSRF without a signer prompt'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'AbortController' 'secure chat browser requests have a bounded timeout'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'SECURE_CHAT_STATE_TIMEOUT_MS' 'secure chat browser state requests use a named bounded timeout'
assert_file_contains "$ROOT_DIR/cgi/blog-secure-chat-common.sh" 'BLOG_SECURE_CHAT_REQUEST_TIMEOUT:-12' 'secure chat daemon requests fail fast instead of leaving the widget stuck loading'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "timeoutError.code = 'timeout'" 'secure chat can distinguish state timeout from auth failures'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "err.code === 'timeout' && hasUsableSecureChatSession()" 'secure chat suppresses transient state timeout banners when cached chat is usable'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'refreshSecureChatState().finally(function ()' 'secure chat polling waits for each state refresh before scheduling the next poll'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'restoreSecureChatRenderState(secureChatRenderState)' 'secure chat refresh preserves active composer focus after rerender'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'threadDistanceFromBottom' 'secure chat refresh captures message scroller backscroll distance before rerender'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'threadWasAtBottom' 'secure chat refresh detects whether the user was already at the bottom'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'renderSecureChatThreadScrollState(secureChatRenderState)' 'secure chat refresh restores message scroller position instead of forcing bottom'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatPanelSignature' 'secure chat refresh can detect unchanged message state'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'renderSecureChatContentIfChanged(previousSignature' 'secure chat polling skips full DOM replacement when the message state has not changed'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'adminPanel.open = true' 'secure chat refresh no longer tracks removed inline admin mapping console'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'Secure Chat' 'contact page renders secure chat UI'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'function handleSecureChatLoginClick()' 'secure chat login button has an explicit session-aware handler'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'if (hasSecureChatSession()) {' 'secure chat login button reuses an existing browser session before opening login UI'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'refreshSecureChatState({ reset: true })' 'secure chat login button verifies the existing session with the state endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'window.blogAuth.startLogin()' 'secure chat login delegates to the same primary login flow as the top navigation button'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "window.blogAuth.openLoginModal('auto')" 'secure chat login keeps the modal fallback while nav auth is still initializing'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'hasUsableSecureChatSession()' 'secure chat form can render from a usable browser session while state refreshes'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatStoredAuthHint()' 'secure chat can render from nav-auth browser login hints before csrf bootstrap finishes'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'state.chat.authRejected' 'secure chat falls back to login when the server rejects the browser session'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'chatStarted: false' 'secure chat starts closed after login until the user starts chat'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatStoredHistorySummary' 'contact page checks saved Secure Chat history before opening the chat'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secure-chat-saved-hint' 'contact page renders a saved Secure Chat history hint next to the closed chat button'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "secureChatPlural(messages, 'message')" 'contact page saved Secure Chat history hint says messages instead of saved messages'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "secureChatPlural(messages, 'saved message')" 'contact page saved Secure Chat history hint does not say saved messages'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "label ? 'Open Chat' : 'Start Chat'" 'contact page labels returning Secure Chat sessions as Open Chat'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'savedSummaryText' 'shared secure chat renderer formats saved history hints'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'secure-chat-saved-hint' 'shared secure chat renderer renders a saved history hint next to the closed chat button'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" "pluralizeCount(messages, 'message')" 'shared Secure Chat saved history hint says messages instead of saved messages'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" "pluralizeCount(messages, 'saved message')" 'shared Secure Chat saved history hint does not say saved messages'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" "label ? 'Open Chat' : 'Start Chat'" 'shared secure chat renderer labels returning sessions as Open Chat'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'Login with Nostr to chat.' 'shared secure chat renderer explains the login prompt'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'Login with Nostr to chat.' 'contact page fallback renderer explains the login prompt'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-login-gate' 'Secure Chat login prompt is centered with the login button'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'chatOpening: state.chat.chatOpening === true' 'contact page tells the shared renderer when Secure Chat is opening'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'secure-chat-body' 'shared secure chat renderer wraps opened chat content for animation'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '@keyframes secure-chat-slide-open' 'Secure Chat body slides open after Start Chat'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'data-secure-chat-action="close"' 'contact page renders a Secure Chat close button when chat is open'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'secure-chat-close-btn' 'shared secure chat renderer renders the open-chat close button'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '@keyframes secure-chat-slide-close' 'Secure Chat body slides closed when closed'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-close-btn' 'Secure Chat close button has dedicated styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#main-content .secure-chat-emoji-button' 'Secure Chat emoji button keeps its transparent icon style after global button resets'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#main-content .secure-chat-voice-btn' 'Secure Chat voice button keeps its transparent icon style after global button resets'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'not(.secure-chat-emoji-button):not(.secure-chat-voice-btn)' 'Lapidarist theme excludes Secure Chat icon buttons from generic raised button shadows'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'prefers-reduced-motion: reduce' 'Secure Chat open animation respects reduced motion'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'handleSecureChatStartClick' 'contact page start chat action opens and refreshes the chat'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatHtml + videoChatHtml + managedLightningNoteHtml()' 'contact page renders widgets above contact methods'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'Contact Information' 'contact page labels the contact method section after widgets'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'margin-bottom: 1rem;' 'Secure Chat panel uses normal spacing before contact information'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'sendWithModifier: false' 'secure chat Enter-to-send is the default shortcut mode'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secure-chat-send-modifier' 'contact page renders the modified Enter shortcut as a checkbox'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatShortcutModifierLabel' 'contact page renders an OS-specific Secure Chat shortcut modifier label'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'event.shiftKey' 'secure chat preserves Shift+Enter for newlines'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'state.chat.sendWithModifier === true && !(event.metaKey || event.ctrlKey)' 'secure chat only requires Cmd/Ctrl+Enter when the checkbox is enabled'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'secure-chat-send-modifier' 'shared secure chat renderer includes the modified Enter checkbox'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'shortcutModifierLabel' 'shared secure chat renderer supports an OS-specific shortcut modifier label'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'Cmd/Ctrl+Enter to send' 'shared secure chat renderer no longer shows a generic Cmd/Ctrl shortcut label'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'state.sendWithModifier === true && !(event.metaKey || event.ctrlKey)' 'shared secure chat renderer sends on Enter by default'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secure-chat-send-spinner' 'contact page shows a spinner while a Secure Chat message is sending'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'formatRelativeTime' 'contact page shared renderer shows friendly relative message timestamps'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatRelativeTime' 'contact page fallback renderer shows friendly relative message timestamps'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'aria-busy="true"' 'contact page marks Secure Chat send button busy while sending'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'secure-chat-send-spinner' 'shared secure chat renderer shows a spinner while sending'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secure-chat-attach-icon' 'contact page renders Secure Chat attachments as a paperclip icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'secure-chat-attach-icon' 'shared secure chat renderer renders attachments as a paperclip icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secure-chat-simplex-info' 'contact page renders the SimpleX/simplex-web info banner'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'secure-chat-simplex-info' 'shared secure chat renderer renders the SimpleX/simplex-web info banner'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'https://github.com/andersaamodt/simplex-web' 'contact page links Secure Chat to simplex-web'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'https://github.com/andersaamodt/simplex-web' 'shared secure chat renderer links Secure Chat to simplex-web'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'dismiss-simplex-info' 'contact page can dismiss the simplex-web info banner'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'dismiss-simplex-info' 'shared secure chat renderer exposes a dismiss action for the simplex-web info banner'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'simplexWebIntroDismissed' 'contact page persists one-time simplex-web info dismissal'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secure-chat-simplex-web-info-dismissed-v2' 'contact page stores simplex-web info dismissal separately from message history'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'secureChatSimplexInfoDismissedFromBrowser()' 'contact page reloads simplex-web info dismissal before hydrating messages'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "thread.querySelector('.secure-chat-simplex-info')" 'secure chat message-log render keeps simplex-web info visible while it is present'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'replaceWith(stableSimplexInfo)' 'contact page preserves the simplex-web info banner node across content refreshes'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'replaceWith(stableSimplexInfo)' 'shared secure chat renderer preserves the simplex-web info banner node across renders'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-session-store.js" 'simplexWebIntroDismissed' 'shared session store persists one-time simplex-web info dismissal'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "transportKey === 'github'" 'contact page recognizes GitHub as a first-class contact transport'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "'https://github.com/' + raw" 'contact page renders GitHub usernames as profile links'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "github\\.com\\/([a-z0-9][a-z0-9-]{0,38})" 'contact page normalizes full GitHub profile URLs to usernames'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-attach-icon' 'secure chat paperclip icon has dedicated styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-pending-file' 'secure chat pending attachment pills have dedicated styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-panel.is-file-drop-over' 'secure chat panel has a visible file drop target state'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-simplex-info' 'secure chat simplex-web info banner has dedicated styling'
secure_chat_simplex_info_css=$(sed -n '/^\.secure-chat-simplex-info {/,/^}/p' "$SITE_SOURCE_ROOT/static/style.css")
assert_contains "$secure_chat_simplex_info_css" 'position: sticky;' 'secure chat simplex-web info banner stays visible at the top of the message scroller'
assert_contains "$secure_chat_simplex_info_css" 'z-index:' 'secure chat simplex-web info banner floats above messages until dismissed'
assert_contains "$secure_chat_simplex_info_css" 'flex: 0 0 auto;' 'secure chat simplex-web info banner keeps stable height in the flex scroller'
secure_chat_simplex_dismiss_css=$(sed -n '/^\.secure-chat-simplex-dismiss {/,/^}/p' "$SITE_SOURCE_ROOT/static/style.css")
assert_contains "$secure_chat_simplex_dismiss_css" 'border: 0;' 'secure chat simplex-web info dismiss control has no border'
assert_contains "$secure_chat_simplex_dismiss_css" 'background: transparent;' 'secure chat simplex-web info dismiss control has no resting background'
secure_chat_simplex_dismiss_hover_css=$(sed -n '/^\.secure-chat-simplex-dismiss:hover {/,/^}/p' "$SITE_SOURCE_ROOT/static/style.css")
assert_contains "$secure_chat_simplex_dismiss_hover_css" 'background:' 'secure chat simplex-web info dismiss control only gains background on hover'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-simplex-dismiss svg' 'secure chat simplex-web info dismiss control uses an SVG icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '--secure-chat-paper-texture' 'secure chat defines a paper texture token'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background-image: var(--secure-chat-paper-surface);' 'secure chat panel uses the paper texture surface'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'var(--secure-chat-paper-texture)' 'secure chat panel and bubbles reuse the paper texture asset'
secure_chat_input_css=$(sed -n '/^\.secure-chat-input {/,/^}/p' "$SITE_SOURCE_ROOT/static/style.css")
assert_contains "$secure_chat_input_css" 'background-image: none;' 'secure chat compose input does not use paper texture'
assert_not_contains "$secure_chat_input_css" 'var(--secure-chat-paper-texture)' 'secure chat compose input avoids the paper texture asset'
assert_contains "$secure_chat_input_css" 'scroll-padding-bottom:' 'secure chat compose input reserves scroll space above the control row'
secure_chat_input_wrap_after_css=$(sed -n '/^\.secure-chat-input-wrap::after {/,/^}/p' "$SITE_SOURCE_ROOT/static/style.css")
assert_contains "$secure_chat_input_wrap_after_css" 'height: 3.05rem;' 'secure chat compose input draws a dedicated bottom control strip'
assert_contains "$secure_chat_input_wrap_after_css" 'pointer-events: none;' 'secure chat compose control strip does not steal textarea focus'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'sessionCheckGraceCount < 2' 'nav auth tolerates one transient failed session check before clearing login state'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'scheduleSessionCheckRetry(token)' 'nav auth retries noisy session checks before tearing down signer auth state'
assert_file_contains "$ROOT_DIR/cgi/ssh-auth-check-session" 'simplex_contact_info' 'session bootstrap exposes SimpleX account info'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'account-simplex-contact' 'account page renders SimpleX contact field'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
