#!/bin/sh
# Shared helpers for checkout, purchase tokens, and capability-based downloads.

set -eu

blog_payments_init() {
  blog_payments_dir="$blog_state_dir/payments"
  blog_payments_orders_dir="$blog_payments_dir/orders"
  blog_payments_token_secret_file="$blog_payments_dir/token_secret.key"
  mkdir -p "$blog_payments_orders_dir"
}

blog_payments_order_path() {
  order_id=${1-}
  [ -n "$order_id" ] || return 1
  printf '%s/%s.json\n' "$blog_payments_orders_dir" "$order_id"
}

blog_payments_order_save_json() {
  order_id=${1-}
  json=${2-}
  [ -n "$order_id" ] || return 1
  [ -n "$json" ] || return 1
  path=$(blog_payments_order_path "$order_id")
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-payment-order.XXXXXX")
  printf '%s\n' "$json" > "$tmp"
  mv "$tmp" "$path"
  chmod 600 "$path" 2>/dev/null || true
}

blog_payments_order_load_json() {
  order_id=${1-}
  [ -n "$order_id" ] || return 1
  path=$(blog_payments_order_path "$order_id")
  [ -f "$path" ] || return 1
  cat "$path" 2>/dev/null
}

blog_payments_order_has_product() {
  order_json=${1-}
  product=${2-}
  [ -n "$order_json" ] || return 1
  product=$(blog_nostr_page_slug "$product")
  [ -n "$product" ] || return 1
  printf '%s\n' "$order_json" | jq -e --arg product "$product" 'any(.items[]?; (.slug // "") == $product)' >/dev/null 2>&1
}

blog_payments_token_secret() {
  if [ -f "$blog_payments_token_secret_file" ]; then
    secret=$(sed -n '1p' "$blog_payments_token_secret_file" 2>/dev/null | tr -d '\r\n[:space:]')
    if [ -n "$secret" ]; then
      printf '%s\n' "$secret"
      return 0
    fi
  fi
  secret=$(blog_random_token 48 | tr -d '\r\n[:space:]')
  [ -n "$secret" ] || return 1
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-payment-secret.XXXXXX")
  printf '%s\n' "$secret" > "$tmp"
  mv "$tmp" "$blog_payments_token_secret_file"
  chmod 600 "$blog_payments_token_secret_file" 2>/dev/null || true
  printf '%s\n' "$secret"
}

blog_payments_base64_encode_stdin() {
  if command -v base64 >/dev/null 2>&1; then
    base64 | tr -d '\r\n'
    return 0
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl base64 -A
    return 0
  fi
  return 1
}

blog_payments_base64url_encode_text() {
  text=${1-}
  encoded=$(printf '%s' "$text" | blog_payments_base64_encode_stdin 2>/dev/null || printf '')
  [ -n "$encoded" ] || return 1
  blog_to_base64url "$encoded"
}

blog_payments_token_sign() {
  payload_b64=${1-}
  [ -n "$payload_b64" ] || return 1
  secret=$(blog_payments_token_secret)
  printf '%s.%s' "$payload_b64" "$secret" | blog_sha256
}

blog_payments_issue_token() {
  token_type=${1-}
  payload_json=${2-}
  ttl_seconds=${3-3600}
  [ -n "$token_type" ] || return 1
  [ -n "$payload_json" ] || return 1
  case "$ttl_seconds" in
    ''|*[!0-9]*) ttl_seconds=3600 ;;
  esac
  now=$(blog_now_epoch)
  exp=$((now + ttl_seconds))
  payload=$(printf '%s\n' "$payload_json" | jq -c --arg typ "$token_type" --argjson exp "$exp" '. + {typ:$typ, exp:$exp}' 2>/dev/null || printf '')
  [ -n "$payload" ] || return 1
  payload_b64=$(blog_payments_base64url_encode_text "$payload" 2>/dev/null || printf '')
  [ -n "$payload_b64" ] || return 1
  sig=$(blog_payments_token_sign "$payload_b64" 2>/dev/null || printf '')
  [ -n "$sig" ] || return 1
  printf '%s.%s\n' "$payload_b64" "$sig"
}

blog_payments_issue_delivery_token() {
  order_id=${1-}
  [ -n "$order_id" ] || return 1
  payload=$(jq -cn --arg order_id "$order_id" '{order_id:$order_id}')
  # A buyer's delivery pass is intentionally durable; file download tokens are not.
  blog_payments_issue_token delivery "$payload" 315360000
}

blog_payments_issue_download_token() {
  order_id=${1-}
  product=${2-}
  [ -n "$order_id" ] || return 1
  [ -n "$product" ] || return 1
  payload=$(jq -cn --arg order_id "$order_id" --arg product "$product" '{order_id:$order_id, product:$product}')
  blog_payments_issue_token download "$payload" 900
}

blog_payments_verify_token() {
  token=${1-}
  expected_type=${2-}
  [ -n "$token" ] || return 1
  payload_b64=${token%%.*}
  sig=${token#*.}
  [ -n "$payload_b64" ] || return 1
  [ -n "$sig" ] || return 1
  if [ "$payload_b64" = "$sig" ]; then
    return 1
  fi
  expected_sig=$(blog_payments_token_sign "$payload_b64" 2>/dev/null || printf '')
  [ -n "$expected_sig" ] || return 1
  [ "$sig" = "$expected_sig" ] || return 1
  payload_raw_b64=$(blog_from_base64url "$payload_b64")
  payload=$(blog_b64_decode_text "$payload_raw_b64" 2>/dev/null || printf '')
  [ -n "$payload" ] || return 1
  payload=$(printf '%s\n' "$payload" | jq -c '.' 2>/dev/null || printf '')
  [ -n "$payload" ] || return 1
  now=$(blog_now_epoch)
  exp=$(printf '%s\n' "$payload" | jq -r '.exp // 0' 2>/dev/null || printf '0')
  case "$exp" in
    ''|*[!0-9]*) exp=0 ;;
  esac
  [ "$exp" -gt "$now" ] || return 1
  if [ -n "$expected_type" ]; then
    typ=$(printf '%s\n' "$payload" | jq -r '.typ // ""' 2>/dev/null || printf '')
    [ "$typ" = "$expected_type" ] || return 1
  fi
  printf '%s\n' "$payload"
}

blog_payments_new_order_id() {
  id=$(blog_random_token 12 | tr '[:upper:]' '[:lower:]' | tr -cd 'a-f0-9')
  [ -n "$id" ] || return 1
  printf '%s\n' "$id"
}

blog_payments_parse_amount() {
  raw=${1-}
  value=$(printf '%s\n' "$raw" | jq -nr --arg v "$raw" '($v | tostring | tonumber? // 0)' 2>/dev/null || printf '0')
  printf '%s\n' "$value"
}

blog_payments_format_money() {
  raw=${1-0}
  awk 'BEGIN { v = ARGV[1] + 0; printf "%.2f\n", v }' "$raw"
}

blog_payments_public_site_url() {
  host=$(blog_normalize_public_host "${HTTP_HOST:-${SERVER_NAME:-}}")
  if ! blog_valid_public_host "$host"; then
    host=$(blog_normalize_public_host "$(config-get "$blog_site_conf" domain 2>/dev/null || printf '')")
  fi
  if blog_valid_public_host "$host"; then
    printf 'https://%s\n' "$host"
    return 0
  fi
  printf '\n'
}

blog_btcpay_store_id() {
  printf '%s\n' "$(config-get "$blog_site_conf" btcpay_store_id 2>/dev/null || printf '')" | tr -d '\r\n[:space:]'
}

blog_btcpay_api_key() {
  printf '%s\n' "$(config-get "$blog_site_conf" btcpay_api_key 2>/dev/null || printf '')" | tr -d '\r\n[:space:]'
}

blog_btcpay_webhook_secret() {
  printf '%s\n' "$(config-get "$blog_site_conf" payments_webhook_secret 2>/dev/null || printf '')" | tr -d '\r\n[:space:]'
}

blog_btcpay_api_configured() {
  [ -n "$(blog_btcpay_url)" ] || return 1
  [ -n "$(blog_btcpay_store_id)" ] || return 1
  [ -n "$(blog_btcpay_api_key)" ] || return 1
}

blog_btcpay_authorize_url() {
  btcpay_url=$(blog_btcpay_url)
  callback=$(blog_payments_public_site_url)
  [ -n "$btcpay_url" ] || return 1
  [ -n "$callback" ] || callback='https://example.invalid'
  redirect_url="$callback/cgi/blog-manage-btcpay?action=authorize_callback"
  printf '%s/api-keys/authorize?applicationName=%s&applicationIdentifier=%s&permissions=%s&permissions=%s&permissions=%s&permissions=%s&permissions=%s&selectiveStores=true&strict=true&redirect=%s\n' \
    "$btcpay_url" \
    "$(blog_url_encode 'nostr-blog checkout')" \
    "$(blog_url_encode 'nostr-blog-checkout')" \
    "$(blog_url_encode 'btcpay.store.canviewstoresettings')" \
    "$(blog_url_encode 'btcpay.store.cancreateinvoice')" \
    "$(blog_url_encode 'btcpay.store.canviewinvoices')" \
    "$(blog_url_encode 'btcpay.store.canmodifyinvoices')" \
    "$(blog_url_encode 'btcpay.store.webhooks.canmodifywebhooks')" \
    "$(blog_url_encode "$redirect_url")"
}

blog_btcpay_webhook_url() {
  public_url=$(blog_payments_public_site_url)
  secret=$(blog_btcpay_webhook_secret)
  [ -n "$public_url" ] || return 1
  if [ -n "$secret" ]; then
    printf '%s/cgi/blog-payments?action=webhook&provider=btcpay&webhook_secret=%s\n' "$public_url" "$(blog_url_encode "$secret")"
    return 0
  fi
  printf '%s/cgi/blog-payments?action=webhook&provider=btcpay\n' "$public_url"
}

blog_btcpay_create_invoice_json() {
  order_id=${1-}
  amount=${2-}
  currency=${3-USD}
  title=${4-}
  [ -n "$order_id" ] || return 1
  blog_btcpay_api_configured || return 1
  command -v curl >/dev/null 2>&1 || return 1

  btcpay_url=$(blog_btcpay_url)
  store_id=$(blog_btcpay_store_id)
  api_key=$(blog_btcpay_api_key)
  site_url=$(blog_payments_public_site_url)
  checkout_url="/checkout?order_id=$order_id"
  redirect_url=$checkout_url
  if [ -n "$site_url" ]; then
    redirect_url="$site_url$checkout_url"
  fi
  payload=$(jq -cn \
    --arg amount "$(blog_payments_format_money "$amount")" \
    --arg currency "${currency:-USD}" \
    --arg order_id "$order_id" \
    --arg title "$title" \
    --arg redirect_url "$redirect_url" \
    '{
      amount: $amount,
      currency: $currency,
      metadata: {
        orderId: $order_id,
        itemDesc: $title
      },
      checkout: {
        redirectURL: $redirect_url,
        redirectAutomatically: false
      }
    }')
  [ -n "$payload" ] || return 1

  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-btcpay-invoice.XXXXXX")
  http_code=$(curl -sS --max-time 20 \
    -H "Authorization: token $api_key" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -o "$tmp" \
    -w '%{http_code}' \
    -X POST \
    --data "$payload" \
    "$btcpay_url/api/v1/stores/$store_id/invoices" 2>/dev/null || printf '000')
  body=$(cat "$tmp" 2>/dev/null || printf '')
  rm -f "$tmp"
  case "$http_code" in
    200|201)
      printf '%s\n' "$body" | jq -c '.' 2>/dev/null
      return $?
      ;;
  esac
  return 1
}

blog_btcpay_get_invoice_json() {
  invoice_id=${1-}
  [ -n "$invoice_id" ] || return 1
  blog_btcpay_api_configured || return 1
  command -v curl >/dev/null 2>&1 || return 1
  btcpay_url=$(blog_btcpay_url)
  store_id=$(blog_btcpay_store_id)
  api_key=$(blog_btcpay_api_key)
  curl -fsS --max-time 15 \
    -H "Authorization: token $api_key" \
    -H "Accept: application/json" \
    "$btcpay_url/api/v1/stores/$store_id/invoices/$invoice_id" 2>/dev/null | jq -c '.' 2>/dev/null
}

blog_payments_default_purchase_endpoint() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1
  printf '/purchase/%s\n' "$slug"
}

blog_payments_product_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1

  page_type=$(blog_nostr_page_type_for_slug "$slug" 2>/dev/null || printf '')
  case "$page_type" in
    nip23|blog) ;;
    *) return 1 ;;
  esac

  event_json=$(blog_nostr_nip23_latest_event_json "$slug" 2>/dev/null || printf '')
  if [ -n "$event_json" ]; then
    state_json=$(blog_nip23_state_from_event_json "$slug" "$event_json" "$page_type" 2>/dev/null || printf '')
  else
    state_json=$(blog_nip23_default_state_json "$slug" "$page_type" 2>/dev/null || printf '')
  fi
  [ -n "$state_json" ] || return 1

  draft_json=$(blog_nostr_page_load_draft_state_json "$slug" "$page_type" 2>/dev/null || printf '')
  if [ -n "$draft_json" ]; then
    local_json=$(printf '%s\n' "$draft_json" | jq -c '{
      product_enabled: (if (.product_enabled | type) == "boolean" then .product_enabled else null end),
      price: (.price // ""),
      currency: (.currency // ""),
      purchase_endpoint: (.purchase_endpoint // ""),
      product_type: (.product_type // "software"),
      crypto_discount_percent: (.crypto_discount_percent // 0),
      repo: (.repo // ""),
      tag: (.tag // "latest")
    }' 2>/dev/null || printf '{}')
    state_json=$(printf '%s\n' "$state_json" | jq -c --argjson local "$local_json" '. + {
      product_enabled: (if (($local.product_enabled | type) == "boolean") then ($local.product_enabled) else .product_enabled end),
      price: (if (($local.price // "") | tostring | length) > 0 then (($local.price // "") | tostring) else .price end),
      currency: (if (($local.currency // "") | tostring | length) > 0 then (($local.currency // "") | tostring) else .currency end),
      purchase_endpoint: (if (($local.purchase_endpoint // "") | tostring | length) > 0 then (($local.purchase_endpoint // "") | tostring) else .purchase_endpoint end),
      product_type: ($local.product_type // .product_type),
      crypto_discount_percent: ($local.crypto_discount_percent // .crypto_discount_percent),
      repo: ($local.repo // .repo),
      tag: ($local.tag // .tag)
    }' 2>/dev/null || printf '%s\n' "$state_json")
  fi

  blog_nip23_normalize_state_json "$slug" "$state_json" "$page_type"
}

blog_payments_public_product_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1
  state_json=$(blog_payments_product_state_json "$slug" 2>/dev/null || printf '')
  [ -n "$state_json" ] || return 1

  title=$(printf '%s\n' "$state_json" | jq -r '.title // ""' 2>/dev/null || printf '')
  product_enabled=$(printf '%s\n' "$state_json" | jq -r '.product_enabled // false' 2>/dev/null || printf 'false')
  price=$(printf '%s\n' "$state_json" | jq -r '.price // ""' 2>/dev/null || printf '')
  currency=$(printf '%s\n' "$state_json" | jq -r '.currency // "USD"' 2>/dev/null || printf 'USD')
  discount=$(printf '%s\n' "$state_json" | jq -r '.crypto_discount_percent // 0' 2>/dev/null || printf '0')
  purchase_endpoint=$(printf '%s\n' "$state_json" | jq -r '.purchase_endpoint // ""' 2>/dev/null || printf '')
  if [ -z "$purchase_endpoint" ]; then
    purchase_endpoint=$(blog_payments_default_purchase_endpoint "$slug" 2>/dev/null || printf '')
  fi

  price_num=$(blog_payments_parse_amount "$price")
  if [ "$product_enabled" != "true" ]; then
    return 1
  fi
  if [ "$(awk 'BEGIN { print ((ARGV[1] + 0) > 0) ? "1" : "0" }' "$price_num")" != '1' ]; then
    return 1
  fi
  discount_num=$(blog_payments_parse_amount "$discount")
  crypto_num=$(awk 'BEGIN { p = ARGV[1] + 0; d = ARGV[2] + 0; if (d < 0) d = 0; if (d > 95) d = 95; printf "%.6f\n", (p * (100 - d) / 100) }' "$price_num" "$discount_num")

  jq -cn \
    --arg slug "$slug" \
    --arg title "$title" \
    --argjson product_enabled true \
    --arg price "$(blog_payments_format_money "$price_num")" \
    --arg currency "$currency" \
    --arg crypto_discount_percent "$(blog_payments_format_money "$discount_num")" \
    --arg crypto_price "$(blog_payments_format_money "$crypto_num")" \
    --arg purchase_endpoint "$purchase_endpoint" \
    --arg product_type "$(printf '%s\n' "$state_json" | jq -r '.product_type // "software"' 2>/dev/null || printf 'software')" \
    '{
      slug: $slug,
      title: $title,
      product_enabled: $product_enabled,
      price: $price,
      currency: $currency,
      crypto_discount_percent: $crypto_discount_percent,
      crypto_price: $crypto_price,
      purchase_endpoint: $purchase_endpoint,
      product_type: $product_type
    }'
}

blog_payments_detect_os_arch() {
  ua=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]')
  os='linux'
  arch='x64'

  case "$ua" in
    *windows*|*win64*|*win32*) os='windows' ;;
    *mac*|*darwin*|*os\ x*) os='macos' ;;
    *iphone*|*ipad*|*ios*) os='ios' ;;
    *android*) os='android' ;;
    *linux*) os='linux' ;;
  esac

  case "$ua" in
    *aarch64*|*arm64*) arch='arm64' ;;
    *armv7*|*armv8*|*armhf*|*arm*) arch='arm' ;;
    *i686*|*i386*|*x86*) arch='x86' ;;
    *x86_64*|*amd64*|*x64*|*win64*) arch='x64' ;;
  esac

  printf '%s;%s\n' "$os" "$arch"
}

blog_payments_github_token() {
  token=$(config-get "$blog_site_conf" github_token 2>/dev/null || printf '')
  if [ -n "$token" ]; then
    printf '%s\n' "$token"
    return 0
  fi
  if [ -n "${GITHUB_TOKEN-}" ]; then
    printf '%s\n' "$GITHUB_TOKEN"
    return 0
  fi
  printf '\n'
}

blog_payments_release_assets_json() {
  repo=${1-}
  tag=${2-latest}
  [ -n "$repo" ] || return 1
  if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  case "$tag" in
    ''|latest)
      url="https://api.github.com/repos/$repo/releases/latest"
      ;;
    *)
      url="https://api.github.com/repos/$repo/releases/tags/$tag"
      ;;
  esac

  token=$(blog_payments_github_token)
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-github-release.XXXXXX")
  if [ -n "$token" ]; then
    if ! curl -fsSL -H "Accept: application/vnd.github+json" -H "Authorization: Bearer $token" "$url" > "$tmp" 2>/dev/null; then
      rm -f "$tmp"
      return 1
    fi
  else
    if ! curl -fsSL -H "Accept: application/vnd.github+json" "$url" > "$tmp" 2>/dev/null; then
      rm -f "$tmp"
      return 1
    fi
  fi

  out=$(jq -c '{
    tag_name: (.tag_name // ""),
    assets: [(.assets // [])[] | {
      id: (.id // 0),
      name: (.name // ""),
      url: (.url // ""),
      browser_download_url: (.browser_download_url // ""),
      size: (.size // 0),
      content_type: (.content_type // "application/octet-stream")
    }]
  }' "$tmp" 2>/dev/null || printf '')
  rm -f "$tmp"
  [ -n "$out" ] || return 1
  printf '%s\n' "$out"
}

blog_payments_pick_asset_json() {
  assets_json=${1-}
  os=${2-linux}
  arch=${3-x64}
  [ -n "$assets_json" ] || return 1
  printf '%s\n' "$assets_json" | jq -c --arg os "$os" --arg arch "$arch" '
    def lower: ascii_downcase;
    def os_score($name):
      ($name | lower) as $n
      | if $os == "macos" then
          (if ($n | test("macos|darwin|osx|mac")) then 10 else 0 end)
        elif $os == "windows" then
          (if ($n | test("windows|win")) then 10 else 0 end)
        elif $os == "linux" then
          (if ($n | test("linux")) then 10 else 0 end)
        elif $os == "android" then
          (if ($n | test("android")) then 10 else 0 end)
        elif $os == "ios" then
          (if ($n | test("ios|iphone|ipad")) then 10 else 0 end)
        else 0 end;
    def arch_score($name):
      ($name | lower) as $n
      | if $arch == "arm64" then
          (if ($n | test("arm64|aarch64")) then 6 else 0 end)
        elif $arch == "x64" then
          (if ($n | test("x86_64|amd64|x64")) then 6 else 0 end)
        elif $arch == "x86" then
          (if ($n | test("x86|i386|i686")) then 6 else 0 end)
        elif $arch == "arm" then
          (if ($n | test("armv7|armv8|arm")) then 6 else 0 end)
        else 0 end;

    (.assets // []) as $assets
    | if ($assets | length) == 0 then empty
      else
        ($assets
          | map(. + { _score: (os_score(.name) + arch_score(.name) + (if ((.name // "") | length) > 0 then 1 else 0 end)) })
          | sort_by(._score, .name)
          | reverse
          | .[0])
      end
  ' 2>/dev/null
}
