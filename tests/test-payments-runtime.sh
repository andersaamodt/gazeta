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
  https://api.printful.com/stores)
    body='{"code":200,"result":[{"id":12345,"name":"Gazeta API Store","type":"manual_order"}]}'
    if [ -n "$output_file" ]; then
      printf '%s\n' "$body" > "$output_file"
      [ -n "$write_out" ] && printf '200'
    else
      printf '%s\n' "$body"
    fi
    ;;
  https://api.printful.com/sync/products?limit=100)
    body='{"code":200,"result":[{"id":777,"name":"Printful Shirt","thumbnail_url":"https://img.example/shirt.png","variants":2,"synced":2}]}'
    if [ -n "$output_file" ]; then
      printf '%s\n' "$body" > "$output_file"
      [ -n "$write_out" ] && printf '200'
    else
      printf '%s\n' "$body"
    fi
    ;;
  https://api.printful.com/sync/products/777|https://api.printful.com/sync/products/printful-shirt)
    body='{"code":200,"result":{"sync_product":{"id":777,"name":"Printful Shirt","thumbnail_url":"https://img.example/shirt.png"},"sync_variants":[{"id":111,"external_id":"shirt-small","name":"Small","retail_price":"30.00","variant_id":4011},{"id":112,"external_id":"shirt-large","name":"Large","retail_price":"32.00","variant_id":4012}]}}'
    if [ -n "$output_file" ]; then
      printf '%s\n' "$body" > "$output_file"
      [ -n "$write_out" ] && printf '200'
    else
      printf '%s\n' "$body"
    fi
    ;;
  https://api.printful.com/shipping/rates)
    [ "$method" = "POST" ] || exit 22
    body='{"code":200,"result":[{"id":"STANDARD","name":"Standard","rate":"4.99","currency":"USD","minDeliveryDays":3,"maxDeliveryDays":7}]}'
    if [ -n "$output_file" ]; then
      printf '%s\n' "$body" > "$output_file"
      [ -n "$write_out" ] && printf '200'
    else
      printf '%s\n' "$body"
    fi
    ;;
  https://api.printful.com/orders)
    [ "$method" = "POST" ] || exit 22
    body='{"code":200,"result":{"id":98765,"external_id":"gazeta-order","status":"draft"}}'
    if [ -n "$output_file" ]; then
      printf '%s\n' "$body" > "$output_file"
      [ -n "$write_out" ] && printf '201'
    else
      printf '%s\n' "$body"
    fi
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
},{
  slug:"merch-shirt",
  type:"nip23",
  kind:30023,
  show_in_nav:false,
  placeholder_title:"Merch Shirt",
  path:"/merch-shirt"
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

merch_state=$(jq -cn '{
  slug:"merch-shirt",
  type:"nip23",
  title:"Merch Shirt",
  content:"Merch product body",
  product_enabled:true,
  product_type:"merch",
  price:"30.00",
  currency:"USD",
  crypto_discount_percent:0,
  purchase_endpoint:"/checkout?product=merch-shirt",
  image_url:"https://img.example/shirt.png",
  fulfillment_provider:"printful",
  printful_product_id:"777",
  variants:[{
    id:"111",
    name:"Small",
    price:"30.00",
    currency:"USD",
    image_url:"https://img.example/shirt-small.png",
    fulfillment_provider:"printful",
    printful_sync_variant_id:"111",
    printful_external_variant_id:"shirt-small",
    printful_variant_id:"4011"
  },{
    id:"112",
    name:"Large",
    price:"32.00",
    currency:"USD",
    image_url:"https://img.example/shirt-large.png",
    fulfillment_provider:"printful",
    printful_sync_variant_id:"112",
    printful_external_variant_id:"shirt-large",
    printful_variant_id:"4012"
  }],
  extras_after:"",
  extras_after_format:"markdown"
}')
blog_nostr_page_save_draft_state_json "merch-shirt" "nip23" "$merch_state"

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

run_payments_cgi_body() {
  query=$1
  body=$2
  host=${3-blog.example.com}
  len=$(printf '%s' "$body" | wc -c | tr -d '[:space:]')
  printf '%s' "$body" | REQUEST_METHOD=POST QUERY_STRING="$query" HTTP_HOST="$host" CONTENT_TYPE="application/json" CONTENT_LENGTH="$len" "$ROOT_DIR/cgi/blog-payments" 2>&1
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

run_manage_merch_cgi() {
  query=$1
  method=${2-GET}
  REQUEST_METHOD="$method" QUERY_STRING="$query" HTTP_HOST="blog.example.com" "$ROOT_DIR/cgi/blog-manage-merch" 2>&1
}

# 1) Public runtime status keys.
status_out=$(run_payments_cgi 'action=status')
assert_contains "$status_out" '"success":true' 'payments status succeeds'
assert_contains "$status_out" '"commerce_enabled":true' 'payments status reports commerce plugin enabled by default'
assert_contains "$status_out" '"btcpay_host":"pay.blog.example.com"' 'payments status derives btcpay host from request host'
assert_contains "$status_out" '"btcpay_url":"https://pay.blog.example.com"' 'payments status emits btcpay url'
assert_contains "$status_out" '"ramp_host_api_key":' 'payments status includes ramp runtime key'
assert_contains "$status_out" '"paybis_partner_id":' 'payments status includes paybis runtime key'
config-set "$blog_site_conf" btcpay_rootpath /btcpay
status_rootpath_out=$(run_payments_cgi 'action=status')
assert_contains "$status_rootpath_out" '"btcpay_url":"https://pay.blog.example.com/btcpay"' 'payments status includes btcpay root path'

config-set "$blog_site_conf" plugin_ramp true
SECRET_DIR="$SITE_DATA/secrets"
mkdir -p "$SECRET_DIR"
RAMP_SECRET_FILE="$SECRET_DIR/ramp-host-api-key"
PRINTFUL_SECRET_FILE="$SECRET_DIR/printful-api-token"
printf '%s\n' test-ramp-key > "$RAMP_SECRET_FILE"
printf '%s\n' test-printful-token > "$PRINTFUL_SECRET_FILE"
chmod 600 "$RAMP_SECRET_FILE" "$PRINTFUL_SECRET_FILE" 2>/dev/null || true
config-set "$blog_site_conf" ramp_host_api_key_file "$RAMP_SECRET_FILE"
config-set "$blog_site_conf" ramp_btc_address bc1qmerchant
config-set "$blog_site_conf" ramp_webhook_signature_required false
config-set "$blog_site_conf" payments_webhook_secret webhook-secret
config-set "$blog_site_conf" plugin_merch_store true
config-set "$blog_site_conf" printful_api_token_file "$PRINTFUL_SECRET_FILE"
config-set "$blog_site_conf" printful_store_id test-printful-store
config-set "$blog_site_conf" printful_confirm_orders false
status_connected_out=$(run_payments_cgi 'action=status')
assert_contains "$status_connected_out" '"ramp_configured":true' 'payments status reports configured Ramp plugin'
assert_contains "$status_connected_out" '"printful_configured":true' 'payments status reports configured Printful plugin'

# 2) Product lookup works for cart bootstrap.
product_out=$(run_product_cgi 'slug=sample-product')
assert_contains "$product_out" '"success":true' 'product lookup succeeds'
assert_contains "$product_out" '"slug":"sample-product"' 'product lookup includes slug'
assert_contains "$product_out" '"price":"' 'product lookup includes price field'
merch_product_out=$(run_product_cgi 'slug=merch-shirt')
assert_contains "$merch_product_out" '"product_type":"merch"' 'merch product lookup includes merch type'
assert_contains "$merch_product_out" '"fulfillment_provider":"printful"' 'merch product lookup includes Printful provider'
assert_contains "$merch_product_out" '"variants":' 'merch product lookup includes variants'

merch_items_json=$(printf '%s' '[{"slug":"merch-shirt","variant_id":"111","qty":1}]')
merch_no_shipping=$(run_payments_cgi "action=create_order&payment_method=credit&provider=ramp&items_json=$(blog_url_encode "$merch_items_json")")
assert_contains "$merch_no_shipping" '"code":"shipping_required"' 'merch create_order requires shipping recipient'

recipient_json=$(printf '%s' '{"name":"Ada Buyer","email":"ada@example.com","phone":"555-0100","address1":"1 Main St","city":"New York","state_code":"NY","country_code":"US","zip":"10001"}')
merch_create_out=$(run_payments_cgi "action=create_order&payment_method=credit&provider=ramp&items_json=$(blog_url_encode "$merch_items_json")&recipient_json=$(blog_url_encode "$recipient_json")")
assert_contains "$merch_create_out" '"success":true' 'merch create_order succeeds with shipping'
assert_contains "$merch_create_out" '"shipping":"4.99"' 'merch order stores Printful shipping'
assert_contains "$merch_create_out" '"total":"34.99"' 'merch order total includes shipping'
assert_contains "$merch_create_out" '"provider_url":"https://app.rampnetwork.com/' 'merch order uses Ramp app URL'
assert_contains "$merch_create_out" 'inAssetValue=3499' 'Ramp URL uses total in minor fiat units'
assert_contains "$merch_create_out" 'userAddress=bc1qmerchant' 'Ramp URL sends BTC to configured merchant address'
assert_contains "$merch_create_out" 'webhookStatusUrl=' 'Ramp URL includes webhook status URL'
merch_order_id=$(printf '%s\n' "$merch_create_out" | sed -n 's/.*"order_id":"\([^"]*\)".*/\1/p' | head -n 1)
assert_nonempty "$merch_order_id" 'merch create_order returns order_id'

ramp_wrong_receiver=$(run_payments_cgi_body "action=webhook&provider=ramp&order_id=$merch_order_id&webhook_secret=webhook-secret" '{"type":"RELEASED","purchase":{"userAddress":"bc1qwrong"}}')
assert_contains "$ramp_wrong_receiver" '"code":"ramp_receiver_mismatch"' 'Ramp webhook rejects wrong BTC receiver address'
ramp_webhook_body='{"type":"RELEASED","purchase":{"userAddress":"bc1qmerchant"}}'
ramp_webhook_out=$(run_payments_cgi_body "action=webhook&provider=ramp&order_id=$merch_order_id&webhook_secret=webhook-secret" "$ramp_webhook_body")
assert_contains "$ramp_webhook_out" '"success":true' 'Ramp webhook succeeds for released purchase'
assert_contains "$ramp_webhook_out" '"status":"paid"' 'Ramp webhook marks merch order paid'
assert_contains "$ramp_webhook_out" '"fulfillment_status":"draft"' 'paid merch order creates Printful draft fulfillment'
assert_contains "$ramp_webhook_out" '"printful_order_id":"98765"' 'paid merch order stores Printful order id'

manage_merch_status=$(run_manage_merch_cgi "action=status&session_token=$session_token&csrf_token=$csrf_token")
assert_contains "$manage_merch_status" '"printful_api_ready":true' 'merch manager status validates Printful API'
manage_merch_save=$(run_manage_merch_cgi "action=save_config&printful_api_token=saved-printful-token&session_token=$session_token&csrf_token=$csrf_token" POST)
assert_contains "$manage_merch_save" '"success":true' 'merch manager saves Printful token'
assert_contains "$(cat "$PRINTFUL_SECRET_FILE")" 'saved-printful-token' 'merch manager writes Printful token to configured secret file'
manage_merch_import=$(run_manage_merch_cgi "action=import_printful_product&printful_product_id=777&session_token=$session_token&csrf_token=$csrf_token" POST)
assert_contains "$manage_merch_import" '"success":true' 'merch manager imports Printful product'
assert_contains "$manage_merch_import" '"slug":"printful-shirt"' 'merch import slugifies Printful product name'
imported_product_out=$(run_product_cgi 'slug=printful-shirt')
assert_contains "$imported_product_out" '"product_type":"merch"' 'imported Printful product is a merch product'
pages_after_import=$(blog_nostr_pages_load_json)
assert_contains "$pages_after_import" '"slug":"printful-shirt"' 'imported Printful product is added to page registry'
assert_contains "$pages_after_import" '"show_in_nav":false' 'imported Printful product stays unlisted from navbar'
manage_merch_list=$(run_manage_merch_cgi "action=list_products&session_token=$session_token&csrf_token=$csrf_token")
assert_contains "$manage_merch_list" '"merch_products":' 'merch manager lists curation rows'
assert_contains "$manage_merch_list" '"source_id":"777"' 'merch manager list includes Printful product source id'
merch_selection_json=$(jq -cn '{items:[{provider:"printful",source_type:"sync_product",source_id:"777",sync_enabled:true,show_on_merch_page:true,sort_order:0}]}')
manage_merch_selection=$(run_manage_merch_cgi "action=save_selection&selection_json=$(blog_url_encode "$merch_selection_json")&session_token=$session_token&csrf_token=$csrf_token" POST)
assert_contains "$manage_merch_selection" '"success":true' 'merch manager saves selected Printful products'
assert_contains "$manage_merch_selection" '"show_on_merch_page":true' 'merch manager preserves show-on-merch flag'
manage_merch_sync=$(run_manage_merch_cgi "action=sync_selected&session_token=$session_token&csrf_token=$csrf_token" POST)
assert_contains "$manage_merch_sync" '"success":true' 'merch manager syncs selected Printful products'
assert_contains "$manage_merch_sync" '"path":"/merch"' 'merch manager updates merch landing page'
merch_page_state=$(blog_nostr_page_load_draft_state_json "merch" "nip23")
assert_contains "$merch_page_state" '"title":"Merchandise"' 'merch landing page is a Nostr-backed draft'
assert_contains "$merch_page_state" 'data-merch-add' 'merch landing page includes add-to-cart button'
assert_contains "$merch_page_state" 'printful-shirt' 'merch landing page includes selected product slug'
pages_after_merch_sync=$(blog_nostr_pages_load_json)
assert_contains "$pages_after_merch_sync" '"slug":"merch"' 'merch landing page is added to page registry'
assert_contains "$pages_after_merch_sync" '"show_in_nav":false' 'merch landing page remains unlisted from navbar'

# 3) Order create -> status flow.
items_json=$(printf '%s' '[{"slug":"sample-product","qty":2}]')
create_out=$(run_payments_cgi "action=create_order&payment_method=credit&provider=ramp&items_json=$(blog_url_encode "$items_json")")
assert_contains "$create_out" '"success":true' 'create_order succeeds'
assert_contains "$create_out" '"provider":"ramp"' 'create_order keeps selected credit provider'
assert_contains "$create_out" '"provider_url":"https://app.rampnetwork.com/' 'create_order emits provider_url for ramp'
order_id=$(printf '%s\n' "$create_out" | sed -n 's/.*"order_id":"\([^"]*\)".*/\1/p' | head -n 1)
assert_nonempty "$order_id" 'create_order returns order_id'

status_order_out=$(run_payments_cgi "action=order_status&order_id=$order_id")
assert_contains "$status_order_out" "\"order_id\":\"$order_id\"" 'order_status returns requested order'
assert_contains "$status_order_out" '"status":"pending"' 'order_status starts as pending'
assert_contains "$status_order_out" '"provider_url":"https://app.rampnetwork.com/' 'order_status preserves provider_url'

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
webhook_out=$(run_payments_cgi "action=webhook&order_id=$order_id_2&provider=btcpay&payment_status=paid&webhook_secret=webhook-secret" POST)
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
