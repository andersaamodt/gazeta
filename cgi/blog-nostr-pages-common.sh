#!/bin/sh
# Shared helpers for generic Nostr-backed pages.

set -eu

blog_nostr_pages_config_path() {
  printf '%s/nostr-pages.json\n' "$blog_state_dir"
}

blog_nostr_page_slug() {
  raw=${1-}
  slug=$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g; s/-\{2,\}/-/g; s/^-//; s/-$//')
  printf '%s\n' "$slug"
}

blog_nostr_page_titleize_slug() {
  slug=$(blog_nostr_page_slug "${1-}")
  title=$(printf '%s' "$slug" | sed 's/-/ /g')
  if [ -n "$title" ]; then
    first=$(printf '%s' "$title" | cut -c1 | tr '[:lower:]' '[:upper:]')
    rest=$(printf '%s' "$title" | cut -c2-)
    printf '%s%s\n' "$first" "$rest"
    return 0
  fi
  printf 'Untitled\n'
}

blog_nostr_page_placeholder_title() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1
  page=$(blog_nostr_page_entry_json "$slug" 2>/dev/null || printf '')
  if [ -n "$page" ]; then
    title=$(printf '%s\n' "$page" | jq -r '.placeholder_title // ""' 2>/dev/null || printf '')
    if [ -n "$title" ]; then
      printf '%s\n' "$title"
      return 0
    fi
  fi
  return 1
}

blog_nostr_page_default_title() {
  slug=$(blog_nostr_page_slug "${1-}")
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  [ -n "$slug" ] || {
    printf 'Untitled\n'
    return 0
  }
  placeholder_title=$(blog_nostr_page_placeholder_title "$slug" 2>/dev/null || printf '')
  if [ -n "$placeholder_title" ]; then
    printf '%s\n' "$placeholder_title"
    return 0
  fi
  if [ "$slug" = "index" ] && [ "$page_type" = "blog" ]; then
    printf 'Blog\n'
    return 0
  fi
  if [ "$slug" = "index" ]; then
    printf 'Home\n'
    return 0
  fi
  blog_nostr_page_titleize_slug "$slug"
}

blog_nostr_page_public_path() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || {
    printf '/\n'
    return 0
  }
  if [ "$slug" = "index" ]; then
    printf '/\n'
    return 0
  fi
  printf '/%s\n' "$slug"
}

blog_nostr_page_kind_for_type() {
  page_type=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]')
  case "$page_type" in
    contact) printf '0\n' ;;
    public-ranking) printf '30040\n' ;;
    nip23|blog) printf '30023\n' ;;
    *) printf '30004\n' ;;
  esac
}

blog_nostr_pages_default_json() {
  jq -cn '{
    pages: [
      {
        slug: "blog",
        type: "blog",
        kind: 30023,
        show_in_nav: true,
        placeholder_title: "Blog",
        path: "/blog"
      },
      {
        slug: "index",
        type: "nip23",
        kind: 30023,
        show_in_nav: true,
        placeholder_title: "Home",
        path: "/"
      },
      {
        slug: "about",
        type: "nip23",
        kind: 30023,
        show_in_nav: true,
        placeholder_title: "About",
        path: "/about"
      },
      {
        slug: "list",
        type: "list",
        kind: 30004,
        show_in_nav: true,
        placeholder_title: "List",
        path: "/list"
      }
    ]
  }'
}

blog_nostr_pages_normalize_json() {
  raw_json=${1-}
  if [ -z "$raw_json" ] || ! printf '%s\n' "$raw_json" | jq -e 'type=="object" or type=="array"' >/dev/null 2>&1; then
    blog_nostr_pages_default_json
    return 0
  fi

  legacy_blog_title=$(config-get "$blog_site_conf" blog_page_title 2>/dev/null || printf '')
  [ -n "$legacy_blog_title" ] || legacy_blog_title='Blog'

  printf '%s\n' "$raw_json" | jq -c --arg legacy_blog_title "$legacy_blog_title" '
    def title_from_slug($s):
      (($s // "") | tostring | gsub("-";" ")) as $t
      | if ($t | length) == 0 then "Untitled" else (($t[0:1] | ascii_upcase) + ($t[1:])) end;
    def norm_slug($v):
      (($v // "") | tostring | ascii_downcase
        | gsub("[^a-z0-9-]";"-")
        | gsub("-+";"-")
        | gsub("(^-+|-+$)";""));
    def norm_type($v):
      (($v // "") | tostring | ascii_downcase) as $t
      | if $t == "contact" then "contact"
        elif ($t == "public-ranking" or $t == "public_ranking" or $t == "ranking") then "public-ranking"
        elif ($t == "icon-gallery" or $t == "icon_gallery" or $t == "gallery") then "icon-gallery"
        elif ($t == "blog" or $t == "blog-index" or $t == "blog_index") then "blog"
        elif ($t == "nip23" or $t == "article" or $t == "document") then "nip23"
        else "list" end;
    def norm_path($slug; $type; $v):
      if $slug == "index" then "/"
      else ("/" + $slug)
      end;

    (
      if type == "object" then
        if ((.pages // null) | type) == "array" then
          .pages
        elif ((.pages // null) | type) == "object" then
          (
            .pages
            | to_entries
            | map(
                (.key | tostring) as $k
                | if (.value | type) == "object" then
                  (.value + { slug: ((.value.slug // "") | tostring | if length > 0 then . else $k end) })
                else
                  empty
                end
              )
          )
        elif (has("slug") and (has("type") or has("page_type"))) then
          [.]
        else
          (
            to_entries
            | map(
                (.key | tostring) as $k
                | if (.value | type) == "object" then
                  (.value + { slug: ((.value.slug // "") | tostring | if length > 0 then . else $k end) })
                else
                  empty
                end
              )
          )
        end
      else
        .
      end
    ) as $raw_pages
    | ($raw_pages | if type=="array" then . else [] end
      | map({
          slug: norm_slug(.slug // .list_slug // ""),
          type: norm_type(.type // .page_type // "list"),
          show_in_nav: (
            if has("show_in_nav") then
              (if .show_in_nav == false then false else true end)
            elif has("show_nav") then
              (if .show_nav == false then false else true end)
            else true end
          ),
          default_tag: ((.default_tag // "") | tostring | gsub("^\\s+|\\s+$";"")),
          placeholder_title: ((.placeholder_title // .title // "") | tostring),
          path: ((.path // "") | tostring)
        })
      | map(select((.slug | length) > 0))
    ) as $pages
    | (reduce $pages[] as $p ([];
        if any(.[]; .slug == $p.slug) then . else . + [$p] end
      )) as $unique
    | (
        if any($unique[]?; .type == "blog") then
          $unique
        else
          ([{
            slug: "blog",
            type: "blog",
            show_in_nav: true,
            placeholder_title: (($legacy_blog_title // "") | tostring),
            path: "/blog"
          }] + $unique)
        end
      ) as $with_blog
    | $with_blog as $with_required_pages
    | {
        pages:
          (if ($with_required_pages | length) == 0 then
             []
           else
             ($with_required_pages
             | map(
               .kind = (
                 if .type == "contact" then 0
                 elif .type == "public-ranking" then 30040
                 elif (.type == "nip23" or .type == "blog") then 30023
                 else 30004
                 end
               )
               | .show_in_nav = (if .show_in_nav == false then false else true end)
               | .default_tag = (if .type == "blog" then (.default_tag // "") else "" end)
               | .placeholder_title = (if (.placeholder_title | length) > 0 then .placeholder_title else title_from_slug(.slug) end)
               | .path = norm_path(.slug; .type; .path)
             ))
           end)
      }
  ' 2>/dev/null || blog_nostr_pages_default_json
}

blog_nostr_pages_load_json() {
  path=$(blog_nostr_pages_config_path)
  raw=''
  raw_norm=''
  if [ -f "$path" ]; then
    raw=$(cat "$path" 2>/dev/null || printf '')
    raw_norm=$(printf '%s\n' "$raw" | jq -c '.' 2>/dev/null || printf '')
  fi
  normalized=$(blog_nostr_pages_normalize_json "$raw")
  normalized_norm=$(printf '%s\n' "$normalized" | jq -c '.' 2>/dev/null || printf '')
  if [ ! -f "$path" ] || [ "$raw_norm" != "$normalized_norm" ]; then
    blog_nostr_pages_save_json "$normalized"
  fi
  printf '%s\n' "$normalized"
}

blog_nostr_pages_save_json() {
  raw_json=${1-}
  [ -n "$raw_json" ] || return 1
  normalized=$(blog_nostr_pages_normalize_json "$raw_json")
  path=$(blog_nostr_pages_config_path)
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-pages.XXXXXX")
  printf '%s\n' "$normalized" > "$tmp"
  mv "$tmp" "$path"
  chmod 644 "$path" 2>/dev/null || true
  blog_nostr_pages_prune_stale_source_pages "$normalized"
}

blog_nostr_page_entry_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1
  cfg=$(blog_nostr_pages_load_json)
  printf '%s\n' "$cfg" | jq -c --arg slug "$slug" '.pages[] | select(.slug == $slug) | .' 2>/dev/null | head -n 1
}

blog_nostr_page_type_for_slug() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1
  page=$(blog_nostr_page_entry_json "$slug" 2>/dev/null || printf '')
  if [ -n "$page" ]; then
    printf '%s\n' "$page" | jq -r '.type // "list"' 2>/dev/null || printf 'list\n'
    return 0
  fi
  if [ "$slug" = "list" ]; then
    printf 'list\n'
    return 0
  fi
  if [ "$slug" = "oeuvre" ]; then
    list_page=$(blog_nostr_page_entry_json "list" 2>/dev/null || printf '')
    if [ -n "$list_page" ]; then
      printf '%s\n' "$list_page" | jq -r '.type // "list"' 2>/dev/null || printf 'list\n'
    else
      printf 'list\n'
    fi
    return 0
  fi
  if [ "$slug" = "index" ]; then
    printf 'nip23\n'
    return 0
  fi
  if [ "$slug" = "blog" ]; then
    printf 'blog\n'
    return 0
  fi

  # Fallback for remote/site drift: infer type from an existing source or
  # mounted page shell when nostr-pages.json is temporarily out of sync.
  source_path=$(blog_nostr_page_source_path "$slug" 2>/dev/null || printf '')
  if [ -n "$source_path" ] && [ -f "$source_path" ]; then
    inferred_type=$(blog_nostr_page_source_template_type "$source_path" 2>/dev/null || printf '')
    case "$inferred_type" in
      nip23|blog|contact|public-ranking|list|icon-gallery)
        printf '%s\n' "$inferred_type"
        return 0
        ;;
    esac
  fi

  mount_path=$(blog_nostr_page_mount_path "$slug" 2>/dev/null || printf '')
  if [ -n "$mount_path" ] && [ -f "$mount_path" ]; then
    inferred_type=$(blog_nostr_page_source_template_type "$mount_path" 2>/dev/null || printf '')
    case "$inferred_type" in
      nip23|blog|contact|public-ranking|list|icon-gallery)
        printf '%s\n' "$inferred_type"
        return 0
        ;;
    esac
  fi
  return 1
}

blog_nostr_page_draft_path() {
  slug=$(blog_nostr_page_slug "${1-}")
  printf '%s/%s.json\n' "$blog_lists_dir" "$slug"
}

blog_nostr_page_mount_path() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1
  if [ "$slug" = "index" ]; then
    printf '%s/site/pages/index.md\n' "$blog_site_root"
  else
    printf '%s/site/pages/%s.md\n' "$blog_site_root" "$slug"
  fi
}

blog_nostr_page_source_path() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1
  printf '%s/%s.md\n' "$blog_pages_store_dir" "$slug"
}

blog_nostr_page_load_draft_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  path=$(blog_nostr_page_draft_path "$slug")
  [ -f "$path" ] || return 1
  raw=$(cat "$path" 2>/dev/null || printf '')
  [ -n "$raw" ] || return 1
  raw_type=$(printf '%s\n' "$raw" | jq -r '.type // ""' 2>/dev/null || printf '')
  case "$page_type:$raw_type" in
    blog:nip23|nip23:blog|contact:blog|contact:nip23|contact:list|contact:public-ranking|public-ranking:blog|public-ranking:nip23|public-ranking:list|public-ranking:contact|list:blog|list:nip23|list:contact|list:public-ranking)
      return 1
      ;;
  esac
  case "$page_type" in
    contact) blog_contact_normalize_state_json "$slug" "$raw" ;;
    public-ranking) blog_public_ranking_normalize_state_json "$slug" "$raw" ;;
    nip23|blog) blog_nip23_normalize_state_json "$slug" "$raw" "$page_type" ;;
    *) blog_list_normalize_state_json "$slug" "$raw" ;;
  esac
}

blog_nostr_page_save_draft_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  state_json=${3-}
  [ -n "$state_json" ] || return 1
  case "$page_type" in
    contact) normalized=$(blog_contact_normalize_state_json "$slug" "$state_json") ;;
    public-ranking) normalized=$(blog_public_ranking_normalize_state_json "$slug" "$state_json") ;;
    nip23|blog) normalized=$(blog_nip23_normalize_state_json "$slug" "$state_json" "$page_type") ;;
    *) normalized=$(blog_list_normalize_state_json "$slug" "$state_json") ;;
  esac
  path=$(blog_nostr_page_draft_path "$slug")
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-page-draft.XXXXXX")
  printf '%s\n' "$normalized" > "$tmp"
  mv "$tmp" "$path"
  chmod 644 "$path" 2>/dev/null || true
}

blog_nostr_kind_latest_event_json() {
  kind_raw=${1-}
  pubkey_raw=${2-}
  case "$kind_raw" in
    ''|*[!0-9]*) return 1 ;;
  esac
  kind=$kind_raw
  [ -d "$blog_nostr_events_dir" ] || return 1

  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-kind-events.XXXXXX")
  if [ -n "$pubkey_raw" ]; then
    pubkey=$(blog_validate_nostr_pubkey "$pubkey_raw" 2>/dev/null || printf '')
    [ -n "$pubkey" ] || { rm -f "$tmp"; return 1; }
    find "$blog_nostr_events_dir/$pubkey/$kind" -type f -name '*.json' 2>/dev/null | while IFS= read -r file; do
      [ -f "$file" ] || continue
      jq -c '.' "$file" 2>/dev/null || true
    done > "$tmp"
  else
    find "$blog_nostr_events_dir" -type f -path "*/$kind/*.json" 2>/dev/null | while IFS= read -r file; do
      [ -f "$file" ] || continue
      jq -c '.' "$file" 2>/dev/null || true
    done > "$tmp"
  fi

  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    return 1
  fi

  out=$(jq -cs --argjson kind "$kind" '
    [ .[] | select(type=="object" and (.kind|type)=="number" and .kind==$kind) ]
    | sort_by((.created_at // 0), (.id // ""))
    | last // empty
  ' "$tmp" 2>/dev/null || printf '')
  rm -f "$tmp"
  if [ -z "$out" ] || [ "$out" = "null" ]; then
    return 1
  fi
  printf '%s\n' "$out"
}

blog_nostr_site_pubkey() {
  cache_file="$blog_nostr_state_dir/site_pubkey"
  secret=$(blog_nostr_secret_key 2>/dev/null || printf '')
  if [ -n "$secret" ] && command -v nostril >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-site-pubkey.XXXXXX")
    set +e
    nostril --sec "$secret" --kind 1 --created-at "$(blog_now_epoch)" --content "" > "$tmp" 2>/dev/null
    sign_status=$?
    set -e
    if [ "$sign_status" -eq 0 ]; then
      pubkey=$(jq -r '.pubkey // ""' "$tmp" 2>/dev/null || printf '')
      pubkey=$(blog_validate_nostr_pubkey "$pubkey" 2>/dev/null || printf '')
      rm -f "$tmp"
      if [ -n "$pubkey" ]; then
        printf '%s\n' "$pubkey" > "$cache_file"
        chmod 600 "$cache_file" 2>/dev/null || true
        printf '%s\n' "$pubkey"
        return 0
      fi
    else
      rm -f "$tmp"
    fi
  fi

  if [ -f "$cache_file" ]; then
    cached=$(sed -n '1p' "$cache_file" 2>/dev/null | tr -d '\r\n[:space:]')
    cached=$(blog_validate_nostr_pubkey "$cached" 2>/dev/null || printf '')
    if [ -n "$cached" ]; then
      printf '%s\n' "$cached"
      return 0
    fi
  fi

  return 1
}

blog_nostr_contact_latest_event_json() {
  [ -d "$blog_nostr_events_dir" ] || return 1
  authors_json=$(blog_nostr_list_file_to_json_array "$blog_nostr_authors_file" 2>/dev/null || printf '[]')
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-contact-events.XXXXXX")
  find "$blog_nostr_events_dir" -type f -path '*/0/*.json' 2>/dev/null | while IFS= read -r file; do
    [ -f "$file" ] || continue
    jq -c '.' "$file" 2>/dev/null || true
  done > "$tmp"
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    return 1
  fi
  out=$(jq -cs --argjson authors "$authors_json" '
    [ .[]
      | select(type=="object" and (.kind|type)=="number" and .kind==0 and (.pubkey|type)=="string")
      | .pubkey as $pk
      | select((($authors | length) == 0) or (($authors | index($pk)) != null))
    ]
    | sort_by((.created_at // 0), (.id // ""))
    | last // empty
  ' "$tmp" 2>/dev/null || printf '')
  rm -f "$tmp"
  if [ -z "$out" ] || [ "$out" = "null" ]; then
    return 1
  fi
  printf '%s\n' "$out"
}

blog_nostr_nip23_latest_event_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1
  [ -d "$blog_nostr_events_dir" ] || return 1
  authors_json=$(blog_nostr_list_file_to_json_array "$blog_nostr_authors_file" 2>/dev/null || printf '[]')
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nip23-events.XXXXXX")
  find "$blog_nostr_events_dir" -type f -path '*/30023/*.json' 2>/dev/null | while IFS= read -r file; do
    [ -f "$file" ] || continue
    jq -c '.' "$file" 2>/dev/null || true
  done > "$tmp"
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    return 1
  fi
  out=$(jq -cs --arg slug "$slug" --argjson authors "$authors_json" '
    [ .[]
      | select(type=="object" and (.kind|type)=="number" and .kind==30023 and (.tags|type)=="array" and (.pubkey|type)=="string")
      | .pubkey as $pk
      | select((($authors | length) == 0) or (($authors | index($pk)) != null))
      | (([.tags[]? | select(type=="array" and length>=2 and .[0]=="d") | .[1]] | first) // "") as $d
      | select($d == $slug)
    ]
    | sort_by((.created_at // 0), (.id // ""))
    | last // empty
  ' "$tmp" 2>/dev/null || printf '')
  rm -f "$tmp"
  if [ -z "$out" ] || [ "$out" = "null" ]; then
    return 1
  fi
  printf '%s\n' "$out"
}

blog_nip23_default_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  [ -n "$page_type" ] || page_type='nip23'
  title=$(blog_nostr_page_default_title "$slug" "$page_type")
  purchase_endpoint=$(blog_nip23_default_purchase_endpoint "$slug" 2>/dev/null || printf '')
  state_type='nip23'
  if [ "$page_type" = 'blog' ]; then
    state_type='blog'
  fi
  jq -cn --arg slug "$slug" --arg title "$title" --arg state_type "$state_type" --arg purchase_endpoint "$purchase_endpoint" '{
    slug: $slug,
    type: $state_type,
    title: $title,
    content: "",
    product_enabled: false,
    product_type: "software",
    price: "",
    currency: "USD",
    crypto_discount_percent: 0,
    purchase_endpoint: $purchase_endpoint,
    repo: "",
    tag: "latest",
    extras_after: "",
    extras_after_format: "markdown"
  }'
}

blog_nip23_default_purchase_endpoint() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1
  printf '/purchase/%s\n' "$slug"
}

blog_nip23_normalize_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  raw_json=${2-}
  page_type=$(printf '%s' "${3-}" | tr '[:upper:]' '[:lower:]')
  [ -n "$page_type" ] || page_type='nip23'
  fallback_title=$(blog_nostr_page_default_title "$slug" "$page_type")
  default_purchase_endpoint=$(blog_nip23_default_purchase_endpoint "$slug" 2>/dev/null || printf '')
  state_type='nip23'
  if [ "$page_type" = 'blog' ]; then
    state_type='blog'
  fi
  if [ -z "$raw_json" ] || ! printf '%s\n' "$raw_json" | jq -e 'type=="object"' >/dev/null 2>&1; then
    blog_nip23_default_state_json "$slug" "$page_type"
    return 0
  fi
  printf '%s\n' "$raw_json" | jq -c --arg slug "$slug" --arg fallback_title "$fallback_title" --arg state_type "$state_type" --arg default_purchase_endpoint "$default_purchase_endpoint" '
    def norm_bool($v):
      if $v == true then true
      elif $v == false then false
      else
        (($v // "") | tostring | ascii_downcase) as $s
        | ($s == "true" or $s == "1" or $s == "yes" or $s == "on")
      end;
    def norm_price($v):
      (($v // "") | tostring | gsub("[[:space:]]"; "")) as $raw
      | if ($raw | test("^[0-9]+([.][0-9]{1,2})?$")) then $raw else "" end;
    def norm_currency($v):
      (($v // "USD") | tostring | ascii_upcase | gsub("[^A-Z]"; "")) as $c
      | if ($c | length) == 3 then $c else "USD" end;
    def norm_purchase($v):
      (($v // "") | tostring) as $p
      | if ($p | length) > 0 then $p else $default_purchase_endpoint end;
    def norm_product_type($v):
      (($v // "software") | tostring | ascii_downcase) as $t
      | if ($t == "software" or $t == "service" or $t == "membership") then $t else "software" end;
    def norm_discount($v):
      (($v // 0) | tonumber? // 0) as $n
      | if $n < 0 then 0 elif $n > 95 then 95 else $n end;
    def norm_trim($v):
      (($v // "") | tostring | gsub("^\\s+|\\s+$"; ""));

    (.product_enabled // .is_product // null) as $product_flag
    | (norm_price(.price // .price_usd // "")) as $price
    | (norm_purchase(.purchase_endpoint // .r // "")) as $purchase_endpoint
    | {
      slug: $slug,
      type: $state_type,
      title: ((.title // $fallback_title) | tostring),
      content: ((.content // "") | tostring),
      product_enabled: (
        if $product_flag == null then
          (($price | length) > 0)
        else
          norm_bool($product_flag)
        end
      ),
      product_type: norm_product_type(.product_type // ""),
      price: $price,
      currency: norm_currency(.currency // ""),
      crypto_discount_percent: norm_discount(.crypto_discount_percent // .crypto_discount // .discount_percent // 0),
      purchase_endpoint: $purchase_endpoint,
      repo: norm_trim(.repo // ""),
      tag: (norm_trim(.tag // "latest") | if length > 0 then . else "latest" end),
      extras_after: ((.extras_after // (if ((.extras // null) | type) == "object" then .extras.after else empty end) // "") | tostring),
      extras_after_format: "markdown"
    }
  ' 2>/dev/null || blog_nip23_default_state_json "$slug" "$page_type"
}

blog_nip23_state_from_event_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  event_json=${2-}
  page_type=$(printf '%s' "${3-}" | tr '[:upper:]' '[:lower:]')
  [ -n "$page_type" ] || page_type='nip23'
  if [ -z "$event_json" ] || ! printf '%s\n' "$event_json" | jq -e 'type=="object"' >/dev/null 2>&1; then
    blog_nip23_default_state_json "$slug" "$page_type"
    return 0
  fi
  raw=$(printf '%s\n' "$event_json" | jq -c --arg slug "$slug" '{
    slug: $slug,
    title: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="title") | .[1]] | first) // ""),
    content: (.content // ""),
    price: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="price") | .[1]] | first) // ""),
    currency: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="currency") | .[1]] | first) // "USD"),
    purchase_endpoint: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="r") | .[1]] | first) // ""),
    product_enabled: (
      (
        (([.tags[]? | select(type=="array" and length>=2 and .[0]=="price") | .[1]] | first) // "") as $price
        | ($price | length) > 0
      ) or
      (
        (([.tags[]? | select(type=="array" and length>=2 and .[0]=="r") | .[1]] | first) // "") as $r
        | ($r | length) > 0
      )
    )
  }' 2>/dev/null || printf '')
  blog_nip23_normalize_state_json "$slug" "$raw" "$page_type"
}

blog_nip23_state_signature_json() {
  state_json=${1-}
  if [ -z "$state_json" ]; then
    printf '{}\n'
    return 0
  fi
  printf '%s\n' "$state_json" | jq -c '{
    title: (.title // ""),
    content: (.content // ""),
    product_enabled: (.product_enabled // false),
    price: (if (.product_enabled // false) then (.price // "") else "" end),
    currency: (if (.product_enabled // false) then (.currency // "USD") else "USD" end),
    purchase_endpoint: (if (.product_enabled // false) then (.purchase_endpoint // "") else "" end)
  }' 2>/dev/null || printf '{}\n'
}

blog_nip23_validate_and_enrich_state_json() {
  state_json=${1-}
  strict_publish=${2-false}
  if [ -z "$state_json" ]; then
    printf '{"errors":["Missing page state"],"warnings":[],"can_publish":false}\n'
    return 0
  fi
  printf '%s\n' "$state_json" | jq -c --arg strict "$strict_publish" '
    def is_price($v):
      ($v | test("^[0-9]+([.][0-9]{1,2})?$"));

    (.title // "" | tostring) as $title
    | (.product_enabled // false) as $is_product
    | (.price // "" | tostring) as $price
    | (.currency // "USD" | tostring | ascii_upcase) as $currency
    | (.purchase_endpoint // "" | tostring) as $purchase_endpoint
    | (
        []
        + (if ($strict == "true" and ($title | length) == 0) then ["Title is required"] else [] end)
        + (if $is_product and (($price | length) == 0) then ["Product price is required"] else [] end)
        + (if (($price | length) > 0 and (is_price($price) | not)) then ["Price must be a positive USD amount with up to 2 decimals"] else [] end)
        + (if (($price | length) > 0 and (is_price($price)) and (($price | tonumber) <= 0)) then ["Price must be greater than zero"] else [] end)
        + (if $is_product and (($currency | test("^[A-Z]{3}$")) | not) then ["Currency must be a 3-letter code"] else [] end)
        + (if $is_product and (($purchase_endpoint | length) == 0) then ["Purchase endpoint is required"] else [] end)
        + (if $is_product and (($purchase_endpoint | length) > 0) and ((($purchase_endpoint | startswith("/")) or ($purchase_endpoint | startswith("https://")) or ($purchase_endpoint | startswith("http://"))) | not) then ["Purchase endpoint must be an absolute path or URL"] else [] end)
      ) as $errors
    | {
      errors: $errors,
      warnings: [],
      can_publish: (($errors | length) == 0)
    }
  ' 2>/dev/null || printf '{"errors":["Could not validate page state"],"warnings":[],"can_publish":false}\n'
}

blog_nostr_sign_nip23_event() {
  slug=$(blog_nostr_page_slug "${1-}")
  title=${2-}
  content=${3-}
  price=${4-}
  currency=${5-}
  purchase_endpoint=${6-}
  [ -n "$slug" ] || return 1
  if ! command -v nostril >/dev/null 2>&1; then
    return 1
  fi
  secret=$(blog_nostr_secret_key 2>/dev/null || printf '')
  [ -n "$secret" ] || return 1
  created_at=$(blog_now_epoch)
  set -- nostril --sec "$secret" --kind 30023 --created-at "$created_at" --content "$content" --tag d "$slug"
  if [ -n "$title" ]; then
    set -- "$@" --tag title "$title"
  fi
  if [ -n "$price" ]; then
    set -- "$@" --tag price "$price"
  fi
  if [ -n "$currency" ]; then
    set -- "$@" --tag currency "$currency"
  fi
  if [ -n "$purchase_endpoint" ]; then
    set -- "$@" --tag r "$purchase_endpoint"
  fi
  sign_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nip23-sign.XXXXXX")
  set +e
  "$@" > "$sign_tmp" 2>/dev/null
  sign_status=$?
  set -e
  if [ "$sign_status" -ne 0 ]; then
    rm -f "$sign_tmp"
    return 1
  fi
  event_json=$(cat "$sign_tmp" 2>/dev/null || printf '')
  rm -f "$sign_tmp"
  event_json=$(printf '%s\n' "$event_json" | jq -c '.' 2>/dev/null || printf '')
  [ -n "$event_json" ] || return 1
  if ! blog_nostr_verify_event_json "$event_json"; then
    return 1
  fi
  printf '%s\n' "$event_json"
}

blog_contact_default_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  title=$(blog_nostr_page_titleize_slug "$slug")
  jq -cn --arg slug "$slug" --arg title "$title" '{
    slug: $slug,
    type: "contact",
    title: $title,
    description: "",
    publish_intro_to_nostr: false,
    extras_before: "",
    extras_before_format: "markdown",
    extras_after: "",
    extras_after_format: "markdown",
    rows: [],
    content_json: {
      title: $title,
      description: ""
    }
  }'
}

blog_contact_normalize_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  raw_json=${2-}
  fallback_title=$(blog_nostr_page_titleize_slug "$slug")

  if [ -z "$raw_json" ] || ! printf '%s\n' "$raw_json" | jq -e 'type=="object"' >/dev/null 2>&1; then
    blog_contact_default_state_json "$slug"
    return 0
  fi

  printf '%s\n' "$raw_json" | jq -c --arg slug "$slug" --arg fallback_title "$fallback_title" '
    def qualifiers: ["preferred","unpreferred","public","primary","secondary","emergency","archive"];
    def norm_extra_format($v):
      (($v // "") | tostring | ascii_downcase) as $f
      | if $f == "html" then "html" else "markdown" end;
    def norm_transport($v):
      (($v // "") | tostring | ascii_downcase
      | gsub("[^a-z0-9/]+";"")
      | gsub("/+";"/")
      | gsub("^/+|/+$";""));
    def norm_qual($v):
      (($v // "") | tostring | ascii_downcase) as $q
      | if (qualifiers | index($q)) then $q else "" end;
    def parse_content_rows($obj):
      [ ($obj | to_entries[]) as $pair
        | ($pair.key | tostring) as $k
        | select($k != "title" and $k != "description")
        | ($pair.value | tostring) as $v
        | if ($k | contains("_")) then
            ($k | split("_")) as $parts
            | ($parts[0] // "") as $base
            | ($parts[1:] | join("_")) as $suffix
            | if (qualifiers | index(($suffix | ascii_downcase))) then
                { transport: $base, qualifier: ($suffix | ascii_downcase), value: $v }
              else
                { transport: $k, qualifier: "", value: $v }
              end
          else
            { transport: $k, qualifier: "", value: $v }
          end
      ];

    (if ((.content_json // null) | type) == "object" then .content_json
      elif ((.content // "") | type) == "string" and ((.content // "") | length) > 0 then (try (.content | fromjson) catch {})
      else {}
     end) as $content_obj
    | (if (.rows | type) == "array" and ((.rows | length) > 0) then .rows else parse_content_rows($content_obj) end) as $rows_raw
    | {
        slug: $slug,
        type: "contact",
        title: (((.title // $content_obj.title // $fallback_title) | tostring)),
        description: (((.description // $content_obj.description // "") | tostring)),
        publish_intro_to_nostr: (
          if (.publish_intro_to_nostr // null) == null then
            ((($content_obj | has("description")) and (($content_obj.description // "") | tostring | length > 0)))
          else
            ((.publish_intro_to_nostr == true) or ((.publish_intro_to_nostr | tostring | ascii_downcase) == "true"))
          end
        ),
        extras_before: ((.extras_before // (if ((.extras // null) | type) == "object" then .extras.before else empty end) // "") | tostring),
        extras_before_format: norm_extra_format(.extras_before_format // (if ((.extras // null) | type) == "object" then (.extras.before_format // .extras.before_type) else empty end) // "markdown"),
        extras_after: ((.extras_after // (if ((.extras // null) | type) == "object" then .extras.after else empty end) // "") | tostring),
        extras_after_format: "markdown",
        rows: (
          $rows_raw
          | if type=="array" then . else [] end
          | map({
              transport: norm_transport(.transport // ""),
              value: ((.value // "") | tostring),
              qualifier: norm_qual(.qualifier // "")
            })
          | map(select((.transport | length) > 0 or (.value | length) > 0))
        )
      }
    | .content_json = (
        ({
          title: .title
        }
        + (if .publish_intro_to_nostr then {description: .description} else {} end))
        + (reduce .rows[] as $r ({};
            if (($r.transport | length) > 0 and ($r.value | length) > 0) then
              . + { (($r.transport + (if ($r.qualifier | length) > 0 then ("_" + $r.qualifier) else "" end))): $r.value }
            else
              .
            end
          ))
      )
  ' 2>/dev/null || blog_contact_default_state_json "$slug"
}

blog_contact_state_from_event_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  event_json=${2-}
  if [ -z "$event_json" ] || ! printf '%s\n' "$event_json" | jq -e 'type=="object"' >/dev/null 2>&1; then
    blog_contact_default_state_json "$slug"
    return 0
  fi
  content_obj=$(printf '%s\n' "$event_json" | jq -c 'try (.content | fromjson) catch {}' 2>/dev/null || printf '{}')
  raw=$(jq -cn --arg slug "$slug" --argjson content "$content_obj" '{slug:$slug, content_json:$content}')
  blog_contact_normalize_state_json "$slug" "$raw"
}

blog_contact_state_signature_json() {
  state_json=${1-}
  if [ -z "$state_json" ]; then
    printf '{}\n'
    return 0
  fi
  printf '%s\n' "$state_json" | jq -c '{
    title: (.title // ""),
    description: (if (.publish_intro_to_nostr // false) then (.description // "") else "" end),
    publish_intro_to_nostr: (.publish_intro_to_nostr // false),
    rows: (.rows // [])
  }' 2>/dev/null || printf '{}\n'
}

blog_contact_validate_and_enrich_state_json() {
  state_json=${1-}
  strict_publish=${2-false}
  if [ -z "$state_json" ]; then
    printf '{"rows":[],"errors":["Missing contact state"],"warnings":[],"can_publish":false,"content_json":{}}\n'
    return 0
  fi

  printf '%s\n' "$state_json" | jq -c --arg strict "$strict_publish" '
    def qualifiers: ["preferred","unpreferred","public","primary","secondary","emergency","archive"];
    def key_for($r):
      (($r.transport // "") + (if (($r.qualifier // "") | length) > 0 then ("_" + ($r.qualifier // "")) else "" end));

    (.rows // []) as $rows0
    | ($rows0 | if type=="array" then . else [] end
      | map({
          transport: ((.transport // "") | tostring | ascii_downcase
            | gsub("[^a-z0-9/]+";"")
            | gsub("/+";"/")
            | gsub("^/+|/+$";"")),
          value: ((.value // "") | tostring),
          qualifier: ((.qualifier // "") | tostring | ascii_downcase)
        })) as $rows
    | ([ range(0; ($rows|length)) as $i
          | ($rows[$i]) as $r
          | if (($r.qualifier|length) > 0 and ((qualifiers | index($r.qualifier)) == null)) then
              "Row \(($i+1)) has invalid qualifier: \($r.qualifier)"
            elif (($r.transport|length) == 0 and ($r.value|length) > 0) then
              "Row \(($i+1)) is missing transport"
            else empty end
       ]) as $errors0
    | ([ range(0; ($rows|length)) as $i
          | ($rows[$i]) as $r
          | if (($r.transport|length) > 0 and ($r.value|length) == 0) then
              "Row \(($i+1)) has no value"
            else empty end
       ]) as $warnings0
    | (reduce $rows[] as $r ({};
         if (($r.transport|length) > 0 and ($r.value|length) > 0) then
           . + { (key_for($r)): ((. [key_for($r)] // 0) + 1) }
         else . end
      )) as $key_counts
    | ($errors0 + ([ $key_counts | to_entries[] | select(.value > 1) | "Duplicate contact key: " + .key ])) as $errors
    | {
        rows: $rows,
        errors: $errors,
        warnings: $warnings0,
        can_publish: (($errors | length) == 0),
        content_json: (
          ({
            title: ((.title // "") | tostring)
          }
          + (if (.publish_intro_to_nostr // false) then { description: ((.description // "") | tostring) } else {} end))
          + (reduce $rows[] as $r ({};
              if (($r.transport|length) > 0 and ($r.value|length) > 0) then
                . + { (key_for($r)): $r.value }
              else
                .
              end
            ))
        )
      }
  ' 2>/dev/null || printf '{"rows":[],"errors":["Could not validate contact state"],"warnings":[],"can_publish":false,"content_json":{}}\n'
}

blog_nostr_sign_contact_event() {
  content_json=${1-}
  [ -n "$content_json" ] || return 1
  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi
  if ! command -v nostril >/dev/null 2>&1; then
    return 1
  fi

  secret=$(blog_nostr_secret_key 2>/dev/null || printf '')
  [ -n "$secret" ] || return 1

  created_at=$(blog_now_epoch)
  sign_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-contact-sign.XXXXXX")
  set +e
  nostril --sec "$secret" --kind 0 --created-at "$created_at" --content "$content_json" > "$sign_tmp" 2>/dev/null
  sign_status=$?
  set -e
  if [ "$sign_status" -ne 0 ]; then
    rm -f "$sign_tmp"
    return 1
  fi

  event_json=$(cat "$sign_tmp" 2>/dev/null || printf '')
  rm -f "$sign_tmp"
  event_json=$(printf '%s\n' "$event_json" | jq -c '.' 2>/dev/null || printf '')
  [ -n "$event_json" ] || return 1
  if ! blog_nostr_verify_event_json "$event_json"; then
    return 1
  fi
  printf '%s\n' "$event_json"
}

blog_nostr_page_canonical_title() {
  slug=$(blog_nostr_page_slug "${1-}")
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  case "$page_type" in
    contact)
      event=$(blog_nostr_contact_latest_event_json 2>/dev/null || printf '')
      if [ -n "$event" ]; then
        printf '%s\n' "$event" | jq -r 'try (.content | fromjson | .title // "") catch ""' 2>/dev/null || printf ''
      else
        printf '\n'
      fi
      ;;
    nip23)
      event=$(blog_nostr_nip23_latest_event_json "$slug" 2>/dev/null || printf '')
      if [ -n "$event" ]; then
        printf '%s\n' "$event" | jq -r '([.tags[]? | select(type=="array" and length>=2 and .[0]=="title") | .[1]] | first) // ""' 2>/dev/null || printf ''
      else
        printf '\n'
      fi
      ;;
    public-ranking)
      event=$(blog_nostr_public_ranking_latest_event_json "$slug" 2>/dev/null || printf '')
      if [ -n "$event" ]; then
        printf '%s\n' "$event" | jq -r '([.tags[]? | select(type=="array" and length>=2 and .[0]=="title") | .[1]] | first) // ""' 2>/dev/null || printf ''
      else
        printf '\n'
      fi
      ;;
    blog)
      event=$(blog_nostr_nip23_latest_event_json "$slug" 2>/dev/null || printf '')
      if [ -n "$event" ]; then
        printf '%s\n' "$event" | jq -r '([.tags[]? | select(type=="array" and length>=2 and .[0]=="title") | .[1]] | first) // ""' 2>/dev/null || printf ''
      else
        printf '\n'
      fi
      ;;
    *)
      event=$(blog_nostr_list_latest_event_json "$slug" 2>/dev/null || printf '')
      if [ -n "$event" ]; then
        printf '%s\n' "$event" | jq -r '([.tags[]? | select(type=="array" and length>=2 and .[0]=="title") | .[1]] | first) // ""' 2>/dev/null || printf ''
      else
        printf '\n'
      fi
      ;;
  esac
}

blog_nostr_page_source_template_type() {
  file=${1-}
  [ -f "$file" ] || {
    printf 'missing\n'
    return 0
  }
  if grep -q 'id="nip23-page-root"' "$file" 2>/dev/null; then
    printf 'nip23\n'
    return 0
  fi
  if grep -q 'id="contact-page-root"' "$file" 2>/dev/null; then
    printf 'contact\n'
    return 0
  fi
  if grep -q 'id="public-ranking-root"' "$file" 2>/dev/null; then
    printf 'public-ranking\n'
    return 0
  fi
  if grep -q 'id="list-page-root"' "$file" 2>/dev/null ||
     grep -q 'id="oeuvre-root"' "$file" 2>/dev/null; then
    printf 'list\n'
    return 0
  fi
  if grep -q 'id="icon-gallery-root"' "$file" 2>/dev/null; then
    printf 'icon-gallery\n'
    return 0
  fi
  if grep -q 'id="blog-page-root"' "$file" 2>/dev/null; then
    printf 'blog\n'
    return 0
  fi
  printf 'custom\n'
}

blog_nostr_page_source_template_slug() {
  file=${1-}
  [ -f "$file" ] || {
    printf '\n'
    return 0
  }
  raw_slug=$(sed -n 's/.*data-page-slug="\([^"]*\)".*/\1/p; s/.*data-list-slug="\([^"]*\)".*/\1/p; s/.*data-blog-slug="\([^"]*\)".*/\1/p; s/.*data-ranking-slug="\([^"]*\)".*/\1/p' "$file" 2>/dev/null | head -n 1)
  printf '%s\n' "$(blog_nostr_page_slug "$raw_slug")"
}

blog_nostr_page_template_is_current() {
  file=${1-}
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  [ -f "$file" ] || return 1
  case "$page_type" in
    blog)
      grep -q 'id="blog-page-title"' "$file" 2>/dev/null &&
      grep -q 'id="blog-page-admin"' "$file" 2>/dev/null &&
      grep -q 'id="blog-page-content"' "$file" 2>/dev/null &&
      grep -q 'class="blog-layout"' "$file" 2>/dev/null &&
      grep -q 'class="blog-filter-column"' "$file" 2>/dev/null &&
      grep -q 'class="blog-main-column"' "$file" 2>/dev/null &&
      grep -q 'id="blog-filter-toggle"' "$file" 2>/dev/null
      ;;
    nip23)
      grep -q 'id="nip23-page-title"' "$file" 2>/dev/null &&
      grep -q 'id="nip23-page-admin"' "$file" 2>/dev/null &&
      grep -q 'id="nip23-page-content"' "$file" 2>/dev/null
      ;;
    public-ranking)
      grep -q 'id="public-ranking-title"' "$file" 2>/dev/null &&
      grep -q 'id="public-ranking-admin"' "$file" 2>/dev/null &&
      grep -q 'id="public-ranking-content"' "$file" 2>/dev/null
      ;;
    contact)
      grep -q 'id="contact-page-title"' "$file" 2>/dev/null &&
      grep -q 'id="contact-page-admin"' "$file" 2>/dev/null &&
      grep -q 'id="contact-page-content"' "$file" 2>/dev/null
      ;;
    list)
      grep -q 'id="list-page-title"' "$file" 2>/dev/null &&
      grep -q 'id="list-page-admin"' "$file" 2>/dev/null &&
      grep -q 'id="list-page-content"' "$file" 2>/dev/null
      ;;
    icon-gallery)
      grep -q 'id="list-page-title"' "$file" 2>/dev/null &&
      grep -q 'id="list-page-admin"' "$file" 2>/dev/null &&
      grep -q 'id="list-page-content"' "$file" 2>/dev/null
      ;;
    *)
      return 0
      ;;
  esac
}

blog_nostr_pages_prune_stale_source_pages() {
  cfg_json=${1-}
  pages_dir=$blog_site_root/site/pages
  [ -d "$pages_dir" ] || return 0

  find "$pages_dir" -maxdepth 1 \( -type f -o -type l \) -name '*.md' | while IFS= read -r page_file || [ -n "$page_file" ]; do
    [ -n "$page_file" ] || continue
    existing_type=$(blog_nostr_page_source_template_type "$page_file")
    case "$existing_type" in
      custom|missing)
        continue
        ;;
      *)
        ;;
    esac

    existing_slug=$(blog_nostr_page_source_template_slug "$page_file")
    [ -n "$existing_slug" ] || continue

    current_row=$(printf '%s\n' "$cfg_json" | jq -c --arg slug "$existing_slug" '.pages[]? | select(.slug == $slug) | .' 2>/dev/null | head -n 1)
    if [ -z "$current_row" ]; then
      rm -f "$page_file"
      continue
    fi

    current_type=$(printf '%s\n' "$current_row" | jq -r '.type // "list"' 2>/dev/null || printf 'list')
    mount_path=$(blog_nostr_page_mount_path "$existing_slug" 2>/dev/null || printf '')
    if [ -z "$mount_path" ] || [ "$current_type" != "$existing_type" ] || [ "$page_file" != "$mount_path" ]; then
      rm -f "$page_file"
    fi
  done
}

blog_nostr_page_sync_mount() {
  slug=$(blog_nostr_page_slug "${1-}")
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  [ -n "$slug" ] || return 1
  source_path=$(blog_nostr_page_source_path "$slug" "$page_type")
  mount_path=$(blog_nostr_page_mount_path "$slug")
  pages_dir=$(dirname "$mount_path")
  mkdir -p "$pages_dir" "$blog_pages_store_dir"
  [ -f "$source_path" ] || return 1

  if [ -L "$mount_path" ]; then
    rm -f "$mount_path"
  elif [ -e "$mount_path" ]; then
    existing_type=$(blog_nostr_page_source_template_type "$mount_path")
    existing_slug=$(blog_nostr_page_source_template_slug "$mount_path")
    if [ "$existing_type" = "custom" ]; then
      return 0
    fi
    if [ "$existing_type" != "$page_type" ] || ! { [ -z "$existing_slug" ] || [ "$existing_slug" = "$slug" ]; } || ! blog_nostr_page_template_is_current "$mount_path" "$page_type"; then
      rm -f "$mount_path"
    fi
  fi

  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-page-mount.XXXXXX")
  cp "$source_path" "$tmp"
  mv "$tmp" "$mount_path"
  chmod 644 "$mount_path" 2>/dev/null || true
}

blog_nostr_page_ensure_source_page() {
  slug=$(blog_nostr_page_slug "${1-}")
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  [ -n "$slug" ] || return 1
  page_file=$(blog_nostr_page_source_path "$slug" "$page_type")
  mount_path=$(blog_nostr_page_mount_path "$slug")
  pages_dir=$(dirname "$mount_path")
  mkdir -p "$pages_dir" "$blog_pages_store_dir"

  if [ ! -f "$page_file" ] && [ ! -L "$page_file" ] && [ -f "$mount_path" ]; then
    existing_type=$(blog_nostr_page_source_template_type "$mount_path")
    existing_slug=$(blog_nostr_page_source_template_slug "$mount_path")
    if [ "$existing_type" = "$page_type" ] && { [ -z "$existing_slug" ] || [ "$existing_slug" = "$slug" ]; }; then
      mv "$mount_path" "$page_file"
    fi
  fi

  if [ -f "$page_file" ]; then
    existing_type=$(blog_nostr_page_source_template_type "$page_file")
    case "$existing_type" in
      custom)
        # Preserve non-managed/custom pages.
        blog_nostr_page_sync_mount "$slug" "$page_type" >/dev/null 2>&1 || true
        return 0
        ;;
      missing)
        ;;
      *)
        existing_slug=$(blog_nostr_page_source_template_slug "$page_file")
        if [ "$existing_type" = "$page_type" ] && { [ -z "$existing_slug" ] || [ "$existing_slug" = "$slug" ]; } && blog_nostr_page_template_is_current "$page_file" "$page_type"; then
          blog_nostr_page_sync_mount "$slug" "$page_type" >/dev/null 2>&1 || true
          return 0
        fi
        ;;
    esac
  fi

  page_title=$(blog_nostr_page_default_title "$slug" "$page_type")

  case "$page_type" in
    contact)
      cat > "$page_file" <<EOCONTACT
---
title: "$page_title"
published_at: "$(blog_now_iso)"
content_hash: ""
tags: ["nostr", "contact"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

<section id="contact-page-root" class="list-page-shell" data-page-slug="$slug" data-page-type="contact" data-page-title="$page_title">
<div class="list-page-head">
<h1 id="contact-page-title">$page_title</h1>
<p id="contact-page-description" class="muted"></p>
</div>
<div id="contact-page-admin" class="list-admin" hidden></div>
<div id="contact-page-validation" class="list-validation" hidden></div>
<div id="contact-page-content" class="list-page-content"></div>
</section>

<script src="/static/nostr-publish-dialog.js"></script>
<script src="/static/contact-page.js"></script>
EOCONTACT
      ;;
    nip23)
      cat > "$page_file" <<EONIP23
---
title: "$page_title"
published_at: "$(blog_now_iso)"
content_hash: ""
tags: ["nostr", "nip23"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

<section id="nip23-page-root" class="list-page-shell" data-page-slug="$slug" data-page-type="nip23" data-page-title="$page_title">
<div class="list-page-head">
<h1 id="nip23-page-title">$page_title</h1>
</div>
<div id="nip23-page-admin" class="list-admin" hidden></div>
<div id="nip23-page-validation" class="list-validation" hidden></div>
<div id="nip23-page-content" class="list-page-content"></div>
</section>

<script src="/static/nostr-publish-dialog.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/nip23-page.js?v=20260326-pagefix5"></script>
EONIP23
      ;;
    blog)
      cat > "$page_file" <<EOBLOG
---
title: "$page_title"
published_at: "$(blog_now_iso)"
content_hash: ""
tags: ["nostr", "blog"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

<section id="blog-page-root" class="blog-page" data-blog-slug="$slug" data-page-type="blog" aria-live="polite">
<div class="blog-layout">
<div class="blog-filter-column">
<button id="blog-filter-toggle" type="button" class="blog-filter-toggle unobtrusive-icon-button" aria-expanded="false" aria-controls="blog-filter-panel" aria-label="Filter posts" title="Filter posts">
<svg class="blog-filter-icon" viewBox="0 0 16 16" aria-hidden="true">
<line x1="2" y1="3" x2="14" y2="3"></line>
<circle cx="6" cy="3" r="1.25"></circle>
<line x1="2" y1="8" x2="14" y2="8"></line>
<circle cx="10.5" cy="8" r="1.25"></circle>
<line x1="2" y1="13" x2="14" y2="13"></line>
<circle cx="4.5" cy="13" r="1.25"></circle>
</svg>
</button>
</div>
<div class="blog-main-column">
<div class="list-page-head">
<h1 id="blog-page-title" hidden></h1>
<p id="blog-page-description" class="muted" hidden></p>
</div>
<div id="blog-page-admin" class="list-admin" hidden></div>
<div id="blog-page-validation" class="list-validation" hidden></div>
<div id="blog-page-content" class="list-page-content" hidden></div>
<div id="blog-filter-panel" class="blog-filter-panel" hidden>
<div class="blog-filter-grid">
<div class="blog-filter-group">
<h3>Tags</h3>
<div id="blog-filter-tags" class="blog-filter-options"></div>
</div>
<div class="blog-filter-group">
<h3>Year</h3>
<div id="blog-filter-years" class="blog-filter-options"></div>
</div>
<div class="blog-filter-group">
<h3>Type</h3>
<div id="blog-filter-types" class="blog-filter-options"></div>
</div>
</div>
<div class="blog-filter-footer">
<button id="blog-clear-filters" type="button" class="blog-clear-filters">Clear filters</button>
</div>
</div>

<div id="blog-post-list" class="post-list"></div>
<p id="blog-empty" class="placeholder" hidden>No posts match these filters.</p>
</div>
</div>
</section>

<script src="/static/blog-page.js?v=20260326-pagefix6"></script>
EOBLOG
      ;;
    public-ranking)
      cat > "$page_file" <<EORANKING
---
title: "$page_title"
published_at: "$(blog_now_iso)"
content_hash: ""
tags: ["nostr", "public-ranking"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

<section id="public-ranking-root" class="list-page-shell public-ranking-shell" data-ranking-slug="$slug" data-page-type="public-ranking" data-page-title="$page_title">
<div class="list-page-head">
<h1 id="public-ranking-title">$page_title</h1>
<p id="public-ranking-description" class="muted"></p>
</div>
<div id="public-ranking-admin" class="list-admin" hidden></div>
<div id="public-ranking-validation" class="list-validation" hidden></div>
<div id="public-ranking-content" class="list-page-content"></div>
</section>

<script src="/static/nostr-publish-dialog.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/public-ranking-page.js"></script>
EORANKING
      ;;
    icon-gallery)
      cat > "$page_file" <<EOICONGALLERY
---
title: "$page_title"
published_at: "$(blog_now_iso)"
content_hash: ""
tags: ["nostr", "list", "icon-gallery"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

<section id="icon-gallery-root" class="list-page-shell icon-gallery-shell" data-list-slug="$slug" data-list-title="$page_title" data-page-type="icon-gallery">
<div class="list-page-head">
<h1 id="list-page-title">$page_title</h1>
<p id="list-page-description" class="muted"></p>
</div>
<div id="list-page-admin" class="list-admin" hidden></div>
<div id="list-page-validation" class="list-validation" hidden></div>
<div id="list-page-content" class="list-page-content"></div>
</section>

<script src="/static/nostr-publish-dialog.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/list-page.js?v=20260326-pagefix5"></script>
EOICONGALLERY
      ;;
    *)
      cat > "$page_file" <<EOLIST
---
title: "$page_title"
published_at: "$(blog_now_iso)"
content_hash: ""
tags: ["nostr", "list"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

<section id="list-page-root" class="list-page-shell" data-list-slug="$slug" data-list-title="$page_title" data-page-type="list">
<div class="list-page-head">
<h1 id="list-page-title">$page_title</h1>
<p id="list-page-description" class="muted"></p>
</div>
<div id="list-page-admin" class="list-admin" hidden></div>
<div id="list-page-validation" class="list-validation" hidden></div>
<div id="list-page-content" class="list-page-content"></div>
</section>

<script src="/static/nostr-publish-dialog.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/list-page.js?v=20260326-pagefix5"></script>
EOLIST
      ;;
  esac

  chmod 644 "$page_file" 2>/dev/null || true
  blog_nostr_page_sync_mount "$slug" "$page_type" >/dev/null 2>&1 || true
}

blog_nostr_pages_sync_source_pages() {
  cfg_json=${1-}
  if [ -z "$cfg_json" ]; then
    cfg_json=$(blog_nostr_pages_load_json)
  fi

  blog_nostr_pages_prune_stale_source_pages "$cfg_json"
  printf '%s\n' "$cfg_json" | jq -c '.pages[]' | while IFS= read -r row || [ -n "$row" ]; do
    [ -n "$row" ] || continue
    slug=$(printf '%s\n' "$row" | jq -r '.slug // ""' 2>/dev/null || printf '')
    page_type=$(printf '%s\n' "$row" | jq -r '.type // "list"' 2>/dev/null || printf 'list')
    [ -n "$slug" ] || continue
    blog_nostr_page_ensure_source_page "$slug" "$page_type" >/dev/null 2>&1 || true
  done
}
