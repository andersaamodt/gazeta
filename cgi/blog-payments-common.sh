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
    host=$(blog_normalize_public_host "$(blog_config_get "$blog_site_conf" domain 2>/dev/null || printf '')")
  fi
  if blog_valid_public_host "$host"; then
    printf 'https://%s\n' "$host"
    return 0
  fi
  printf '\n'
}

blog_btcpay_store_id() {
  printf '%s\n' "$(blog_config_get "$blog_site_conf" btcpay_store_id 2>/dev/null || printf '')" | tr -d '\r\n[:space:]'
}

blog_btcpay_config_value() {
  blog_btcpay_config_key=${1-}
  [ -n "$blog_btcpay_config_key" ] || return 1
  printf '%s\n' "$(blog_config_get "$blog_site_conf" "$blog_btcpay_config_key" 2>/dev/null || printf '')" | tr -d '\r'
}

blog_payments_default_secret_file() {
  blog_payments_default_secret_key=${1-}
  [ -n "$blog_payments_default_secret_key" ] || return 1
  blog_payments_default_secret_name=$(printf '%s' "$blog_payments_default_secret_key" | tr '_' '-')
  printf '%s/secrets/%s\n' "$blog_site_data" "$blog_payments_default_secret_name"
}

blog_btcpay_default_secret_file() {
  blog_payments_default_secret_file "${1-}"
}

blog_btcpay_config_secret_value() {
  blog_btcpay_config_secret_key=${1-}
  [ -n "$blog_btcpay_config_secret_key" ] || return 1
  blog_btcpay_config_secret_file=$(blog_btcpay_config_value "${blog_btcpay_config_secret_key}_file" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  if [ -n "$blog_btcpay_config_secret_file" ] && [ -f "$blog_btcpay_config_secret_file" ]; then
    sed -n '1p' "$blog_btcpay_config_secret_file" 2>/dev/null | tr -d '\r\n[:space:]'
    return 0
  fi
  blog_btcpay_default_file=$(blog_payments_default_secret_file "$blog_btcpay_config_secret_key")
  if [ "$blog_btcpay_default_file" != "$blog_btcpay_config_secret_file" ] && [ -f "$blog_btcpay_default_file" ]; then
    sed -n '1p' "$blog_btcpay_default_file" 2>/dev/null | tr -d '\r\n[:space:]'
    return 0
  fi
  blog_btcpay_config_value "$blog_btcpay_config_secret_key" | tr -d '\n[:space:]'
}

blog_btcpay_api_key() {
  blog_btcpay_config_secret_value btcpay_api_key
}

blog_btcpay_webhook_secret() {
  blog_btcpay_config_secret_value payments_webhook_secret
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
    "$(blog_url_encode 'gazeta checkout')" \
    "$(blog_url_encode 'gazeta-checkout')" \
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

blog_payments_config_value() {
  key=${1-}
  [ -n "$key" ] || return 1
  printf '%s\n' "$(blog_config_get "$blog_site_conf" "$key" 2>/dev/null || printf '')" | tr -d '\r'
}

blog_payments_config_secret_value() {
  blog_payments_config_secret_key=${1-}
  [ -n "$blog_payments_config_secret_key" ] || return 1
  blog_payments_config_secret_file=$(blog_payments_config_value "${blog_payments_config_secret_key}_file" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  if [ -n "$blog_payments_config_secret_file" ] && [ -f "$blog_payments_config_secret_file" ]; then
    sed -n '1p' "$blog_payments_config_secret_file" 2>/dev/null | tr -d '\r\n[:space:]'
    return 0
  fi
  blog_payments_default_file=$(blog_payments_default_secret_file "$blog_payments_config_secret_key")
  if [ "$blog_payments_default_file" != "$blog_payments_config_secret_file" ] && [ -f "$blog_payments_default_file" ]; then
    sed -n '1p' "$blog_payments_default_file" 2>/dev/null | tr -d '\r\n[:space:]'
    return 0
  fi
  blog_payments_config_value "$blog_payments_config_secret_key" | tr -d '\n[:space:]'
}

blog_crossmint_api_base() {
  url=$(blog_payments_config_value crossmint_api_base | tr -d '\n[:space:]')
  [ -n "$url" ] || url='https://www.crossmint.com/api'
  printf '%s\n' "${url%/}"
}

blog_crossmint_api_key() {
  blog_payments_config_secret_value crossmint_api_key
}

blog_crossmint_client_api_key() {
  blog_payments_config_value crossmint_client_api_key | tr -d '\n[:space:]'
}

blog_crossmint_token_locator() {
  locator=$(blog_payments_config_value crossmint_token_locator | tr -d '\n[:space:]')
  [ -n "$locator" ] || locator='solana:usdc'
  printf '%s\n' "$locator"
}

blog_crossmint_recipient_wallet_chain() {
  chain=$(blog_payments_config_value crossmint_recipient_wallet_chain | tr -d '\n[:space:]')
  if [ -z "$chain" ]; then
    chain=$(blog_crossmint_token_locator | sed 's/:.*$//')
  fi
  [ -n "$chain" ] || chain='solana'
  printf '%s\n' "$chain"
}

blog_crossmint_recipient_wallet_address() {
  blog_payments_config_value crossmint_recipient_wallet_address | tr -d '\n[:space:]'
}

blog_crossmint_recipient_user_email() {
  blog_payments_config_value crossmint_recipient_user_email | tr -d '\n[:space:]'
}

blog_crossmint_payment_method() {
  method=$(blog_payments_config_value crossmint_payment_method | tr -d '\n[:space:]')
  [ -n "$method" ] || method='card'
  printf '%s\n' "$method"
}

blog_crossmint_configured() {
  blog_plugin_enabled crossmint || return 1
  [ -n "$(blog_crossmint_api_key)" ] || return 1
  [ -n "$(blog_crossmint_client_api_key)" ] || return 1
  [ -n "$(blog_crossmint_recipient_wallet_address)" ] || return 1
  [ -n "$(blog_crossmint_token_locator)" ] || return 1
}

blog_money_to_minor_units() {
  amount=${1-0}
  awk 'BEGIN { v = ARGV[1] + 0; if (v < 0) v = 0; printf "%.0f\n", v * 100 }' "$amount"
}

blog_crossmint_webhook_url() {
  order_id=${1-}
  public_url=$(blog_payments_public_site_url)
  secret=$(blog_btcpay_webhook_secret)
  [ -n "$public_url" ] || return 1
  [ -n "$order_id" ] || return 1
  if [ -n "$secret" ]; then
    printf '%s/cgi/blog-payments?action=webhook&provider=crossmint&order_id=%s&webhook_secret=%s\n' "$public_url" "$(blog_url_encode "$order_id")" "$(blog_url_encode "$secret")"
    return 0
  fi
  printf '%s/cgi/blog-payments?action=webhook&provider=crossmint&order_id=%s\n' "$public_url" "$(blog_url_encode "$order_id")"
}

blog_crossmint_link_recipient_wallet_json() {
  buyer_email=${1-}
  recipient_email=$(blog_crossmint_recipient_user_email)
  [ -n "$recipient_email" ] || recipient_email=$buyer_email
  [ -n "$recipient_email" ] || return 0
  blog_crossmint_configured || return 1
  command -v curl >/dev/null 2>&1 || return 1
  base=$(blog_crossmint_api_base)
  api_key=$(blog_crossmint_api_key)
  recipient_wallet=$(blog_crossmint_recipient_wallet_address)
  recipient_chain=$(blog_crossmint_recipient_wallet_chain)
  [ -n "$recipient_wallet" ] || return 1
  [ -n "$recipient_chain" ] || return 1
  user_locator=$(blog_url_encode "email:$recipient_email")
  wallet_locator=$(blog_url_encode "$recipient_wallet")
  payload=$(jq -cn --arg chain "$recipient_chain" '{chain:$chain}')
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-crossmint-wallet.XXXXXX")
  http_code=$(curl -sS --max-time 25 \
    -H "X-API-KEY: $api_key" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -o "$tmp" \
    -w '%{http_code}' \
    -X PUT \
    --data "$payload" \
    "$base/2025-06-09/users/$user_locator/linked-wallets/$wallet_locator" 2>/dev/null || printf '000')
  body=$(cat "$tmp" 2>/dev/null || printf '')
  rm -f "$tmp"
  case "$http_code" in
    200|201|204)
      if [ -n "$body" ]; then
        printf '%s\n' "$body" | jq -c '.' 2>/dev/null || printf '{}\n'
      else
        printf '{}\n'
      fi
      return 0
      ;;
  esac
  return 1
}

blog_crossmint_create_order_json() {
  order_id=${1-}
  quote_json=${2-}
  buyer_email=${3-}
  [ -n "$order_id" ] || return 1
  [ -n "$quote_json" ] || return 1
  blog_crossmint_configured || return 1
  command -v curl >/dev/null 2>&1 || return 1
  base=$(blog_crossmint_api_base)
  api_key=$(blog_crossmint_api_key)
  token_locator=$(blog_crossmint_token_locator)
  recipient_wallet=$(blog_crossmint_recipient_wallet_address)
  payment_method=$(blog_crossmint_payment_method)
  total=$(printf '%s\n' "$quote_json" | jq -r '.total // .subtotal // "0.00"' 2>/dev/null || printf '0.00')
  [ -n "$buyer_email" ] || buyer_email=$(printf '%s\n' "$quote_json" | jq -r '.recipient.email // ""' 2>/dev/null || printf '')
  blog_crossmint_link_recipient_wallet_json "$buyer_email" >/dev/null || return 1
  payload=$(jq -cn \
    --arg token_locator "$token_locator" \
    --arg amount "$(blog_payments_format_money "$total")" \
    --arg payment_method "$payment_method" \
    --arg receipt_email "$buyer_email" \
    --arg wallet_address "$recipient_wallet" \
    '{
      lineItems: [
        {
          tokenLocator: $token_locator,
          executionParameters: {
            mode: "exact-in",
            amount: $amount
          }
        }
      ],
      payment: {
        method: $payment_method,
        receiptEmail: $receipt_email
      },
      recipient: {
        walletAddress: $wallet_address
      }
    }')
  [ -n "$payload" ] || return 1

  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-crossmint-order.XXXXXX")
  http_code=$(curl -sS --max-time 25 \
    -H "X-API-KEY: $api_key" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -o "$tmp" \
    -w '%{http_code}' \
    -X POST \
    --data "$payload" \
    "$base/2022-06-09/orders" 2>/dev/null || printf '000')
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

blog_crossmint_get_order_json() {
  provider_order_id=${1-}
  client_secret=${2-}
  [ -n "$provider_order_id" ] || return 1
  blog_crossmint_configured || return 1
  command -v curl >/dev/null 2>&1 || return 1
  base=$(blog_crossmint_api_base)
  api_key=$(blog_crossmint_api_key)
  if [ -n "$client_secret" ]; then
    curl -fsS --max-time 15 \
      -H "Authorization: $client_secret" \
      -H "Accept: application/json" \
      "$base/2022-06-09/orders/$provider_order_id" 2>/dev/null | jq -c '.' 2>/dev/null
    return $?
  fi
  curl -fsS --max-time 15 \
    -H "X-API-KEY: $api_key" \
    -H "Accept: application/json" \
    "$base/2022-06-09/orders/$provider_order_id" 2>/dev/null | jq -c '.' 2>/dev/null
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
      tag: (.tag // "latest"),
      image_url: (.image_url // ""),
      fulfillment_provider: (.fulfillment_provider // ""),
      printful_product_id: (.printful_product_id // ""),
      printful_product_template_id: (.printful_product_template_id // ""),
      printful_sync_variant_id: (.printful_sync_variant_id // ""),
      printful_external_variant_id: (.printful_external_variant_id // ""),
      variants: (if ((.variants // null) | type) == "array" then .variants else [] end)
    }' 2>/dev/null || printf '{}')
    state_json=$(printf '%s\n' "$state_json" | jq -c --argjson local "$local_json" '. + {
      product_enabled: (if (($local.product_enabled | type) == "boolean") then ($local.product_enabled) else .product_enabled end),
      price: (if (($local.price // "") | tostring | length) > 0 then (($local.price // "") | tostring) else .price end),
      currency: (if (($local.currency // "") | tostring | length) > 0 then (($local.currency // "") | tostring) else .currency end),
      purchase_endpoint: (if (($local.purchase_endpoint // "") | tostring | length) > 0 then (($local.purchase_endpoint // "") | tostring) else .purchase_endpoint end),
      product_type: ($local.product_type // .product_type),
      crypto_discount_percent: ($local.crypto_discount_percent // .crypto_discount_percent),
      repo: ($local.repo // .repo),
      tag: ($local.tag // .tag),
      image_url: ($local.image_url // .image_url // ""),
      fulfillment_provider: ($local.fulfillment_provider // .fulfillment_provider // ""),
      printful_product_id: ($local.printful_product_id // .printful_product_id // ""),
      printful_product_template_id: ($local.printful_product_template_id // .printful_product_template_id // ""),
      printful_sync_variant_id: ($local.printful_sync_variant_id // .printful_sync_variant_id // ""),
      printful_external_variant_id: ($local.printful_external_variant_id // .printful_external_variant_id // ""),
      variants: ($local.variants // .variants // [])
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
  product_type=$(printf '%s\n' "$state_json" | jq -r '.product_type // "software"' 2>/dev/null || printf 'software')
  image_url=$(printf '%s\n' "$state_json" | jq -r '.image_url // ""' 2>/dev/null || printf '')
  fulfillment_provider=$(printf '%s\n' "$state_json" | jq -r '.fulfillment_provider // ""' 2>/dev/null || printf '')
  printful_product_id=$(printf '%s\n' "$state_json" | jq -r '.printful_product_id // ""' 2>/dev/null || printf '')
  printful_product_template_id=$(printf '%s\n' "$state_json" | jq -r '.printful_product_template_id // ""' 2>/dev/null || printf '')
  printful_sync_variant_id=$(printf '%s\n' "$state_json" | jq -r '.printful_sync_variant_id // ""' 2>/dev/null || printf '')
  printful_external_variant_id=$(printf '%s\n' "$state_json" | jq -r '.printful_external_variant_id // ""' 2>/dev/null || printf '')
  if [ -z "$purchase_endpoint" ]; then
    purchase_endpoint=$(blog_payments_default_purchase_endpoint "$slug" 2>/dev/null || printf '')
  fi
  if [ "$product_type" = "merch" ] && [ "$purchase_endpoint" = "$(blog_payments_default_purchase_endpoint "$slug" 2>/dev/null || printf '')" ]; then
    purchase_endpoint="/checkout?product=$slug"
  fi

  price_num=$(blog_payments_parse_amount "$price")
  variants_json=$(printf '%s\n' "$state_json" | jq -c \
    --arg default_price "$(blog_payments_format_money "$price_num")" \
    --arg default_currency "$currency" \
    --arg default_image_url "$image_url" \
    --arg default_fulfillment_provider "$fulfillment_provider" \
    --arg root_printful_product_template_id "$printful_product_template_id" \
    --arg root_printful_sync_variant_id "$printful_sync_variant_id" \
    --arg root_printful_external_variant_id "$printful_external_variant_id" \
    'def clean_price($v; $fallback):
       (($v // $fallback // "") | tostring | gsub("[[:space:]]"; "")) as $raw
       | if ($raw | test("^[0-9]+([.][0-9]{1,2})?$")) then $raw else "" end;
     def clean_currency($v):
       (($v // $default_currency // "USD") | tostring | ascii_upcase | gsub("[^A-Z]"; "")) as $c
       | if ($c | length) == 3 then $c else "USD" end;
     def clean_provider($v):
       (($v // $default_fulfillment_provider // "") | tostring | ascii_downcase) as $p
       | if $p == "printful" then "printful" else "" end;
     def clean_variant:
       {
         id: ((.id // .variant_id // .sync_variant_id // .external_variant_id // "") | tostring),
         name: ((.name // .title // .variant_name // "") | tostring),
         price: clean_price(.price // .retail_price // ""; $default_price),
         currency: clean_currency(.currency // $default_currency),
         image_url: ((.image_url // .thumbnail_url // $default_image_url // "") | tostring),
         fulfillment_provider: clean_provider(.fulfillment_provider // $default_fulfillment_provider),
         printful_sync_variant_id: ((.printful_sync_variant_id // .sync_variant_id // "") | tostring),
         printful_external_variant_id: ((.printful_external_variant_id // .external_variant_id // "") | tostring),
         printful_variant_id: ((.printful_variant_id // .variant_id // "") | tostring),
         printful_product_template_id: ((.printful_product_template_id // .product_template_id // $root_printful_product_template_id // "") | tostring)
       }
       | .id = (if ((.id // "") | length) > 0 then .id elif ((.printful_sync_variant_id // "") | length) > 0 then .printful_sync_variant_id elif ((.printful_external_variant_id // "") | length) > 0 then .printful_external_variant_id else "" end)
       | select((.id | length) > 0);
     ([.variants[]? | clean_variant]) as $variants
     | if (($variants | length) > 0) then $variants
       elif (($root_printful_sync_variant_id | length) > 0 or ($root_printful_external_variant_id | length) > 0) then
         [{
           id: (if ($root_printful_sync_variant_id | length) > 0 then $root_printful_sync_variant_id else $root_printful_external_variant_id end),
           name: "",
           price: $default_price,
           currency: $default_currency,
           image_url: $default_image_url,
           fulfillment_provider: $default_fulfillment_provider,
           printful_sync_variant_id: $root_printful_sync_variant_id,
           printful_external_variant_id: $root_printful_external_variant_id,
           printful_variant_id: "",
           printful_product_template_id: $root_printful_product_template_id
         }]
       else [] end' 2>/dev/null || printf '[]')
  first_variant_price=$(printf '%s\n' "$variants_json" | jq -r '.[0].price // ""' 2>/dev/null || printf '')
  first_variant_price_num=$(blog_payments_parse_amount "$first_variant_price")
  if [ "$(awk 'BEGIN { print ((ARGV[1] + 0) > 0) ? "1" : "0" }' "$price_num")" != '1' ] && [ "$(awk 'BEGIN { print ((ARGV[1] + 0) > 0) ? "1" : "0" }' "$first_variant_price_num")" = '1' ]; then
    price_num=$first_variant_price_num
  fi
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
    --arg product_type "$product_type" \
    --arg image_url "$image_url" \
    --arg fulfillment_provider "$fulfillment_provider" \
    --arg printful_product_id "$printful_product_id" \
    --arg printful_product_template_id "$printful_product_template_id" \
    --arg printful_sync_variant_id "$printful_sync_variant_id" \
    --arg printful_external_variant_id "$printful_external_variant_id" \
    --argjson variants "$variants_json" \
    '{
      slug: $slug,
      title: $title,
      product_enabled: $product_enabled,
      price: $price,
      currency: $currency,
      crypto_discount_percent: $crypto_discount_percent,
      crypto_price: $crypto_price,
      purchase_endpoint: $purchase_endpoint,
      product_type: $product_type,
      physical: ($product_type == "merch"),
      image_url: $image_url,
      fulfillment_provider: $fulfillment_provider,
      printful_product_id: $printful_product_id,
      printful_product_template_id: $printful_product_template_id,
      printful_sync_variant_id: $printful_sync_variant_id,
      printful_external_variant_id: $printful_external_variant_id,
      variants: $variants
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
  token=$(blog_config_get "$blog_site_conf" github_token 2>/dev/null || printf '')
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

btcpay_host_for_request() {
  blog_resolve_btcpay_host
}

btcpay_url_for_request() {
  blog_btcpay_url
}

blog_payments_emit_runtime_status_json() {
  btcpay_host=$(btcpay_host_for_request)
  btcpay_url=$(btcpay_url_for_request)
  btcpay_store_id=$(blog_btcpay_store_id)
  btcpay_api_key=$(blog_btcpay_api_key)
  btcpay_webhook_secret=$(blog_btcpay_webhook_secret)
  btcpay_api_configured=false
  btcpay_webhook_configured=false
  [ -n "$btcpay_api_key" ] && [ -n "$btcpay_store_id" ] && btcpay_api_configured=true
  [ -n "$btcpay_webhook_secret" ] && btcpay_webhook_configured=true
  btcpay_authorize_url=$(blog_btcpay_authorize_url 2>/dev/null || printf '')
  btcpay_webhook_url=$(blog_btcpay_webhook_url 2>/dev/null || printf '')
  crossmint_client_api_key=$(blog_crossmint_client_api_key)
  crossmint_token_locator=$(blog_crossmint_token_locator)
  crossmint_recipient_wallet_address=$(blog_crossmint_recipient_wallet_address)
  crossmint_webhook_url=$(blog_crossmint_webhook_url "ORDER_ID" 2>/dev/null || printf '')
  crossmint_plugin_enabled=false
  commerce_enabled=false
  crossmint_configured=false
  blog_plugin_enabled commerce && commerce_enabled=true
  blog_plugin_enabled crossmint && crossmint_plugin_enabled=true
  blog_crossmint_configured && crossmint_configured=true
  merch_store_enabled=false
  printful_configured=false
  printful_confirm_orders=$(blog_printful_confirm_orders)
  blog_plugin_enabled merch_store && merch_store_enabled=true
  blog_printful_configured && printful_configured=true
  paybis_partner_id=$(blog_config_get "$blog_site_conf" paybis_partner_id 2>/dev/null || printf '')
  jq -cn \
    --arg btcpay_host "$btcpay_host" \
    --arg btcpay_url "$btcpay_url" \
    --arg btcpay_store_id "$btcpay_store_id" \
    --argjson btcpay_api_configured "$btcpay_api_configured" \
    --argjson btcpay_webhook_configured "$btcpay_webhook_configured" \
    --arg btcpay_authorize_url "$btcpay_authorize_url" \
    --arg btcpay_webhook_url "$btcpay_webhook_url" \
    --arg crossmint_client_api_key "$crossmint_client_api_key" \
    --arg crossmint_token_locator "$crossmint_token_locator" \
    --arg crossmint_recipient_wallet_address "$crossmint_recipient_wallet_address" \
    --arg crossmint_webhook_url "$crossmint_webhook_url" \
    --argjson crossmint_plugin_enabled "$crossmint_plugin_enabled" \
    --argjson commerce_enabled "$commerce_enabled" \
    --argjson crossmint_configured "$crossmint_configured" \
    --argjson merch_store_enabled "$merch_store_enabled" \
    --argjson printful_configured "$printful_configured" \
    --argjson printful_confirm_orders "$printful_confirm_orders" \
    --arg paybis_partner_id "$paybis_partner_id" \
    '{
      success: true,
      btcpay_host: $btcpay_host,
      btcpay_url: $btcpay_url,
      btcpay_store_id: $btcpay_store_id,
      btcpay_api_configured: $btcpay_api_configured,
      btcpay_webhook_configured: $btcpay_webhook_configured,
      btcpay_authorize_url: $btcpay_authorize_url,
      btcpay_webhook_url: $btcpay_webhook_url,
      crossmint_client_api_key: $crossmint_client_api_key,
      crossmint_token_locator: $crossmint_token_locator,
      crossmint_recipient_wallet_configured: (($crossmint_recipient_wallet_address | length) > 0),
      crossmint_webhook_url: $crossmint_webhook_url,
      crossmint_plugin_enabled: $crossmint_plugin_enabled,
      commerce_enabled: $commerce_enabled,
      merch_store_enabled: $merch_store_enabled,
      printful_configured: $printful_configured,
      printful_confirm_orders: $printful_confirm_orders,
      paybis_partner_id: $paybis_partner_id,
      paybis_partner: $paybis_partner_id,
      crossmint_configured: $crossmint_configured,
      paybis_configured: (($paybis_partner_id | length) > 0)
    }'
  printf '\n'
}

blog_payments_quote_items_json() {
  items_json=${1-}
  recipient_json_raw=${2-}
  shipping_id=${3-}
  if [ -z "$items_json" ] || ! printf '%s\n' "$items_json" | jq -e 'type=="array"' >/dev/null 2>&1; then
    return 1
  fi

  normalized=$(printf '%s\n' "$items_json" | jq -c '[.[]? | {
      slug: ((.slug // .product_slug // .product // "") | tostring),
      variant_id: ((.variant_id // .variant // .id // "") | tostring),
      qty: ((.qty // 1) | tonumber? // 1)
    }
    | .slug = (.slug | ascii_downcase)
    | .qty = (if .qty < 1 then 1 elif .qty > 50 then 50 else (.qty | floor) end)
    | select((.slug | length) > 0)
  ]' 2>/dev/null || printf '[]')

  entries_file=$(mktemp "${TMPDIR:-/tmp}/blog-payment-items.XXXXXX")
  quoted_file=$(mktemp "${TMPDIR:-/tmp}/blog-payment-quoted.XXXXXX")
  : > "$entries_file"
  : > "$quoted_file"

  printf '%s\n' "$normalized" | jq -c '.[]' > "$entries_file"
  while IFS= read -r row || [ -n "$row" ]; do
    [ -n "$row" ] || continue
    slug_raw=$(printf '%s\n' "$row" | jq -r '.slug // ""' 2>/dev/null || printf '')
    slug=$(blog_nostr_page_slug "$slug_raw")
    [ -n "$slug" ] || continue
    variant_id=$(printf '%s\n' "$row" | jq -r '.variant_id // ""' 2>/dev/null || printf '')
    qty=$(printf '%s\n' "$row" | jq -r '.qty // 1' 2>/dev/null || printf '1')
    case "$qty" in
      ''|*[!0-9]*) qty=1 ;;
    esac
    [ "$qty" -ge 1 ] || qty=1

    product=$(blog_payments_public_product_json "$slug" 2>/dev/null || printf '')
    [ -n "$product" ] || continue

    variant=$(printf '%s\n' "$product" | jq -c --arg variant_id "$variant_id" '
      (.variants // []) as $variants
      | if (($variants | length) == 0) then {}
        elif (($variant_id | length) > 0) then
          (([$variants[]? | select(
            ((.id // "") | tostring) == $variant_id or
            ((.printful_sync_variant_id // "") | tostring) == $variant_id or
            ((.printful_external_variant_id // "") | tostring) == $variant_id or
            ((.printful_variant_id // "") | tostring) == $variant_id
          )] | .[0]) // ($variants[0]) // {})
        else ($variants[0] // {}) end
    ' 2>/dev/null || printf '{}')

    title=$(printf '%s\n' "$product" | jq -r '.title // ""' 2>/dev/null || printf '')
    product_type=$(printf '%s\n' "$product" | jq -r '.product_type // "software"' 2>/dev/null || printf 'software')
    unit_price=$(printf '%s\n' "$variant" | jq -r '.price // empty' 2>/dev/null || printf '')
    [ -n "$unit_price" ] || unit_price=$(printf '%s\n' "$product" | jq -r '.price // "0.00"' 2>/dev/null || printf '0.00')
    unit_crypto_price=$(printf '%s\n' "$product" | jq -r '.crypto_price // .price // "0.00"' 2>/dev/null || printf '0.00')
    if [ "$unit_price" != "$(printf '%s\n' "$product" | jq -r '.price // "0.00"' 2>/dev/null || printf '0.00')" ]; then
      discount=$(printf '%s\n' "$product" | jq -r '.crypto_discount_percent // 0' 2>/dev/null || printf '0')
      discount_num=$(blog_payments_parse_amount "$discount")
      unit_crypto_price=$(awk 'BEGIN { p = ARGV[1] + 0; d = ARGV[2] + 0; if (d < 0) d = 0; if (d > 95) d = 95; printf "%.6f\n", (p * (100 - d) / 100) }' "$unit_price" "$discount_num")
    fi
    currency=$(printf '%s\n' "$variant" | jq -r '.currency // empty' 2>/dev/null || printf '')
    [ -n "$currency" ] || currency=$(printf '%s\n' "$product" | jq -r '.currency // "USD"' 2>/dev/null || printf 'USD')
    purchase_endpoint=$(printf '%s\n' "$product" | jq -r '.purchase_endpoint // ""' 2>/dev/null || printf '')
    image_url=$(printf '%s\n' "$variant" | jq -r '.image_url // empty' 2>/dev/null || printf '')
    [ -n "$image_url" ] || image_url=$(printf '%s\n' "$product" | jq -r '.image_url // ""' 2>/dev/null || printf '')
    variant_name=$(printf '%s\n' "$variant" | jq -r '.name // ""' 2>/dev/null || printf '')
    variant_selected_id=$(printf '%s\n' "$variant" | jq -r '.id // ""' 2>/dev/null || printf '')
    printful_sync_variant_id=$(printf '%s\n' "$variant" | jq -r '.printful_sync_variant_id // empty' 2>/dev/null || printf '')
    [ -n "$printful_sync_variant_id" ] || printful_sync_variant_id=$(printf '%s\n' "$product" | jq -r '.printful_sync_variant_id // ""' 2>/dev/null || printf '')
    printful_external_variant_id=$(printf '%s\n' "$variant" | jq -r '.printful_external_variant_id // empty' 2>/dev/null || printf '')
    [ -n "$printful_external_variant_id" ] || printful_external_variant_id=$(printf '%s\n' "$product" | jq -r '.printful_external_variant_id // ""' 2>/dev/null || printf '')
    printful_variant_id=$(printf '%s\n' "$variant" | jq -r '.printful_variant_id // ""' 2>/dev/null || printf '')
    printful_product_template_id=$(printf '%s\n' "$variant" | jq -r '.printful_product_template_id // empty' 2>/dev/null || printf '')
    [ -n "$printful_product_template_id" ] || printful_product_template_id=$(printf '%s\n' "$product" | jq -r '.printful_product_template_id // ""' 2>/dev/null || printf '')
    fulfillment_provider=$(printf '%s\n' "$variant" | jq -r '.fulfillment_provider // empty' 2>/dev/null || printf '')
    [ -n "$fulfillment_provider" ] || fulfillment_provider=$(printf '%s\n' "$product" | jq -r '.fulfillment_provider // ""' 2>/dev/null || printf '')
    if [ "$product_type" = "merch" ] && [ -z "$fulfillment_provider" ]; then
      if [ -n "$printful_sync_variant_id" ] || [ -n "$printful_external_variant_id" ] || { [ -n "$printful_product_template_id" ] && [ -n "$printful_variant_id" ]; }; then
        fulfillment_provider='printful'
      fi
    fi
    if [ "$fulfillment_provider" = "printful" ] && [ -z "$printful_sync_variant_id" ] && [ -z "$printful_external_variant_id" ] && { [ -z "$printful_product_template_id" ] || [ -z "$printful_variant_id" ]; }; then
      continue
    fi

    physical=false
    [ "$product_type" = "merch" ] && physical=true
    line_id="$slug"
    if [ -n "$variant_selected_id" ]; then
      safe_variant=$(printf '%s' "$variant_selected_id" | tr -cd 'A-Za-z0-9_-')
      [ -n "$safe_variant" ] && line_id="$slug-$safe_variant"
    fi
    item_key="$slug"
    [ -n "$variant_selected_id" ] && item_key="$slug:$variant_selected_id"

    subtotal_num=$(awk 'BEGIN { printf "%.6f\n", (ARGV[1] + 0) * (ARGV[2] + 0) }' "$unit_price" "$qty")
    crypto_subtotal_num=$(awk 'BEGIN { printf "%.6f\n", (ARGV[1] + 0) * (ARGV[2] + 0) }' "$unit_crypto_price" "$qty")

    line=$(jq -cn \
      --arg slug "$slug" \
      --arg item_key "$item_key" \
      --arg line_id "$line_id" \
      --arg title "$title" \
      --arg variant_id "$variant_selected_id" \
      --arg variant_name "$variant_name" \
      --arg product_type "$product_type" \
      --arg image_url "$image_url" \
      --arg fulfillment_provider "$fulfillment_provider" \
      --arg printful_sync_variant_id "$printful_sync_variant_id" \
      --arg printful_external_variant_id "$printful_external_variant_id" \
      --arg printful_variant_id "$printful_variant_id" \
      --arg printful_product_template_id "$printful_product_template_id" \
      --argjson physical "$physical" \
      --argjson qty "$qty" \
      --arg unit_price "$(blog_payments_format_money "$unit_price")" \
      --arg unit_crypto_price "$(blog_payments_format_money "$unit_crypto_price")" \
      --arg currency "$currency" \
      --arg purchase_endpoint "$purchase_endpoint" \
      --arg subtotal "$(blog_payments_format_money "$subtotal_num")" \
      --arg crypto_subtotal "$(blog_payments_format_money "$crypto_subtotal_num")" \
      --argjson subtotal_num "$(blog_payments_parse_amount "$subtotal_num")" \
      --argjson crypto_subtotal_num "$(blog_payments_parse_amount "$crypto_subtotal_num")" \
      '{
        slug: $slug,
        item_key: $item_key,
        line_id: $line_id,
        title: $title,
        variant_id: $variant_id,
        variant_name: $variant_name,
        product_type: $product_type,
        physical: $physical,
        image_url: $image_url,
        fulfillment_provider: $fulfillment_provider,
        printful_sync_variant_id: $printful_sync_variant_id,
        printful_external_variant_id: $printful_external_variant_id,
        printful_variant_id: $printful_variant_id,
        printful_product_template_id: $printful_product_template_id,
        qty: $qty,
        unit_price: $unit_price,
        unit_crypto_price: $unit_crypto_price,
        currency: $currency,
        purchase_endpoint: $purchase_endpoint,
        subtotal: $subtotal,
        crypto_subtotal: $crypto_subtotal,
        subtotal_num: $subtotal_num,
        crypto_subtotal_num: $crypto_subtotal_num
      }')
    printf '%s\n' "$line" >> "$quoted_file"
  done < "$entries_file"

  rm -f "$entries_file"

  quoted_items=$(jq -sc '.' "$quoted_file" 2>/dev/null || printf '[]')
  rm -f "$quoted_file"

  item_count=$(printf '%s\n' "$quoted_items" | jq -r 'length' 2>/dev/null || printf '0')
  case "$item_count" in
    ''|*[!0-9]*) item_count=0 ;;
  esac
  [ "$item_count" -gt 0 ] || return 1

  totals=$(printf '%s\n' "$quoted_items" | jq -c '{
    subtotal_num: (map(.subtotal_num // 0) | add // 0),
    crypto_total_num: (map(.crypto_subtotal_num // 0) | add // 0)
  }' 2>/dev/null || printf '{"subtotal_num":0,"crypto_total_num":0}')

  subtotal_num=$(printf '%s\n' "$totals" | jq -r '.subtotal_num // 0' 2>/dev/null || printf '0')
  crypto_total_num=$(printf '%s\n' "$totals" | jq -r '.crypto_total_num // 0' 2>/dev/null || printf '0')
  requires_shipping=$(printf '%s\n' "$quoted_items" | jq -r 'any(.[]?; (.physical == true) or ((.fulfillment_provider // "") == "printful"))' 2>/dev/null || printf 'false')
  printful_required=$(printf '%s\n' "$quoted_items" | jq -r 'any(.[]?; ((.fulfillment_provider // "") == "printful"))' 2>/dev/null || printf 'false')

  recipient_valid=false
  shipping_json='null'
  shipping_num='0'
  shipping_error=''
  if [ "$printful_required" = "true" ] && [ -n "$recipient_json_raw" ]; then
    recipient_json=$(blog_merch_recipient_from_json "$recipient_json_raw" 2>/dev/null || printf '')
    if [ -n "$recipient_json" ] && blog_merch_recipient_valid "$recipient_json"; then
      recipient_valid=true
      if blog_printful_configured; then
        order_probe=$(jq -cn --argjson items "$quoted_items" '{items:$items}')
        printful_items=$(blog_printful_shipping_items_from_order_json "$order_probe" 2>/dev/null || printf '[]')
        printful_item_count=$(printf '%s\n' "$printful_items" | jq -r 'length' 2>/dev/null || printf '0')
        case "$printful_item_count" in
          ''|*[!0-9]*) printful_item_count=0 ;;
        esac
        if [ "$printful_item_count" -gt 0 ]; then
          rates_response=$(blog_printful_shipping_rates_json "$recipient_json" "$printful_items" "USD" 2>/dev/null || printf '')
          rates_json=$(printf '%s\n' "$rates_response" | jq -c '(.result // .rates // .) | if type == "array" then . else [] end' 2>/dev/null || printf '[]')
          selected_shipping=$(printf '%s\n' "$rates_json" | jq -c --arg shipping_id "$shipping_id" '
            if (($shipping_id | length) > 0) then
              ([.[]? | select(((.id // .shipping_id // "") | tostring) == $shipping_id)] | .[0]) // (.[0] // null)
            else
              .[0] // null
            end
          ' 2>/dev/null || printf 'null')
          if [ "$selected_shipping" != "null" ] && [ -n "$selected_shipping" ]; then
            shipping_num=$(printf '%s\n' "$selected_shipping" | jq -r '.rate // .price // .amount // "0.00"' 2>/dev/null || printf '0')
            shipping_json=$(jq -cn --argjson selected "$selected_shipping" --argjson rates "$rates_json" '{selected:$selected, rates:$rates}')
          else
            shipping_error='No Printful shipping rate was returned.'
          fi
        else
          shipping_error='No fulfillable Printful items were found.'
        fi
      else
        shipping_error='Printful is not configured.'
      fi
    else
      shipping_error='A valid shipping recipient is required.'
    fi
  fi

  shipping_num=$(blog_payments_parse_amount "$shipping_num")
  total_num=$(awk 'BEGIN { printf "%.6f\n", (ARGV[1] + 0) + (ARGV[2] + 0) }' "$subtotal_num" "$shipping_num")
  crypto_total_with_shipping_num=$(awk 'BEGIN { printf "%.6f\n", (ARGV[1] + 0) + (ARGV[2] + 0) }' "$crypto_total_num" "$shipping_num")

  jq -cn \
    --argjson items "$quoted_items" \
    --arg subtotal "$(blog_payments_format_money "$subtotal_num")" \
    --arg shipping "$(blog_payments_format_money "$shipping_num")" \
    --arg total "$(blog_payments_format_money "$total_num")" \
    --arg crypto_total "$(blog_payments_format_money "$crypto_total_with_shipping_num")" \
    --argjson subtotal_num "$(blog_payments_parse_amount "$subtotal_num")" \
    --argjson shipping_num "$(blog_payments_parse_amount "$shipping_num")" \
    --argjson total_num "$(blog_payments_parse_amount "$total_num")" \
    --argjson crypto_total_num "$(blog_payments_parse_amount "$crypto_total_with_shipping_num")" \
    --argjson requires_shipping "$requires_shipping" \
    --argjson recipient_valid "$recipient_valid" \
    --argjson shipping_details "$shipping_json" \
    --arg shipping_error "$shipping_error" \
    '{
      items: $items,
      subtotal: $subtotal,
      shipping: $shipping,
      total: $total,
      crypto_total: $crypto_total,
      subtotal_num: $subtotal_num,
      shipping_num: $shipping_num,
      total_num: $total_num,
      crypto_total_num: $crypto_total_num,
      currency: "USD",
      requires_shipping: $requires_shipping,
      recipient_valid: $recipient_valid,
      shipping_details: $shipping_details,
      shipping_error: $shipping_error
    }'
}

blog_payments_provider_url_for_order() {
  order_id=${1-}
  provider=${2-btcpay}
  quote_json=${3-}
  purchase_token=${4-}
  subtotal=$(printf '%s\n' "$quote_json" | jq -r '.subtotal // "0.00"' 2>/dev/null || printf '0.00')
  total=$(printf '%s\n' "$quote_json" | jq -r '.total // .subtotal // "0.00"' 2>/dev/null || printf '0.00')
  crypto_total=$(printf '%s\n' "$quote_json" | jq -r '.crypto_total // .subtotal // "0.00"' 2>/dev/null || printf '0.00')
  btcpay_url=$(btcpay_url_for_request)
  buyer_email=$(printf '%s\n' "$quote_json" | jq -r '.recipient.email // ""' 2>/dev/null || printf '')

  case "$provider" in
    btcpay)
      if [ -n "$btcpay_url" ]; then
        printf '%s/setup-required?order_id=%s&amount=%s&currency=USD\n' "$btcpay_url" "$(blog_url_encode "$order_id")" "$(blog_url_encode "$crypto_total")"
      else
        printf '/checkout?order_id=%s\n' "$(blog_url_encode "$order_id")"
      fi
      ;;
    crossmint)
      printf '/checkout?order_id=%s\n' "$(blog_url_encode "$order_id")"
      ;;
    paybis)
      partner=$(blog_config_get "$blog_site_conf" paybis_partner_id 2>/dev/null || printf '')
      printf 'https://widget.paybis.com/?partnerId=%s&fiatCurrency=USD&fiatAmount=%s&orderId=%s\n' "$(blog_url_encode "$partner")" "$(blog_url_encode "$total")" "$(blog_url_encode "$order_id")"
      ;;
    *)
      return 1
      ;;
  esac
}

blog_payments_mark_order_paid_json() {
  order_id=${1-}
  provider=${2-unknown}
  order_json=$(blog_payments_order_load_json "$order_id" 2>/dev/null || printf '')
  [ -n "$order_json" ] || return 1

  status=$(printf '%s\n' "$order_json" | jq -r '.status // "pending"' 2>/dev/null || printf 'pending')
  if [ "$status" = "paid" ]; then
    existing_delivery_url=$(printf '%s\n' "$order_json" | jq -r '.delivery_url // ""' 2>/dev/null || printf '')
    if [ -n "$existing_delivery_url" ]; then
      printf '%s\n' "$order_json"
      return 0
    fi
    status=pending
  fi

  if [ "$status" != "pending" ]; then
    printf '%s\n' "$order_json"
    return 0
  fi

  links_file=$(mktemp "${TMPDIR:-/tmp}/blog-payment-links.XXXXXX")
  : > "$links_file"
  delivery_token=$(blog_payments_issue_delivery_token "$order_id" 2>/dev/null || printf '')
  delivery_url=''
  [ -n "$delivery_token" ] && delivery_url="/delivery/$order_id?token=$delivery_token"

  printf '%s\n' "$order_json" | jq -r '.items[]?.slug // empty' 2>/dev/null | while IFS= read -r slug || [ -n "$slug" ]; do
    [ -n "$slug" ] || continue
    printf '%s\n' "$(jq -cn --arg slug "$slug" --arg url "$delivery_url" '{slug:$slug, url:$url}')" >> "$links_file"
  done

  download_links=$(jq -sc '.' "$links_file" 2>/dev/null || printf '[]')
  rm -f "$links_file"

  now=$(blog_now_epoch)
  updated=$(printf '%s\n' "$order_json" | jq -c \
    --arg status paid \
    --arg provider "$provider" \
    --arg delivery_token "$delivery_token" \
    --arg delivery_url "$delivery_url" \
    --argjson paid_at "$now" \
    --argjson links "$download_links" \
    '. + {status:$status, provider:$provider, paid_at:$paid_at, delivery_token:$delivery_token, delivery_url:$delivery_url, download_links:$links}')
  updated=$(blog_order_fulfill_merch_json "$updated" 2>/dev/null || printf '%s\n' "$updated")
  blog_payments_order_save_json "$order_id" "$updated"
  blog_commerce_send_order_email "$updated" "Order received" 2>/dev/null || true
  printf '%s\n' "$updated"
}

blog_payments_refresh_btcpay_order_json() {
  order_json=${1-}
  [ -n "$order_json" ] || return 1
  status=$(printf '%s\n' "$order_json" | jq -r '.status // "pending"' 2>/dev/null || printf 'pending')
  provider=$(printf '%s\n' "$order_json" | jq -r '.provider // ""' 2>/dev/null || printf '')
  invoice_id=$(printf '%s\n' "$order_json" | jq -r '.btcpay_invoice_id // ""' 2>/dev/null || printf '')
  order_id=$(printf '%s\n' "$order_json" | jq -r '.order_id // ""' 2>/dev/null || printf '')
  if [ "$status" != "pending" ] || [ "$provider" != "btcpay" ] || [ -z "$invoice_id" ] || [ -z "$order_id" ]; then
    printf '%s\n' "$order_json"
    return 0
  fi
  invoice_json=$(blog_btcpay_get_invoice_json "$invoice_id" 2>/dev/null || printf '')
  [ -n "$invoice_json" ] || {
    printf '%s\n' "$order_json"
    return 0
  }
  invoice_status=$(printf '%s\n' "$invoice_json" | jq -r '.status // ""' 2>/dev/null | tr '[:upper:]' '[:lower:]')
  case "$invoice_status" in
    settled|processing)
      blog_payments_mark_order_paid_json "$order_id" "btcpay"
      ;;
    expired|invalid)
      now=$(blog_now_epoch)
      updated=$(printf '%s\n' "$order_json" | jq -c --arg status failed --arg provider btcpay --argjson updated_at "$now" '. + {status:$status, provider:$provider, updated_at:$updated_at}')
      blog_payments_order_save_json "$order_id" "$updated"
      printf '%s\n' "$updated"
      ;;
    *)
      printf '%s\n' "$order_json"
      ;;
  esac
}

blog_payments_refresh_crossmint_order_json() {
  order_json=${1-}
  [ -n "$order_json" ] || return 1
  status=$(printf '%s\n' "$order_json" | jq -r '.status // "pending"' 2>/dev/null || printf 'pending')
  provider=$(printf '%s\n' "$order_json" | jq -r '.provider // ""' 2>/dev/null || printf '')
  crossmint_order_id=$(printf '%s\n' "$order_json" | jq -r '.crossmint_order_id // ""' 2>/dev/null || printf '')
  client_secret=$(printf '%s\n' "$order_json" | jq -r '.crossmint_client_secret // ""' 2>/dev/null || printf '')
  order_id=$(printf '%s\n' "$order_json" | jq -r '.order_id // ""' 2>/dev/null || printf '')
  if [ "$status" != "pending" ] || [ "$provider" != "crossmint" ] || [ -z "$crossmint_order_id" ] || [ -z "$order_id" ]; then
    printf '%s\n' "$order_json"
    return 0
  fi
  crossmint_json=$(blog_crossmint_get_order_json "$crossmint_order_id" "$client_secret" 2>/dev/null || printf '')
  [ -n "$crossmint_json" ] || {
    printf '%s\n' "$order_json"
    return 0
  }
  payment_status=$(printf '%s\n' "$crossmint_json" | jq -r '.payment.status // ""' 2>/dev/null | tr '[:upper:]' '[:lower:]')
  case "$payment_status" in
    completed)
      blog_payments_mark_order_paid_json "$order_id" "crossmint"
      ;;
    failed-kyc|failed|refunded|cancelled|canceled)
      now=$(blog_now_epoch)
      updated=$(printf '%s\n' "$order_json" | jq -c --arg status failed --arg provider crossmint --arg provider_status "$payment_status" --argjson updated_at "$now" --argjson crossmint "$crossmint_json" '. + {status:$status, provider:$provider, provider_status:$provider_status, updated_at:$updated_at, crossmint_order:$crossmint}')
      blog_payments_order_save_json "$order_id" "$updated"
      printf '%s\n' "$updated"
      ;;
    *)
      now=$(blog_now_epoch)
      updated=$(printf '%s\n' "$order_json" | jq -c --arg provider crossmint --arg provider_status "$payment_status" --argjson updated_at "$now" --argjson crossmint "$crossmint_json" '. + {provider:$provider, provider_status:$provider_status, updated_at:$updated_at, crossmint_order:$crossmint}')
      blog_payments_order_save_json "$order_id" "$updated"
      printf '%s\n' "$updated"
      ;;
  esac
}

blog_payments_find_order_id_by_crossmint_order_id() {
  crossmint_order_id=${1-}
  [ -n "$crossmint_order_id" ] || return 1
  for path in "$blog_payments_orders_dir"/*.json; do
    [ -f "$path" ] || continue
    found=$(jq -r --arg crossmint_order_id "$crossmint_order_id" 'select((.crossmint_order_id // "") == $crossmint_order_id) | .order_id // ""' "$path" 2>/dev/null || printf '')
    if [ -n "$found" ]; then
      printf '%s\n' "$found"
      return 0
    fi
  done
  return 1
}

blog_payments_json() {
  action=$(blog_param action)
  if [ -z "$action" ]; then
    action=$(printf '%s' "${REQUEST_METHOD-GET}" | tr '[:upper:]' '[:lower:]')
  fi

  case "$action" in
    status)
      blog_payments_emit_runtime_status_json
      ;;
    quote)
      if ! blog_plugin_enabled commerce; then
        blog_json_error "Shopping cart is disabled" "commerce_disabled"
        exit 0
      fi
      items_json=$(blog_param items_json)
      recipient_json=$(blog_param recipient_json)
      shipping_id=$(blog_param shipping_id)
      quoted=$(blog_payments_quote_items_json "$items_json" "$recipient_json" "$shipping_id" 2>/dev/null || printf '')
      if [ -z "$quoted" ]; then
        blog_json_error "Could not quote items" "invalid_items"
        exit 0
      fi
      jq -cn --argjson quote "$quoted" '{success:true, quote:$quote}'
      printf '\n'
      ;;
    create_order)
      if ! blog_plugin_enabled commerce; then
        blog_json_error "Shopping cart is disabled" "commerce_disabled"
        exit 0
      fi
      items_json=$(blog_param items_json)
      recipient_json_raw=$(blog_param recipient_json)
      shipping_id=$(blog_param shipping_id)
      payment_method=$(printf '%s' "$(blog_param payment_method)" | tr '[:upper:]' '[:lower:]')
      provider=$(printf '%s' "$(blog_param provider)" | tr '[:upper:]' '[:lower:]')
      [ -n "$payment_method" ] || payment_method='crypto'
      case "$payment_method" in
        crypto|credit) ;;
        *) payment_method='crypto' ;;
      esac
      case "$provider" in
        btcpay|crossmint|paybis) ;;
        *) provider=$( [ "$payment_method" = 'credit' ] && printf 'crossmint' || printf 'btcpay' ) ;;
      esac

      quoted=$(blog_payments_quote_items_json "$items_json" '' '' 2>/dev/null || printf '')
      if [ -z "$quoted" ]; then
        blog_json_error "Could not quote items" "invalid_items"
        exit 0
      fi
      requires_shipping=$(printf '%s\n' "$quoted" | jq -r '.requires_shipping // false' 2>/dev/null || printf 'false')
      recipient_json='null'
      if [ "$requires_shipping" = "true" ]; then
        if ! blog_plugin_enabled merch_store; then
          blog_json_error "Merch store plugin is disabled" "merch_store_disabled"
          exit 0
        fi
        if ! blog_printful_configured; then
          blog_json_error "Printful is not connected yet" "printful_not_configured"
          exit 0
        fi
        recipient_json=$(blog_merch_recipient_from_json "$recipient_json_raw" 2>/dev/null || printf '')
        if [ -z "$recipient_json" ] || ! blog_merch_recipient_valid "$recipient_json"; then
          blog_json_error "Shipping name, email, address, city, country, postal code, and state/province where required must be provided" "shipping_required"
          exit 0
        fi
        quoted=$(blog_payments_quote_items_json "$items_json" "$recipient_json" "$shipping_id" 2>/dev/null || printf '')
        if [ -z "$quoted" ]; then
          blog_json_error "Could not quote merch shipping" "shipping_quote_failed"
          exit 0
        fi
        has_shipping=$(printf '%s\n' "$quoted" | jq -r 'if (.shipping_details.selected? // null) == null then "false" else "true" end' 2>/dev/null || printf 'false')
        if [ "$has_shipping" != "true" ]; then
          shipping_error=$(printf '%s\n' "$quoted" | jq -r '.shipping_error // "Could not quote merch shipping"' 2>/dev/null || printf 'Could not quote merch shipping')
          blog_json_error "$shipping_error" "shipping_quote_failed"
          exit 0
        fi
        quoted=$(printf '%s\n' "$quoted" | jq -c --argjson recipient "$recipient_json" '. + {recipient:$recipient}' 2>/dev/null || printf '%s\n' "$quoted")
      fi

      if [ "$provider" = "crossmint" ] && ! blog_crossmint_configured; then
        blog_json_error "Crossmint checkout is not connected yet" "crossmint_not_configured"
        exit 0
      fi

      order_id=$(blog_payments_new_order_id 2>/dev/null || printf '')
      if [ -z "$order_id" ]; then
        blog_json_error "Could not create order" "order_create_failed"
        exit 0
      fi

      slugs=$(printf '%s\n' "$quoted" | jq -c '[.items[]?.slug]' 2>/dev/null || printf '[]')
      purchase_payload=$(jq -cn --arg order_id "$order_id" --arg provider "$provider" --argjson products "$slugs" '{order_id:$order_id, provider:$provider, products:$products}')
      purchase_token=$(blog_payments_issue_token purchase "$purchase_payload" 7200 2>/dev/null || printf '')
      provider_url=$(blog_payments_provider_url_for_order "$order_id" "$provider" "$quoted" "$purchase_token" 2>/dev/null || printf '')
      if [ -z "$provider_url" ]; then
        blog_json_error "Could not create provider checkout URL" "provider_url_failed"
        exit 0
      fi
      buyer_email=$(printf '%s\n' "$quoted" | jq -r '.recipient.email // ""' 2>/dev/null || printf '')
      btcpay_invoice_id=''
      btcpay_checkout_link=''
      crossmint_order_id=''
      crossmint_client_secret=''
      crossmint_order='null'
      if [ "$provider" = "btcpay" ]; then
        order_title=$(printf '%s\n' "$quoted" | jq -r '[.items[]?.title] | join(", ")' 2>/dev/null || printf 'gazeta order')
        crypto_total=$(printf '%s\n' "$quoted" | jq -r '.crypto_total // .subtotal // "0.00"' 2>/dev/null || printf '0.00')
        invoice_json=$(blog_btcpay_create_invoice_json "$order_id" "$crypto_total" "USD" "$order_title" 2>/dev/null || printf '')
        if [ -n "$invoice_json" ]; then
          btcpay_invoice_id=$(printf '%s\n' "$invoice_json" | jq -r '.id // ""' 2>/dev/null || printf '')
          btcpay_checkout_link=$(printf '%s\n' "$invoice_json" | jq -r '.checkoutLink // .checkout.link // ""' 2>/dev/null || printf '')
          if [ -n "$btcpay_checkout_link" ]; then
            provider_url=$btcpay_checkout_link
          fi
        elif blog_btcpay_api_configured; then
          blog_json_error "BTCPay invoice creation failed" "btcpay_invoice_failed"
          exit 0
        else
          blog_json_error "BTCPay checkout is not connected yet" "btcpay_not_configured"
          exit 0
        fi
      elif [ "$provider" = "crossmint" ]; then
        crossmint_json=$(blog_crossmint_create_order_json "$order_id" "$quoted" "$buyer_email" 2>/dev/null || printf '')
        if [ -z "$crossmint_json" ]; then
          blog_json_error "Crossmint order creation failed" "crossmint_order_failed"
          exit 0
        fi
        crossmint_order_id=$(printf '%s\n' "$crossmint_json" | jq -r '.order.orderId // .orderId // ""' 2>/dev/null || printf '')
        crossmint_client_secret=$(printf '%s\n' "$crossmint_json" | jq -r '.clientSecret // ""' 2>/dev/null || printf '')
        crossmint_order=$(printf '%s\n' "$crossmint_json" | jq -c '.order // .' 2>/dev/null || printf 'null')
        if [ -z "$crossmint_order_id" ] || [ -z "$crossmint_client_secret" ]; then
          blog_json_error "Crossmint order response was missing checkout credentials" "crossmint_order_invalid"
          exit 0
        fi
      fi

      now=$(blog_now_epoch)
      order_json=$(jq -cn \
        --arg order_id "$order_id" \
        --arg payment_method "$payment_method" \
        --arg provider "$provider" \
        --argjson quote "$quoted" \
        --argjson recipient "$recipient_json" \
        --arg purchase_token "$purchase_token" \
        --arg provider_url "$provider_url" \
        --arg btcpay_invoice_id "$btcpay_invoice_id" \
        --arg btcpay_checkout_link "$btcpay_checkout_link" \
        --arg crossmint_order_id "$crossmint_order_id" \
        --arg crossmint_client_secret "$crossmint_client_secret" \
        --argjson crossmint_order "$crossmint_order" \
        --arg checkout_url "/checkout?order_id=$order_id" \
        --argjson created_at "$now" \
        '{
          order_id: $order_id,
          status: "pending",
          payment_method: $payment_method,
          provider: $provider,
          created_at: $created_at,
          purchase_token: $purchase_token,
          provider_url: $provider_url,
          btcpay_invoice_id: $btcpay_invoice_id,
          btcpay_checkout_link: $btcpay_checkout_link,
          crossmint_order_id: $crossmint_order_id,
          crossmint_client_secret: $crossmint_client_secret,
          crossmint_order: $crossmint_order,
          checkout_url: $checkout_url,
          items: ($quote.items // []),
          recipient: $recipient,
          shipping: ($quote.shipping_details // null),
          totals: {
            subtotal: ($quote.subtotal // "0.00"),
            shipping: ($quote.shipping // "0.00"),
            total: ($quote.total // $quote.subtotal // "0.00"),
            crypto_total: ($quote.crypto_total // "0.00"),
            currency: "USD"
          },
          download_links: []
        }')
      blog_payments_order_save_json "$order_id" "$order_json"

      jq -cn \
        --argjson order "$order_json" \
        --arg provider_url "$provider_url" \
        --arg checkout_url "/checkout?order_id=$order_id" \
        '{
          success: true,
          order: $order,
          provider_url: $provider_url,
          checkout_url: $checkout_url
        }'
      printf '\n'
      ;;
    order_status)
      order_id=$(blog_param order_id)
      if [ -z "$order_id" ]; then
        blog_json_error "order_id is required" "missing_order_id"
        exit 0
      fi
      order_json=$(blog_payments_order_load_json "$order_id" 2>/dev/null || printf '')
      if [ -z "$order_json" ]; then
        blog_json_error "Order not found" "order_not_found"
        exit 0
      fi
      order_json=$(blog_payments_refresh_btcpay_order_json "$order_json" 2>/dev/null || printf '%s\n' "$order_json")
      order_json=$(blog_payments_refresh_crossmint_order_json "$order_json" 2>/dev/null || printf '%s\n' "$order_json")
      jq -cn --argjson order "$order_json" '{success:true, order:$order}'
      printf '\n'
      ;;
    simulate_paid)
      if ! blog_require_session true; then
        exit 0
      fi
      order_id=$(blog_param order_id)
      if [ -z "$order_id" ]; then
        blog_json_error "order_id is required" "missing_order_id"
        exit 0
      fi
      paid_json=$(blog_payments_mark_order_paid_json "$order_id" "simulated" 2>/dev/null || printf '')
      if [ -z "$paid_json" ]; then
        blog_json_error "Could not mark order paid" "order_update_failed"
        exit 0
      fi
      jq -cn --argjson order "$paid_json" '{success:true, order:$order}'
      printf '\n'
      ;;
    webhook)
      order_id=$(blog_param order_id)
      payment_status=$(printf '%s' "$(blog_param payment_status)" | tr '[:upper:]' '[:lower:]')
      provider=$(printf '%s' "$(blog_param provider)" | tr '[:upper:]' '[:lower:]')
      [ -n "$provider" ] || provider='unknown'
      if [ -n "$BLOG_REQUEST_BODY" ] && printf '%s\n' "$BLOG_REQUEST_BODY" | jq -e 'type=="object"' >/dev/null 2>&1; then
        body_order_id=$(printf '%s\n' "$BLOG_REQUEST_BODY" | jq -r '.metadata.orderId // .metadata.order_id // .orderId // .payload.orderIdentifier // ""' 2>/dev/null || printf '')
        body_status=$(printf '%s\n' "$BLOG_REQUEST_BODY" | jq -r '.type // .status // ""' 2>/dev/null || printf '')
        body_provider=$(printf '%s\n' "$BLOG_REQUEST_BODY" | jq -e 'has("deliveryId")' >/dev/null 2>&1 && printf 'btcpay' || printf '')
        if [ -z "$body_provider" ] && printf '%s\n' "$BLOG_REQUEST_BODY" | jq -e '((.type // "") | tostring | test("^orders[.]")) or (.payload.orderIdentifier? != null)' >/dev/null 2>&1; then
          body_provider='crossmint'
        fi
        [ -n "$order_id" ] || order_id=$body_order_id
        [ -n "$payment_status" ] || payment_status=$(printf '%s' "$body_status" | tr '[:upper:]' '[:lower:]')
        [ "$provider" != "unknown" ] || [ -z "$body_provider" ] || provider=$body_provider
      fi
      webhook_secret_expected=$(blog_btcpay_webhook_secret 2>/dev/null || printf '')
      if [ -n "$webhook_secret_expected" ]; then
        webhook_secret=$(blog_param webhook_secret)
        if [ -z "$webhook_secret" ] || [ "$webhook_secret" != "$webhook_secret_expected" ]; then
          blog_json_error "Invalid webhook secret" "webhook_secret_invalid"
          exit 0
        fi
      fi
      if [ -z "$order_id" ]; then
        blog_json_error "order_id is required" "missing_order_id"
        exit 0
      fi
      if [ "$provider" = "crossmint" ]; then
        case "$payment_status" in
          orders.payment.succeeded) payment_status='paid' ;;
          orders.payment.failed|orders.delivery.failed) payment_status='failed' ;;
          orders.quote.created|orders.quote.updated|orders.delivery.initiated|orders.delivery.completed|'') payment_status='pending' ;;
        esac
        mapped_order_id=$(blog_payments_find_order_id_by_crossmint_order_id "$order_id" 2>/dev/null || printf '')
        [ -z "$mapped_order_id" ] || order_id=$mapped_order_id
      fi
      case "$payment_status" in
        paid|success|succeeded|settled|invoice_payment_settled|invoice_processing|processing)
          paid_json=$(blog_payments_mark_order_paid_json "$order_id" "$provider" 2>/dev/null || printf '')
          if [ -z "$paid_json" ]; then
            blog_json_error "Could not update order" "order_update_failed"
            exit 0
          fi
          jq -cn --argjson order "$paid_json" '{success:true, order:$order}'
          printf '\n'
          ;;
        pending|created|new)
          order_json=$(blog_payments_order_load_json "$order_id" 2>/dev/null || printf '')
          if [ -z "$order_json" ]; then
            blog_json_error "Order not found" "order_not_found"
            exit 0
          fi
          now=$(blog_now_epoch)
          updated=$(printf '%s\n' "$order_json" | jq -c --arg provider "$provider" --arg provider_status "$payment_status" --argjson updated_at "$now" '. + {provider:$provider, provider_status:$provider_status, updated_at:$updated_at}')
          blog_payments_order_save_json "$order_id" "$updated"
          jq -cn --argjson order "$updated" '{success:true, order:$order}'
          printf '\n'
          ;;
        *)
          order_json=$(blog_payments_order_load_json "$order_id" 2>/dev/null || printf '')
          if [ -z "$order_json" ]; then
            blog_json_error "Order not found" "order_not_found"
            exit 0
          fi
          now=$(blog_now_epoch)
          updated=$(printf '%s\n' "$order_json" | jq -c --arg status failed --arg provider "$provider" --argjson updated_at "$now" '. + {status:$status, provider:$provider, updated_at:$updated_at}')
          blog_payments_order_save_json "$order_id" "$updated"
          jq -cn --argjson order "$updated" '{success:true, order:$order}'
          printf '\n'
          ;;
      esac
      ;;
    *)
      blog_json_error "Unknown action" "unknown_action"
      ;;
  esac
}
