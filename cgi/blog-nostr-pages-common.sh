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

blog_nostr_page_kind_for_type() {
  page_type=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]')
  case "$page_type" in
    contact) printf '0\n' ;;
    *) printf '30001\n' ;;
  esac
}

blog_nostr_pages_default_json() {
  jq -cn '{
    pages: [
      {
        slug: "oeuvre",
        type: "list",
        kind: 30001,
        show_in_nav: true,
        placeholder_title: "Oeuvre",
        path: "/pages/oeuvre.html"
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

  printf '%s\n' "$raw_json" | jq -c '
    def title_from_slug($s):
      (($s // "") | tostring | gsub("-";" ")) as $t
      | if ($t | length) == 0 then "Untitled" else (($t[0:1] | ascii_upcase) + ($t[1:])) end;
    def norm_slug($v):
      (($v // "") | tostring | ascii_downcase
        | gsub("[^a-z0-9-]";"-")
        | gsub("-+";"-")
        | gsub("(^-+|-+$)";""));
    def norm_type($v):
      (if (($v // "") | tostring | ascii_downcase) == "contact" then "contact" else "list" end);

    ((if type=="object" then .pages else . end) // []) as $raw_pages
    | ($raw_pages | if type=="array" then . else [] end
      | map({
          slug: norm_slug(.slug // .list_slug // ""),
          type: norm_type(.type // .page_type // "list"),
          show_in_nav: (if (.show_in_nav // .show_nav // true) == false then false else true end),
          placeholder_title: ((.placeholder_title // .title // "") | tostring),
          path: ((.path // "") | tostring)
        })
      | map(select((.slug | length) > 0))
    ) as $pages
    | (reduce $pages[] as $p ([];
        if any(.[]; .slug == $p.slug) then . else . + [$p] end
      )) as $unique
    | {
        pages:
          (if ($unique | length) == 0 then
             [{
               slug: "oeuvre",
               type: "list",
               kind: 30001,
               show_in_nav: true,
               placeholder_title: "Oeuvre",
               path: "/pages/oeuvre.html"
             }]
           else
             ($unique | map(
               .kind = (if .type == "contact" then 0 else 30001 end)
               | .show_in_nav = (if .show_in_nav == false then false else true end)
               | .placeholder_title = (if (.placeholder_title | length) > 0 then .placeholder_title else title_from_slug(.slug) end)
               | .path = (if (.path | length) > 0 then .path else ("/pages/" + .slug + ".html") end)
             ))
           end)
      }
  ' 2>/dev/null || blog_nostr_pages_default_json
}

blog_nostr_pages_load_json() {
  path=$(blog_nostr_pages_config_path)
  raw=''
  if [ -f "$path" ]; then
    raw=$(cat "$path" 2>/dev/null || printf '')
  fi
  normalized=$(blog_nostr_pages_normalize_json "$raw")
  if [ ! -f "$path" ]; then
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
  if [ "$slug" = "oeuvre" ]; then
    printf 'list\n'
    return 0
  fi
  return 1
}

blog_nostr_page_draft_path() {
  slug=$(blog_nostr_page_slug "${1-}")
  printf '%s/%s.json\n' "$blog_lists_dir" "$slug"
}

blog_nostr_page_load_draft_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  path=$(blog_nostr_page_draft_path "$slug")
  [ -f "$path" ] || return 1
  raw=$(cat "$path" 2>/dev/null || printf '')
  [ -n "$raw" ] || return 1
  case "$page_type" in
    contact) blog_contact_normalize_state_json "$slug" "$raw" ;;
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

  out=$(jq -c --argjson kind "$kind" '
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
  if [ -f "$cache_file" ]; then
    cached=$(sed -n '1p' "$cache_file" 2>/dev/null | tr -d '\r\n[:space:]')
    cached=$(blog_validate_nostr_pubkey "$cached" 2>/dev/null || printf '')
    if [ -n "$cached" ]; then
      printf '%s\n' "$cached"
      return 0
    fi
  fi

  secret=$(blog_nostr_secret_key 2>/dev/null || printf '')
  [ -n "$secret" ] || return 1
  if ! command -v nostril >/dev/null 2>&1; then
    return 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-site-pubkey.XXXXXX")
  set +e
  nostril --sec "$secret" --kind 1 --created-at "$(blog_now_epoch)" --content "" > "$tmp" 2>/dev/null
  sign_status=$?
  set -e
  if [ "$sign_status" -ne 0 ]; then
    rm -f "$tmp"
    return 1
  fi
  pubkey=$(jq -r '.pubkey // ""' "$tmp" 2>/dev/null || printf '')
  rm -f "$tmp"
  pubkey=$(blog_validate_nostr_pubkey "$pubkey" 2>/dev/null || printf '')
  [ -n "$pubkey" ] || return 1
  printf '%s\n' "$pubkey" > "$cache_file"
  chmod 600 "$cache_file" 2>/dev/null || true
  printf '%s\n' "$pubkey"
}

blog_nostr_contact_latest_event_json() {
  site_pubkey=$(blog_nostr_site_pubkey 2>/dev/null || printf '')
  [ -n "$site_pubkey" ] || return 1
  blog_nostr_kind_latest_event_json 0 "$site_pubkey"
}

blog_contact_default_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  title=$(blog_nostr_page_titleize_slug "$slug")
  jq -cn --arg slug "$slug" --arg title "$title" '{
    slug: $slug,
    type: "contact",
    title: $title,
    description: "",
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
    def norm_transport($v): (($v // "") | tostring | ascii_downcase | gsub("[^a-z0-9]+";""));
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
        {
          title: .title,
          description: .description
        }
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
    description: (.description // ""),
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
          transport: ((.transport // "") | tostring | ascii_downcase | gsub("[^a-z0-9]+";"")),
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
          {
            title: ((.title // "") | tostring),
            description: ((.description // "") | tostring)
          }
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

blog_nostr_page_ensure_source_page() {
  slug=$(blog_nostr_page_slug "${1-}")
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  [ -n "$slug" ] || return 1
  page_file="$blog_site_root/site/pages/$slug.md"
  if [ -f "$page_file" ]; then
    return 0
  fi

  page_title=$(blog_nostr_page_titleize_slug "$slug")

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

<script src="/static/contact-page.js"></script>
EOCONTACT
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

<section id="oeuvre-root" class="list-page-shell" data-list-slug="$slug" data-list-title="$page_title">
<div class="list-page-head">
<h1 id="list-page-title">$page_title</h1>
<p id="list-page-description" class="muted"></p>
</div>
<div id="list-page-admin" class="list-admin" hidden></div>
<div id="list-page-validation" class="list-validation" hidden></div>
<div id="list-page-content" class="list-page-content"></div>
</section>

<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/oeuvre.js"></script>
EOLIST
      ;;
  esac

  chmod 644 "$page_file" 2>/dev/null || true
}
