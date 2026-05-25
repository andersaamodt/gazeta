#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

assert_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s\n' "$haystack" | awk -v needle="$needle" 'index($0, needle) { found=1 } END { exit found ? 0 : 1 }'; then
    pass
  else
    fail "$label (missing: $needle)"
  fi
}

assert_not_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s\n' "$haystack" | awk -v needle="$needle" 'index($0, needle) { found=1 } END { exit found ? 0 : 1 }'; then
    fail "$label (unexpected: $needle)"
  else
    pass
  fi
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/zaps-runtime-test.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=testsite
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
BIN_DIR="$TMP_ROOT/bin"

mkdir -p "$SITE_ROOT/site/pages" "$SITES_DIR/.sitedata/$SITE_NAME" "$BIN_DIR"

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

export PATH="$BIN_DIR:$PATH"
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-nostr-pages-common.sh"

blog_init

config-set "$blog_site_conf" plugin_nostr_support true
config-set "$blog_site_conf" plugin_zaps true
config-set "$blog_site_conf" zaps_enabled true
printf '%s\n' 'npub1siteexamplewalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' > "$blog_nostr_state_dir/site_npub"
printf '%s\n' '1111111111111111111111111111111111111111111111111111111111111111' > "$blog_nostr_state_dir/site_pubkey"

normalized=$(blog_contact_normalize_state_json "contact" '{
  "slug":"contact",
  "rows":[
    {"transport":"email","value":"hello@example.com","qualifier":"public"},
    {"transport":"lightning","value":"old@example.com","qualifier":"preferred"}
  ]
}')
assert_contains "$normalized" '"transport":"lightning"' 'contact normalize keeps a lightning row when zaps are enabled'
assert_contains "$normalized" '"value":"old@example.com"' 'contact normalize preserves the lightning row from page data'
assert_contains "$normalized" '"transport":"email"' 'contact normalize keeps non-lightning rows'

enriched=$(blog_contact_validate_and_enrich_state_json "$normalized" false)
assert_contains "$enriched" '"lud16":"old@example.com"' 'contact validation publishes the lightning row from page data'
assert_contains "$enriched" '"email_public":"hello@example.com"' 'contact validation preserves normal contact rows'
assert_contains "$enriched" '"contact_row_order":["email_public","lud16"]' 'contact validation serializes explicit row order for hydration'
if printf '%s' "$enriched" | grep -Fq 'lightning_preferred'; then
  fail 'contact validation should not serialize lightning rows as generic contact keys'
else
  pass
fi

event_content=$(printf '%s\n' "$enriched" | jq -c '.content_json')
event_json=$(jq -cn --arg content "$event_content" '{content:$content}')
restored_order=$(blog_contact_state_from_event_json contact "$event_json" | jq -r '.rows | map(.transport + ":" + .qualifier + ":" + .value) | join("|")')
assert_contains "$restored_order" 'email:public:hello@example.com|lightning:preferred:old@example.com' 'contact canonical hydration preserves authored row order from kind-0 metadata'

page_payload=$(printf '%s\n' "$normalized" | jq -c '.')
assert_contains "$page_payload" '"content_json":{"title":"Contact","lud16":"old@example.com"' 'normalized contact state includes page-data lud16 in content_json'
assert_contains "$(blog_zap_effective_lud16)" 'npub1siteexamplewalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@npub.cash' 'effective zap lud16 falls back to the demo wallet'

config-set "$blog_site_conf" zap_lud16 "demo@wallet.example"
assert_contains "$(blog_zap_effective_lud16)" 'demo@wallet.example' 'configured lud16 overrides the demo wallet'

assert_contains "$(cat "$ROOT_DIR/site/includes/head.html")" '/static/zap-ui.js' 'head includes shared zap UI bundle'
assert_contains "$(cat "$ROOT_DIR/site/includes/head.html")" '/static/post-context.js?v=' 'head cache-busts shared post context interactions'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'blogZapUi.render' 'post pages mount shared zap UI'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" "display: 'compact'" 'post pages render compact zap button'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'if (!nostr) {' 'post pages gate zap UI behind published Nostr metadata'
assert_not_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'post-nostr-proof' 'post pages do not render Nostr Proof panel'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" "ensureCommentShell(layout)" 'post comments mount after the enhanced post card body'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" "anchor === document.body ? 'beforeend' : 'afterend'" 'post comments mount outside the main post island'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'post-comment post-comment-island' 'each mirrored post comment renders as an island'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'copy_nostr_address' 'single post menu exposes public Nostr address copy action'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'copy_nostr_event' 'single post menu exposes public Nostr event copy action'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'data-post-page-admin-action' 'single post admin menu actions are independently gated'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" "document.querySelector('.post-single-item')" 'normal post shells skip early route repair so enhancements run'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" "document.readyState === 'loading'" 'post context runs immediately when Safari has already parsed the document'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'openAddToListDialog(currentRelPath, token, csrf)' 'single post add-to-list menu opens the modal flow'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'data-post-add-list-form' 'single post add-to-list modal has a submit form'
assert_contains "$(cat "$ROOT_DIR/site/static/style.css")" '.post-page-modal-panel' 'single post add-to-list modal has page-level styling'
assert_contains "$(cat "$ROOT_DIR/site/static/style.css")" '.post-comment-island' 'comment form and comments have independent island styling'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" '/cgi/blog-btc-usd-rate' 'zap UI fetches the current BTC/USD rate'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "cache: 'no-store'" 'zap UI bypasses browser cache for BTC/USD rate checks'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "satsWithUsdLabel" 'zap UI renders USD equivalents beside sats'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'function zapIconHtml()' 'zap UI renders a standard lightning-bolt icon'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'aria-label="Zap this post"' 'compact zap icon keeps an accessible label'
assert_contains "$(cat "$ROOT_DIR/site/static/contact-page.js")" 'data-contact-zap-open' 'contact page renders the zap address as a clickable table value'
assert_contains "$(cat "$ROOT_DIR/site/static/contact-page.js")" 'data-contact-zap-address' 'contact page passes only the clicked zap address into the zap modal'
assert_contains "$(cat "$ROOT_DIR/site/static/contact-page.js")" 'window.blogZapUi.open' 'contact page opens the shared zap modal from the table link'
assert_contains "$(cat "$ROOT_DIR/site/static/contact-page.js")" "return isLightningTransport(value) ? 'Zap'" 'contact page labels lightning profile rows as Zap'
assert_not_contains "$(cat "$ROOT_DIR/site/static/contact-page.js")" 'Zaps use <code>' 'contact page does not render a managed zap notice'
assert_not_contains "$(cat "$ROOT_DIR/site/static/contact-page.js")" 'managedLightningNoteHtml' 'contact page does not inject Admin zap config into contact content'
assert_contains "$(cat "$ROOT_DIR/site/static/contact-page.js")" 'renderContentWithRowFlip(beforeLiveMove)' 'contact row dragging reorders with FLIP instead of insertion lines'
assert_not_contains "$(cat "$ROOT_DIR/site/static/style.css")" '.contact-profile-row.is-drag-over-before' 'contact row drag target no longer shows an insertion line'
assert_contains "$(cat "$ROOT_DIR/site/static/style.css")" 'touch-action: none;' 'contact drag handle avoids browser gesture interference'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'open: function (rawOptions)' 'shared zap UI exposes direct modal opening for profile links'
assert_contains "$(blog_zaps_config_json)" '"recipient_pubkey":"1111111111111111111111111111111111111111111111111111111111111111"' 'zap config exposes the site pubkey for profile zaps'
assert_contains "$(cat "$ROOT_DIR/site/static/style.css")" 'width: calc(2rem - 1px);' 'compact zap button is optically sized for the post header'
assert_contains "$(cat "$ROOT_DIR/site/static/style.css")" 'transform: translate(-0.5px, 0);' 'compact zap icon is optically centered in the round button'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "'100'" 'zap UI includes 100 sats as a small test/default amount'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "'1000'" 'zap UI includes 1000 sats as the normal default/preset amount'
assert_not_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "'10000'" 'zap UI omits the old 10000 sats preset'
assert_not_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "'21000'" 'zap UI omits the old 21000 sats preset'
assert_not_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'zapAmountName' 'zap UI does not name amount tiers'
assert_not_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'zap-amount-chip-name' 'zap UI amount chips do not render tier-name labels'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'Creating a copyable Lightning invoice...' 'zap UI creates a copyable invoice when no Nostr signer is present'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'function copyIconHtml()' 'zap UI renders inline copy icons for machine strings'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'aria-label="Copy Lightning invoice"' 'zap invoice box includes a one-click copy button'
assert_contains "$(cat "$ROOT_DIR/site/static/style.css")" '.machine-string-copy' 'zap invoice copy button is positioned inside machine string fields'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'revealInvoiceControls' 'zap UI scrolls and focuses the invoice after creation'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'signerIsAvailable' 'zap UI checks shared signer availability before attempting a signed zap'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'return requestInvoice(modalState.options, null' 'zap UI does not block invoice creation on missing signer'
assert_not_contains "$(cat "$ROOT_DIR/site/static/contact-page.js")" 'contact-zap-host' 'contact page keeps zap inside the contact table'
assert_not_contains "$(cat "$ROOT_DIR/cgi/blog-prerender-nostr-page-bootstraps")" 'contact-zap-host' 'contact first frame keeps zap inside the contact table'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "['p', recipientPubkey]" 'zap request p tag uses the LNURL provider recipient pubkey'
assert_not_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "['p', target.recipientPubkey]" 'zap request p tag does not use the post author pubkey as the zap recipient'
assert_contains "$(cat "$ROOT_DIR/.headquarters/scripts/ensure-site-zap-endpoint.sh")" 'mode": "nostr_zap" if zap_request_json else "lightning_invoice"' 'zap endpoint records unsigned invoice fallback separately from signed zaps'
assert_contains "$(cat "$ROOT_DIR/.headquarters/scripts/ensure-site-zap-endpoint.sh")" 'create_invoice(amount_msat, None, comment_value)' 'zap endpoint creates invoices without requiring a Nostr zap request'
assert_contains "$(cat "$ROOT_DIR/.headquarters/scripts/ensure-site-zap-endpoint.sh")" 'def zap_request_from_description(description):' 'zap endpoint safely distinguishes Nostr zap receipts from plain Lightning invoices'
assert_contains "$(cat "$ROOT_DIR/.headquarters/scripts/ensure-site-zap-endpoint.sh")" 'if not isinstance(payload, dict):' 'zap receipt worker ignores LNURL metadata arrays without crashing'
assert_contains "$(cat "$ROOT_DIR/.headquarters/scripts/ensure-site-zap-endpoint.sh")" 'tags.append(["amount", str(amount_msat)])' 'zap receipts include amount tags for Bellheim-compatible threshold handling'
assert_contains "$(cat "$ROOT_DIR/.headquarters/scripts/ensure-site-zap-endpoint.sh")" 'paid invoice {label} could not be processed' 'zap receipt worker keeps running after unexpected invoice payloads'
assert_contains "$(cat "$ROOT_DIR/.headquarters/scripts/ensure-site-zap-endpoint.sh")" 'lightning_public_host)' 'zap endpoint can use a dedicated Lightning host without a stale local lightningd dependency'
assert_not_contains "$(cat "$ROOT_DIR/.headquarters/scripts/ensure-site-zap-endpoint.sh")" '/.well-known/lnurlp/anders' 'zap endpoint does not hard-code a personal legacy localpart'
assert_contains "$(cat "$ROOT_DIR/.headquarters/scripts/ensure-site-zap-endpoint.sh")" 'if name and name not in supported_names:' 'nostr well-known returns the site names when queried without a name'
assert_contains "$(cat "$ROOT_DIR/.headquarters/scripts/ensure-site-zap-endpoint.sh")" 'write_server_hook' 'zap endpoint always installs the site-domain well-known hook'
assert_contains "$(cat "$ROOT_DIR/site/static/style.css")" '.zap-dialog-secondary-grid' 'zap modal groups custom amount and comment as secondary controls'
assert_contains "$(cat "$ROOT_DIR/site/static/style.css")" '.zap-dialog-head h3' 'zap modal uses one primary heading'
assert_not_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'Lightning Zap' 'zap modal does not render a redundant kicker heading'
assert_contains "$(cat "$ROOT_DIR/cgi/blog-btc-usd-rate")" 'api.exchange.coinbase.com/products/BTC-USD/ticker' 'BTC/USD endpoint uses Coinbase ticker data'
assert_not_contains "$(cat "$ROOT_DIR/site/static/nip23-page.js")" 'nip23-zap-host' 'nip23 pages do not render zap UI'
assert_not_contains "$(cat "$ROOT_DIR/site/static/contact-page.js")" 'Lightning zaps use' 'contact page copy calls this Zap, not Lightning contact info'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
