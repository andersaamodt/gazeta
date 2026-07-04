#!/bin/sh
# Shared helpers for external merch store providers.

set -eu

blog_merch_config_value() {
  key=${1-}
  [ -n "$key" ] || return 1
  printf '%s\n' "$(config-get "$blog_site_conf" "$key" 2>/dev/null || printf '')" | tr -d '\r'
}

blog_merch_default_secret_file() {
  blog_merch_default_secret_key=${1-}
  [ -n "$blog_merch_default_secret_key" ] || return 1
  blog_merch_default_secret_name=$(printf '%s' "$blog_merch_default_secret_key" | tr '_' '-')
  printf '%s/secrets/%s\n' "$blog_site_data" "$blog_merch_default_secret_name"
}

blog_merch_config_secret_value() {
  blog_merch_config_secret_key=${1-}
  [ -n "$blog_merch_config_secret_key" ] || return 1
  blog_merch_config_secret_file=$(blog_merch_config_value "${blog_merch_config_secret_key}_file" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  if [ -n "$blog_merch_config_secret_file" ] && [ -f "$blog_merch_config_secret_file" ]; then
    sed -n '1p' "$blog_merch_config_secret_file" 2>/dev/null | tr -d '\r\n[:space:]'
    return 0
  fi
  blog_merch_default_file=$(blog_merch_default_secret_file "$blog_merch_config_secret_key")
  if [ "$blog_merch_default_file" != "$blog_merch_config_secret_file" ] && [ -f "$blog_merch_default_file" ]; then
    sed -n '1p' "$blog_merch_default_file" 2>/dev/null | tr -d '\r\n[:space:]'
    return 0
  fi
  blog_merch_config_value "$blog_merch_config_secret_key" | tr -d '\n[:space:]'
}

blog_merch_write_secret_value() {
  blog_merch_write_secret_key=${1-}
  blog_merch_write_secret_value=${2-}
  [ -n "$blog_merch_write_secret_key" ] || return 1
  [ -n "$blog_merch_write_secret_value" ] || return 1
  blog_merch_write_secret_file=$(blog_merch_config_value "${blog_merch_write_secret_key}_file" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
  if [ -n "$blog_merch_write_secret_file" ] && [ ! -e "$blog_merch_write_secret_file" ]; then
    blog_merch_write_secret_dir=${blog_merch_write_secret_file%/*}
    if [ "$blog_merch_write_secret_dir" != "$blog_merch_write_secret_file" ] && [ ! -d "$blog_merch_write_secret_dir" ]; then
      blog_merch_write_secret_file=$(blog_merch_default_secret_file "$blog_merch_write_secret_key")
    fi
  fi
  if [ -n "$blog_merch_write_secret_file" ]; then
    blog_merch_write_secret_dir=${blog_merch_write_secret_file%/*}
    [ "$blog_merch_write_secret_dir" != "$blog_merch_write_secret_file" ] || blog_merch_write_secret_dir=.
    mkdir -p "$blog_merch_write_secret_dir"
    blog_merch_write_secret_tmp=$(mktemp "$blog_merch_write_secret_dir/.${blog_merch_write_secret_key}.XXXXXX")
    printf '%s\n' "$blog_merch_write_secret_value" > "$blog_merch_write_secret_tmp"
    chmod 600 "$blog_merch_write_secret_tmp" 2>/dev/null || true
    mv "$blog_merch_write_secret_tmp" "$blog_merch_write_secret_file"
    chmod 600 "$blog_merch_write_secret_file" 2>/dev/null || true
    return 0
  fi
  config-set "$blog_site_conf" "$blog_merch_write_secret_key" "$blog_merch_write_secret_value"
}

blog_printful_api_base() {
  base=$(blog_merch_config_value printful_api_base | tr -d '\n[:space:]')
  [ -n "$base" ] || base='https://api.printful.com'
  printf '%s\n' "${base%/}"
}

blog_printful_api_token() {
  blog_merch_config_secret_value printful_api_token
}

blog_printful_store_id() {
  blog_merch_config_value printful_store_id | tr -d '\n[:space:]'
}

blog_printful_confirm_orders() {
  value=$(blog_merch_config_value printful_confirm_orders | tr '[:upper:]' '[:lower:]' | tr -d '\n[:space:]')
  case "$value" in
    true|1|yes|on) printf 'true\n' ;;
    *) printf 'false\n' ;;
  esac
}

blog_printful_configured() {
  [ -n "$(blog_printful_api_token)" ] || return 1
  return 0
}

blog_printful_headers_args() {
  token=$(blog_printful_api_token)
  [ -n "$token" ] || return 1
  printf '%s\n' "-H"
  printf '%s\n' "Authorization: Bearer $token"
  store_id=$(blog_printful_store_id)
  if [ -n "$store_id" ]; then
    printf '%s\n' "-H"
    printf '%s\n' "X-PF-Store-Id: $store_id"
  fi
}

blog_printful_set_error() {
  blog_printful_api_error=${1-}
}

blog_printful_clear_error() {
  blog_printful_api_error=
}

blog_printful_api_last_error() {
  printf '%s\n' "$blog_printful_api_error"
}

blog_printful_api_json() {
  method=${1-GET}
  path=${2-}
  payload=${3-}
  [ -n "$path" ] || return 1
  blog_printful_configured || return 1
  command -v curl >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1

  url="$(blog_printful_api_base)$path"
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-printful-api.XXXXXX")
  headers_file=$(mktemp "${TMPDIR:-/tmp}/blog-printful-headers.XXXXXX")
  blog_printful_headers_args > "$headers_file"
  set -- curl -sS --connect-timeout 5 --max-time 12 -o "$tmp" -w '%{http_code}' -X "$method" -H "Accept: application/json"
  if [ "$method" = "POST" ] || [ "$method" = "PUT" ]; then
    set -- "$@" -H "Content-Type: application/json" --data "$payload"
  fi
  while IFS= read -r flag && IFS= read -r value; do
    [ -n "$flag" ] || continue
    set -- "$@" "$flag" "$value"
  done < "$headers_file"
  rm -f "$headers_file"
  set -- "$@" "$url"
  blog_printful_clear_error
  http_code=$("$@" 2>/dev/null || printf '000')
  body=$(cat "$tmp" 2>/dev/null || printf '')
  rm -f "$tmp"
  case "$http_code" in
    200|201)
      if printf '%s' "$body" | jq -e '.' >/dev/null 2>&1; then
        printf '%s\n' "$body" | jq -c '.' 2>/dev/null
        return 0
      fi
      blog_printful_set_error "Printful API returned non-JSON payload (HTTP ${http_code}) for ${url}."
      return 1
      ;;
    *)
      preview=''
      if [ -n "$body" ]; then
        preview=$(printf '%s' "$body" | tr '\n' ' ' | cut -c 1-220)
      fi
      if [ -n "$preview" ]; then
        blog_printful_set_error "Printful API request to ${path} returned HTTP ${http_code}: ${preview}"
      else
        blog_printful_set_error "Printful API request to ${path} returned HTTP ${http_code}."
      fi
      return 1
      ;;
  esac
}

blog_printful_status_json() {
  stores_json=$(blog_printful_api_json GET /stores '' 2>/dev/null || printf '')
  if [ -n "$stores_json" ]; then
    jq -cn --argjson stores "$stores_json" '{api_ready:true, stores:$stores}'
    return 0
  fi
  jq -cn '{api_ready:false, stores:null}'
}

blog_printful_extract_products_json() {
  raw_json=${1-}
  [ -n "$raw_json" ] || return 1
  printf '%s\n' "$raw_json" | jq -ec '
    if type == "array" then
      .
    elif type == "object" then
      if (.result | type) == "array" then .result
      elif (.data | type) == "array" then .data
      elif (.products | type) == "array" then .products
      elif (.sync_products | type) == "array" then .sync_products
      elif (.items | type) == "array" then .items
      elif (.sync_variants | type) == "array" then .sync_variants
      else empty
      end
    else
      empty
    end
  ' 2>/dev/null
}

blog_printful_sync_products_json() {
  for path in \
    '/sync/products?limit=100&offset=0' \
    '/sync/products?limit=100' \
    '/store/products?limit=100&offset=0' \
    '/store/products?limit=100' \
    '/v2/sync/products?limit=100&offset=0' \
    '/v2/sync/products?limit=100' \
    '/products?limit=100&offset=0' \
    '/products?limit=100'; do
    products=$(blog_printful_api_json GET "$path" '' 2>/dev/null || printf '')
    if [ -n "$products" ] && blog_printful_extract_products_json "$products" >/dev/null 2>&1; then
      printf '%s\n' "$products"
      return 0
    fi
  done
  return 1
}

blog_printful_sync_product_json() {
  product_id=${1-}
  [ -n "$product_id" ] || return 1
  safe_id=$(printf '%s' "$product_id" | tr -d '\r\n[:space:]')
  [ -n "$safe_id" ] || return 1
  blog_printful_api_json GET "/sync/products/$safe_id" ''
}

blog_merch_selection_path() {
  printf '%s/merch/selection.json\n' "$blog_site_data"
}

blog_merch_selection_normalize_json() {
  raw_json=${1-}
  [ -n "$raw_json" ] || raw_json='{}'
  printf '%s\n' "$raw_json" | jq -c '
    def clean_id:
      tostring | gsub("[\r\n[:space:]]"; "") | gsub("[^A-Za-z0-9_@-]"; "");
    def clean_slug:
      tostring
      | ascii_downcase
      | gsub("[^a-z0-9-]+"; "-")
      | gsub("-+"; "-")
      | gsub("^-+|-+$"; "");
    def clean_bool: . == true or . == "true" or . == "1" or . == 1 or . == "yes" or . == "on";
    def clean_item:
      {
        provider: ((.provider // "printful") | tostring | ascii_downcase),
        source_type: ((.source_type // .type // "sync_product") | tostring | ascii_downcase),
        source_id: ((.source_id // .printful_product_id // .id // "") | clean_id),
        slug: ((.slug // "") | clean_slug),
        sync_enabled: (.sync_enabled | clean_bool),
        show_on_merch_page: (.show_on_merch_page | clean_bool),
        sort_order: ((.sort_order // 0) | tonumber? // 0)
      }
      | select(.provider == "printful")
      | select(.source_type == "sync_product")
      | select((.source_id | length) > 0);
    (.items // .products // [] | if type == "array" then . else [] end) as $items
    | {
        version: 1,
        provider: "printful",
        items: ($items | map(clean_item) | unique_by(.provider + ":" + .source_type + ":" + .source_id) | sort_by(.sort_order, .source_id))
      }
  ' 2>/dev/null
}

blog_merch_selection_load_json() {
  path=$(blog_merch_selection_path)
  if [ -f "$path" ]; then
    raw=$(cat "$path" 2>/dev/null || printf '{}')
  else
    raw='{}'
  fi
  blog_merch_selection_normalize_json "$raw"
}

blog_merch_selection_save_json() {
  raw_json=${1-}
  normalized=$(blog_merch_selection_normalize_json "$raw_json") || return 1
  path=$(blog_merch_selection_path)
  dir=${path%/*}
  mkdir -p "$dir"
  tmp=$(mktemp "$dir/.selection.XXXXXX")
  printf '%s\n' "$normalized" > "$tmp"
  mv "$tmp" "$path"
  chmod 644 "$path" 2>/dev/null || true
  printf '%s\n' "$normalized"
}

blog_merch_recipient_from_json() {
  raw_json=${1-}
  [ -n "$raw_json" ] || return 1
  printf '%s\n' "$raw_json" | jq -c '
    def clean: tostring | gsub("[\r\n]"; " ") | gsub("^\\s+|\\s+$"; "");
    {
      name: (.name // .full_name // "" | clean),
      email: (.email // "" | clean),
      phone: (.phone // "" | clean),
      address1: (.address1 // .address // "" | clean),
      address2: (.address2 // "" | clean),
      city: (.city // "" | clean),
      state_code: (.state_code // .state // "" | clean | ascii_upcase),
      country_code: (.country_code // .country // "" | clean | ascii_upcase),
      zip: (.zip // .postal_code // "" | clean)
    }
    | with_entries(select(.value != ""))
  ' 2>/dev/null
}

blog_merch_recipient_valid() {
  recipient_json=${1-}
  [ -n "$recipient_json" ] || return 1
  printf '%s\n' "$recipient_json" | jq -e '
    ((.name // "") | length) > 0 and
    ((.email // "") | test("^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$")) and
    ((.address1 // "") | length) > 0 and
    ((.city // "") | length) > 0 and
    ((.country_code // "") | test("^[A-Z]{2}$")) and
    ((.zip // "") | length) > 0 and
    (if (.country_code == "US" or .country_code == "CA" or .country_code == "AU") then ((.state_code // "") | length) > 0 else true end)
  ' >/dev/null 2>&1
}

blog_printful_items_from_order_json() {
  order_json=${1-}
  [ -n "$order_json" ] || return 1
  printf '%s\n' "$order_json" | jq -c '
    [.items[]?
      | select((.fulfillment_provider // "") == "printful")
      | {
          quantity: ((.qty // 1) | tonumber? // 1),
          external_id: (.line_id // .item_key // .slug // ""),
          retail_price: (.unit_price // "0.00")
        }
        + (if ((.printful_sync_variant_id // "") | tostring | length) > 0 then {sync_variant_id: ((.printful_sync_variant_id // "") | tonumber? // (.printful_sync_variant_id // ""))}
           elif ((.printful_external_variant_id // "") | tostring | length) > 0 then {external_variant_id: (.printful_external_variant_id // "")}
           elif (((.printful_product_template_id // "") | tostring | length) > 0 and ((.printful_variant_id // "") | tostring | length) > 0) then {
             product_template_id: ((.printful_product_template_id // "") | tonumber? // (.printful_product_template_id // "")),
             variant_id: ((.printful_variant_id // "") | tonumber? // (.printful_variant_id // ""))
           }
           else {} end)
      | select((.sync_variant_id? != null) or ((.external_variant_id? // "") | length > 0) or ((.product_template_id? != null) and (.variant_id? != null)))
    ]
  ' 2>/dev/null
}

blog_printful_shipping_items_from_order_json() {
  order_json=${1-}
  [ -n "$order_json" ] || return 1
  printf '%s\n' "$order_json" | jq -c '
    [.items[]?
      | select((.fulfillment_provider // "") == "printful")
      | {
          quantity: ((.qty // 1) | tonumber? // 1),
          external_id: (.line_id // .item_key // .slug // "")
        }
        + (if ((.printful_variant_id // "") | tostring | length) > 0 then {variant_id: ((.printful_variant_id // "") | tonumber? // (.printful_variant_id // ""))}
           elif ((.printful_sync_variant_id // "") | tostring | length) > 0 then {sync_variant_id: ((.printful_sync_variant_id // "") | tonumber? // (.printful_sync_variant_id // ""))}
           elif ((.printful_external_variant_id // "") | tostring | length) > 0 then {external_variant_id: (.printful_external_variant_id // "")}
           else {} end)
      | select((.variant_id? != null) or (.sync_variant_id? != null) or ((.external_variant_id? // "") | length > 0))
    ]
  ' 2>/dev/null
}

blog_printful_shipping_rates_json() {
  recipient_json=${1-}
  items_json=${2-}
  currency=${3-USD}
  [ -n "$recipient_json" ] || return 1
  [ -n "$items_json" ] || return 1
  payload=$(jq -cn --argjson recipient "$recipient_json" --argjson items "$items_json" --arg currency "$currency" '{recipient:$recipient, items:$items, currency:$currency, locale:"en_US"}')
  blog_printful_api_json POST /shipping/rates "$payload"
}

blog_printful_create_order_json() {
  order_json=${1-}
  [ -n "$order_json" ] || return 1
  recipient_json=$(printf '%s\n' "$order_json" | jq -c '.recipient // empty' 2>/dev/null || printf '')
  items_json=$(blog_printful_items_from_order_json "$order_json" 2>/dev/null || printf '[]')
  item_count=$(printf '%s\n' "$items_json" | jq -r 'length' 2>/dev/null || printf 0)
  [ "$item_count" -gt 0 ] || return 1
  shipping_id=$(printf '%s\n' "$order_json" | jq -r '.shipping.selected.id // .shipping.id // ""' 2>/dev/null || printf '')
  external_id=$(printf '%s\n' "$order_json" | jq -r '.order_id // ""' 2>/dev/null | tr -cd 'A-Za-z0-9_-')
  payload=$(jq -cn \
    --argjson recipient "$recipient_json" \
    --argjson items "$items_json" \
    --arg shipping "$shipping_id" \
    --arg external_id "$external_id" \
    '{recipient:$recipient, items:$items, external_id:$external_id} + (if ($shipping|length)>0 then {shipping:$shipping} else {} end)')
  confirm=$(blog_printful_confirm_orders)
  path='/orders'
  [ "$confirm" = "true" ] && path='/orders?confirm=1'
  blog_printful_api_json POST "$path" "$payload"
}

blog_order_has_printful_items() {
  order_json=${1-}
  [ -n "$order_json" ] || return 1
  printf '%s\n' "$order_json" | jq -e 'any(.items[]?; (.fulfillment_provider // "") == "printful")' >/dev/null 2>&1
}

blog_order_fulfill_merch_json() {
  order_json=${1-}
  [ -n "$order_json" ] || return 1
  if ! blog_order_has_printful_items "$order_json"; then
    printf '%s\n' "$order_json"
    return 0
  fi
  if ! blog_printful_configured; then
    printf '%s\n' "$order_json" | jq -c '. + {fulfillment_status:"blocked", fulfillment_error:"Printful is not configured"}'
    return 0
  fi
  result_json=$(blog_printful_create_order_json "$order_json" 2>/dev/null || printf '')
  if [ -z "$result_json" ]; then
    printf '%s\n' "$order_json" | jq -c '. + {fulfillment_status:"failed", fulfillment_error:"Printful order creation failed"}'
    return 0
  fi
  printful_order=$(printf '%s\n' "$result_json" | jq -c '.result // .' 2>/dev/null || printf '{}')
  printful_order_id=$(printf '%s\n' "$printful_order" | jq -r '.id // ""' 2>/dev/null || printf '')
  printful_status=$(printf '%s\n' "$printful_order" | jq -r '.status // ""' 2>/dev/null || printf '')
  fulfillment_status='submitted'
  [ "$printful_status" = "draft" ] && fulfillment_status='draft'
  printf '%s\n' "$order_json" | jq -c \
    --arg fulfillment_status "$fulfillment_status" \
    --arg printful_order_id "$printful_order_id" \
    --arg printful_status "$printful_status" \
    --argjson printful_order "$printful_order" \
    '. + {fulfillment_status:$fulfillment_status, printful_order_id:$printful_order_id, printful_status:$printful_status, printful_order:$printful_order}'
}

blog_commerce_send_order_email() {
  order_json=${1-}
  subject=${2-}
  [ -n "$order_json" ] || return 1
  email=$(printf '%s\n' "$order_json" | jq -r '.recipient.email // ""' 2>/dev/null || printf '')
  [ -n "$email" ] || return 1
  sendmail_bin=$(blog_merch_config_value commerce_sendmail_path | tr -d '\n')
  if [ -z "$sendmail_bin" ]; then
    sendmail_bin=$(command -v sendmail 2>/dev/null || printf '')
  fi
  [ -n "$sendmail_bin" ] && [ -x "$sendmail_bin" ] || return 1
  from=$(blog_merch_config_value commerce_from_email | tr -d '\n')
  [ -n "$from" ] || from="orders@$(blog_normalize_public_host "${HTTP_HOST:-${SERVER_NAME:-example.invalid}}")"
  order_id=$(printf '%s\n' "$order_json" | jq -r '.order_id // ""' 2>/dev/null || printf '')
  status=$(printf '%s\n' "$order_json" | jq -r '.status // ""' 2>/dev/null || printf '')
  total=$(printf '%s\n' "$order_json" | jq -r '.totals.total // .totals.subtotal // "0.00"' 2>/dev/null || printf '0.00')
  {
    printf 'From: %s\n' "$from"
    printf 'To: %s\n' "$email"
    printf 'Subject: %s\n' "${subject:-Order update}"
    printf 'Content-Type: text/plain; charset=UTF-8\n'
    printf '\n'
    printf 'Order %s is %s.\n\n' "$order_id" "$status"
    printf 'Total: $%s\n' "$total"
  } | "$sendmail_bin" -t >/dev/null 2>&1
}
