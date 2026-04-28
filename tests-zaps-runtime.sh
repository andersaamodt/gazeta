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

normalized=$(blog_contact_normalize_state_json "contact" '{
  "slug":"contact",
  "rows":[
    {"transport":"email","value":"hello@example.com","qualifier":"public"},
    {"transport":"lightning","value":"old@example.com","qualifier":"preferred"}
  ]
}')
assert_contains "$normalized" '"transport":"lightning"' 'contact normalize keeps a lightning row when zaps are enabled'
assert_contains "$normalized" '"value":"npub1siteexamplewalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@npub.cash"' 'contact normalize replaces lightning row with the demo lud16 when no manual address is configured'
assert_contains "$normalized" '"transport":"email"' 'contact normalize keeps non-lightning rows'

enriched=$(blog_contact_validate_and_enrich_state_json "$normalized" false)
assert_contains "$enriched" '"lud16":"npub1siteexamplewalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@npub.cash"' 'contact validation publishes managed demo lud16'
assert_contains "$enriched" '"email_public":"hello@example.com"' 'contact validation preserves normal contact rows'
if printf '%s' "$enriched" | grep -Fq 'lightning_preferred'; then
  fail 'contact validation should not serialize lightning rows as generic contact keys'
else
  pass
fi

page_payload=$(printf '%s\n' "$normalized" | jq -c '.')
assert_contains "$page_payload" '"content_json":{"title":"Contact","lud16":"npub1siteexamplewalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@npub.cash"' 'normalized contact state includes managed demo lud16 in content_json'
assert_contains "$(blog_zap_effective_lud16)" 'npub1siteexamplewalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@npub.cash' 'effective zap lud16 falls back to the demo wallet'

config-set "$blog_site_conf" zap_lud16 "demo@wallet.example"
assert_contains "$(blog_zap_effective_lud16)" 'demo@wallet.example' 'configured lud16 overrides the demo wallet'

assert_contains "$(cat "$ROOT_DIR/site/includes/head.html")" '/static/zap-ui.js' 'head includes shared zap UI bundle'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'blogZapUi.render' 'post pages mount shared zap UI'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" "display: 'compact'" 'post pages render compact zap button'
assert_not_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'post-nostr-proof' 'post pages do not render Nostr Proof panel'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" "ensureCommentShell(layout)" 'post comments mount after the enhanced post card body'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'openAddToListDialog(currentRelPath, token, csrf)' 'single post add-to-list menu opens the modal flow'
assert_contains "$(cat "$ROOT_DIR/site/static/post-context.js")" 'data-post-add-list-form' 'single post add-to-list modal has a submit form'
assert_contains "$(cat "$ROOT_DIR/site/static/style.css")" '.post-page-modal-panel' 'single post add-to-list modal has page-level styling'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" '/cgi/blog-btc-usd-rate' 'zap UI fetches the current BTC/USD rate'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "cache: 'no-store'" 'zap UI bypasses browser cache for BTC/USD rate checks'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "satsWithUsdLabel" 'zap UI renders USD equivalents beside sats'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'function zapIconHtml()' 'zap UI renders a standard lightning-bolt icon'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" 'aria-label="Zap this post"' 'compact zap icon keeps an accessible label'
assert_contains "$(cat "$ROOT_DIR/site/static/zap-ui.js")" "'1000'" 'zap UI includes 1000 sats as the normal default/preset amount'
assert_contains "$(cat "$ROOT_DIR/cgi/blog-btc-usd-rate")" 'api.exchange.coinbase.com/products/BTC-USD/ticker' 'BTC/USD endpoint uses Coinbase ticker data'
assert_not_contains "$(cat "$ROOT_DIR/site/static/nip23-page.js")" 'nip23-zap-host' 'nip23 pages do not render zap UI'
assert_not_contains "$(cat "$ROOT_DIR/site/static/contact-page.js")" 'contact-zap-host' 'contact pages do not render zap UI'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
