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
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    pass
  else
    fail "$label (missing: $needle)"
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

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/payments-runtime-test.XXXXXX")
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

cat > "$BIN_DIR/curl" <<'EOS'
#!/bin/sh
set -eu
url=''
method='GET'
output_file=''
write_out=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -X)
      shift
      method=${1-GET}
      ;;
    -o)
      shift
      output_file=${1-}
      ;;
    -w)
      shift
      write_out=${1-}
      ;;
    http://*|https://*)
      url=$1
      ;;
  esac
  shift || true
done
case "$url" in
  https://pay.blog.example.com/btcpay/api/v1/stores/test-store/invoices)
    [ "$method" = "POST" ] || exit 22
    body='{"id":"btcpay-invoice-1","checkoutLink":"https://pay.blog.example.com/btcpay/i/btcpay-invoice-1","status":"New"}'
    if [ -n "$output_file" ]; then
      printf '%s\n' "$body" > "$output_file"
      [ -n "$write_out" ] && printf '201'
    else
      printf '%s\n' "$body"
    fi
    ;;
  https://pay.blog.example.com/btcpay/api/v1/stores/test-store/invoices/btcpay-invoice-1)
    printf '{"id":"btcpay-invoice-1","status":"Settled"}\n'
    ;;
  *)
    exit 22
    ;;
esac
EOS
chmod +x "$BIN_DIR/curl"

export PATH="$BIN_DIR:$PATH"
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-list-common.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-public-ranking-common.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-nostr-pages-common.sh"

blog_init

AUTHOR_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
EVENT_ID=1111111111111111111111111111111111111111111111111111111111111111
mkdir -p "$blog_nostr_events_dir/$AUTHOR_KEY/30023"
printf '%s\n' "$AUTHOR_KEY" > "$blog_nostr_authors_file"
jq -cn \
  --arg id "$EVENT_ID" \
  --arg pubkey "$AUTHOR_KEY" \
  --argjson kind 30023 \
  --argjson created_at 1700000000 \
  --argjson tags '[["d","sample-product"],["title","Sample Product"],["price","25.00"],["currency","USD"],["r","/purchase/sample-product"]]' \
  --arg content "Sample product body" \
  '{id:$id,pubkey:$pubkey,kind:$kind,created_at:$created_at,tags:$tags,content:$content}' > "$blog_nostr_events_dir/$AUTHOR_KEY/30023/$EVENT_ID.json"

pages_cfg=$(jq -cn '{pages:[{
  slug:"sample-product",
  type:"nip23",
  kind:30023,
  show_in_nav:false,
  placeholder_title:"Sample Product",
  path:"/sample-product"
}]}')
blog_nostr_pages_sync_source_pages "$pages_cfg"
blog_nostr_pages_save_json "$pages_cfg"

product_state=$(jq -cn '{
  slug:"sample-product",
  type:"nip23",
  title:"Sample Product",
  content:"Sample product body",
  product_enabled:true,
  product_type:"software",
  price:"25.00",
  currency:"USD",
  crypto_discount_percent:10,
  purchase_endpoint:"/purchase/sample-product",
  repo:"owner/private-repo",
  tag:"latest",
  extras_after:"",
  extras_after_format:"markdown"
}')
blog_nostr_page_save_draft_state_json "sample-product" "nip23" "$product_state"

admin_profile=$(blog_user_profile admin)
config-set "$admin_profile" username admin
config-set "$admin_profile" fingerprint test-fingerprint
config-set "$admin_profile" is_admin true

session_parts=$(blog_create_session admin test-fingerprint)
session_token=${session_parts%%;*}
rest=${session_parts#*;}
csrf_token=${rest%%;*}

run_payments_cgi() {
  query=$1
  method=${2-GET}
  host=${3-blog.example.com}
  REQUEST_METHOD="$method" QUERY_STRING="$query" HTTP_HOST="$host" "$ROOT_DIR/cgi/blog-payments" 2>&1
}

run_product_cgi() {
  query=$1
  method=${2-GET}
  REQUEST_METHOD="$method" QUERY_STRING="$query" HTTP_HOST="blog.example.com" "$ROOT_DIR/cgi/blog-get-product" 2>&1
}

run_purchase_cgi() {
  query=$1
  method=${2-GET}
  REQUEST_METHOD="$method" QUERY_STRING="$query" HTTP_HOST="blog.example.com" "$ROOT_DIR/cgi/blog-purchase" 2>&1
}

run_download_cgi() {
  query=$1
  method=${2-GET}
  REQUEST_METHOD="$method" QUERY_STRING="$query" HTTP_HOST="blog.example.com" "$ROOT_DIR/cgi/blog-download" 2>&1
}

run_delivery_cgi() {
  query=$1
  method=${2-GET}
  REQUEST_METHOD="$method" QUERY_STRING="$query" HTTP_HOST="blog.example.com" "$ROOT_DIR/cgi/blog-delivery" 2>&1
}

# 1) Public runtime status keys.
status_out=$(run_payments_cgi 'action=status')
assert_contains "$status_out" '"success":true' 'payments status succeeds'
assert_contains "$status_out" '"btcpay_host":"pay.blog.example.com"' 'payments status derives btcpay host from request host'
assert_contains "$status_out" '"btcpay_url":"https://pay.blog.example.com"' 'payments status emits btcpay url'
assert_contains "$status_out" '"ramp_host_api_key":' 'payments status includes ramp runtime key'
assert_contains "$status_out" '"paybis_partner_id":' 'payments status includes paybis runtime key'
config-set "$blog_site_conf" btcpay_rootpath /btcpay
status_rootpath_out=$(run_payments_cgi 'action=status')
assert_contains "$status_rootpath_out" '"btcpay_url":"https://pay.blog.example.com/btcpay"' 'payments status includes btcpay root path'

# 2) Product lookup works for cart bootstrap.
product_out=$(run_product_cgi 'slug=sample-product')
assert_contains "$product_out" '"success":true' 'product lookup succeeds'
assert_contains "$product_out" '"slug":"sample-product"' 'product lookup includes slug'
assert_contains "$product_out" '"price":"' 'product lookup includes price field'

# 3) Order create -> status flow.
items_json=$(printf '%s' '[{"slug":"sample-product","qty":2}]')
create_out=$(run_payments_cgi "action=create_order&payment_method=credit&provider=ramp&items_json=$(blog_url_encode "$items_json")")
assert_contains "$create_out" '"success":true' 'create_order succeeds'
assert_contains "$create_out" '"provider":"ramp"' 'create_order keeps selected credit provider'
assert_contains "$create_out" '"provider_url":"https://buy.ramp.network/' 'create_order emits provider_url for ramp'
order_id=$(printf '%s\n' "$create_out" | sed -n 's/.*"order_id":"\([^"]*\)".*/\1/p' | head -n 1)
assert_nonempty "$order_id" 'create_order returns order_id'

status_order_out=$(run_payments_cgi "action=order_status&order_id=$order_id")
assert_contains "$status_order_out" "\"order_id\":\"$order_id\"" 'order_status returns requested order'
assert_contains "$status_order_out" '"status":"pending"' 'order_status starts as pending'
assert_contains "$status_order_out" '"provider_url":"https://buy.ramp.network/' 'order_status preserves provider_url'

# 4) Simulate paid requires auth and then produces download links.
simulate_unauth=$(run_payments_cgi "action=simulate_paid&order_id=$order_id" POST)
assert_contains "$simulate_unauth" '"code":"auth_required"' 'simulate_paid requires authenticated session'

simulate_auth=$(run_payments_cgi "action=simulate_paid&order_id=$order_id&session_token=$session_token&csrf_token=$csrf_token" POST)
assert_contains "$simulate_auth" '"success":true' 'simulate_paid succeeds with admin session'
assert_contains "$simulate_auth" '"status":"paid"' 'simulate_paid marks order as paid'
assert_contains "$simulate_auth" '"/delivery/' 'simulate_paid mints durable delivery URL'
delivery_token=$(printf '%s\n' "$simulate_auth" | sed -n 's/.*"delivery_token":"\([^"]*\)".*/\1/p' | head -n 1)
assert_nonempty "$delivery_token" 'simulate_paid returns delivery token'
delivery_out=$(run_delivery_cgi "format=json&order_id=$order_id&token=$delivery_token")
assert_contains "$delivery_out" '"success":true' 'delivery page json succeeds for paid order'
assert_contains "$delivery_out" '"/download/sample-product?token=' 'delivery page mints short-lived download token'

# 5) Webhook paid path updates order.
config-set "$blog_site_conf" btcpay_store_id test-store
config-set "$blog_site_conf" btcpay_api_key test-api-key
create_out_2=$(run_payments_cgi "action=create_order&payment_method=crypto&provider=btcpay&items_json=$(blog_url_encode "$items_json")")
order_id_2=$(printf '%s\n' "$create_out_2" | sed -n 's/.*"order_id":"\([^"]*\)".*/\1/p' | head -n 1)
assert_nonempty "$order_id_2" 'second create_order returns order_id'
assert_contains "$create_out_2" '"provider_url":"https://pay.blog.example.com/btcpay/i/btcpay-invoice-1"' 'btcpay provider URL uses Greenfield checkout link'
assert_contains "$create_out_2" '"btcpay_invoice_id":"btcpay-invoice-1"' 'btcpay order stores invoice id'
webhook_out=$(run_payments_cgi "action=webhook&order_id=$order_id_2&provider=btcpay&payment_status=paid" POST)
assert_contains "$webhook_out" '"success":true' 'webhook paid succeeds'
assert_contains "$webhook_out" "\"order_id\":\"$order_id_2\"" 'webhook updates targeted order'
assert_contains "$webhook_out" '"status":"paid"' 'webhook marks order as paid'

# 6) /purchase single-product JSON path.
purchase_out=$(run_purchase_cgi 'format=json&product=sample-product&qty=1&payment_method=credit&provider=paybis')
assert_contains "$purchase_out" '"success":true' 'purchase json flow succeeds'
assert_contains "$purchase_out" '"provider":"paybis"' 'purchase flow keeps requested provider'
assert_contains "$purchase_out" '"checkout_url":"/checkout?order_id=' 'purchase flow emits checkout url'

# 7) /download rejects invalid tokens.
download_missing=$(run_download_cgi 'product=sample-product')
assert_contains "$download_missing" '"code":"missing_download_token"' 'download requires token query'
download_bad=$(run_download_cgi 'product=sample-product&token=not-a-valid-token')
assert_contains "$download_bad" '"code":"invalid_download_token"' 'download rejects invalid token signature/format'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
