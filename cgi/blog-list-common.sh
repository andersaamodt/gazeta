#!/bin/sh
# Shared helpers for Nostr-backed list pages.

set -eu

blog_list_default_state_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  title=$(printf '%s' "$slug" | sed 's/-/ /g')
  if [ -n "$title" ]; then
    first=$(printf '%s' "$title" | cut -c1 | tr '[:lower:]' '[:upper:]')
    rest=$(printf '%s' "$title" | cut -c2-)
    title="${first}${rest}"
  else
    title="List"
  fi
  jq -cn --arg slug "$slug" --arg title "$title" '{
    slug: $slug,
    title: $title,
    description: "",
    publish_intro_to_nostr: false,
    group_by: "year",
    view_mode: "list",
    content: "",
    extras_before: "",
    extras_before_format: "markdown",
    extras_after: "",
    extras_after_format: "markdown",
    elements: [],
    entries: [],
    tags: [["title", $title], ["group_by", "year"], ["view_mode", "list"]]
  }'
}

blog_list_normalize_state_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  raw_json=${2-}
  if [ -z "$raw_json" ]; then
    blog_list_default_state_json "$slug"
    return 0
  fi
  if ! printf '%s\n' "$raw_json" | jq -e 'type=="object"' >/dev/null 2>&1; then
    blog_list_default_state_json "$slug"
    return 0
  fi
  printf '%s\n' "$raw_json" | jq -c --arg slug "$slug" '
    def first_tag($k): ([.tags[]? | select(type=="array" and length>=2 and .[0]==$k) | .[1]] | first);
    def norm_extra_format($v):
      (($v // "") | tostring | ascii_downcase) as $f
      | if $f == "html" then "html" else "markdown" end;
    def norm_view_mode($v):
      (($v // "") | tostring | ascii_downcase) as $mode
      | if $mode == "tile" then "tile" else "list" end;
    def flex($obj; $idx; $key):
      if ($obj | type) == "array" then ($obj[$idx] // "") else ($obj[$key] // "") end;
    def flex_markdown($obj):
      if ($obj | type) == "array" then
        (($obj[6] // $obj[5] // "") | tostring)
      else
        (($obj.markdown // "") | tostring)
      end;
    def flex_image_url($obj):
      if ($obj | type) == "array" then
        (($obj[7] // "") | tostring)
      else
        (($obj.image_url // "") | tostring)
      end;
    def flex_depth($obj):
      if ($obj | type) == "array" then
        ($obj[5] // 0)
      else
        ($obj.depth // 0)
      end;
    def parse_depth_markdown:
      if type == "array" then
        (.[5] // "") as $f5
        | (.[6] // "") as $f6
        | if ($f6 | tostring | length) > 0 then
            { depth: $f5, markdown: $f6 }
          else
            if (($f5 | tostring) | test("^[0-9]+$")) then
              { depth: $f5, markdown: "" }
            else
              { depth: 0, markdown: $f5 }
            end
          end
      else
        { depth: (.depth // 0), markdown: (.markdown // "") }
      end;
    def entry_like_from($t):
      (parse_depth_markdown) as $dm
      | ($dm.depth | tonumber? // 0) as $depth
      |
      {
        type: $t,
        event_id: (flex(.; 1; "event_id") | tostring),
        relay_hint: (flex(.; 2; "relay_hint") | tostring),
        marker: (flex(.; 3; "marker") | tostring),
        date: (flex(.; 4; "date") | tostring),
        depth: (if $depth < 0 then 0 else $depth end),
        markdown: ($dm.markdown | tostring),
        image_url: (flex_image_url(.))
      };
    def elements_from_tags:
      [ .tags[]?
        | select(type=="array" and length>=1)
        | if .[0] == "entry" then
            entry_like_from("entry")
          elif .[0] == "subentry" then
            (entry_like_from("entry") | .depth = 1)
          else empty end
      ];
    def elements_from_entries:
      [ .entries[]?
        | {
            type: "entry",
            event_id: (flex(.; 1; "event_id") | tostring),
            relay_hint: (flex(.; 2; "relay_hint") | tostring),
            marker: (flex(.; 3; "marker") | tostring),
            date: (flex(.; 4; "date") | tostring),
            depth: (flex_depth(.) | tonumber? // 0),
            markdown: (flex_markdown(.))
          }
      ];
    (
      if (.elements | type) == "array" then
        .elements
      elif (.entries | type) == "array" then
        elements_from_entries
      else
        elements_from_tags
      end
    ) as $raw_elements
    | ($raw_elements | map({
        type: "entry",
        event_id: (flex(.; 1; "event_id") | tostring),
        relay_hint: (flex(.; 2; "relay_hint") | tostring),
        marker: (flex(.; 3; "marker") | tostring),
        date: (flex(.; 4; "date") | tostring),
        depth: ((if (.type == "subentry" or .type == "sub") then 1 else (.depth // 0) end) | tonumber? // 0),
        markdown: (flex_markdown(.)),
        image_url: (flex_image_url(.))
      })) as $elements
    | {
        slug: $slug,
        title: ((.title // first_tag("title") // "List") | tostring),
        description: ((.description // first_tag("description") // "") | tostring),
        publish_intro_to_nostr: (
          if (.publish_intro_to_nostr // null) == null then
            ((first_tag("description") // "") | tostring | length) > 0
          else
            ((.publish_intro_to_nostr == true) or ((.publish_intro_to_nostr | tostring | ascii_downcase) == "true"))
          end
        ),
        group_by: ((.group_by // first_tag("group_by") // "") | tostring),
        view_mode: norm_view_mode(.view_mode // first_tag("view_mode") // "list"),
        content: ((.content // "") | tostring),
        extras_before: ((.extras_before // (if ((.extras // null) | type) == "object" then .extras.before else empty end) // "") | tostring),
        extras_before_format: norm_extra_format(.extras_before_format // (if ((.extras // null) | type) == "object" then (.extras.before_format // .extras.before_type) else empty end) // "markdown"),
        extras_after: ((.extras_after // (if ((.extras // null) | type) == "object" then .extras.after else empty end) // "") | tostring),
        extras_after_format: norm_extra_format(.extras_after_format // (if ((.extras // null) | type) == "object" then (.extras.after_format // .extras.after_type) else empty end) // "markdown"),
        elements: $elements,
        entries: $elements
      }
    | .tags = (
        [
          (if (.title | length) > 0 then ["title", .title] else empty end),
          (if .publish_intro_to_nostr and (.description | length) > 0 then ["description", .description] else empty end),
          (if (.group_by | length) > 0 then ["group_by", .group_by] else empty end),
          (if (.view_mode // "list") != "list" then ["view_mode", .view_mode] else empty end)
        ]
        + (.elements | map(
            ["entry", (.event_id // ""), (.relay_hint // ""), (.marker // ""), (.date // ""), ((.depth // 0) | tostring), (.markdown // ""), (.image_url // "")]
          ))
      )
  '
}

blog_list_state_signature_json() {
  state_json=${1-}
  if [ -z "$state_json" ]; then
    printf '{}\n'
    return 0
  fi
  printf '%s\n' "$state_json" | jq -c '{
    title: (.title // ""),
    description: (if (.publish_intro_to_nostr // false) then (.description // "") else "" end),
    publish_intro_to_nostr: (.publish_intro_to_nostr // false),
    group_by: (.group_by // ""),
    view_mode: (.view_mode // "list"),
    content: (.content // ""),
    elements: (.elements // []),
    entries: (.entries // [])
  }' 2>/dev/null || printf '{}\n'
}

blog_list_state_from_event_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  event_json=${2-}
  if [ -z "$event_json" ]; then
    blog_list_default_state_json "$slug"
    return 0
  fi
  if ! printf '%s\n' "$event_json" | jq -e 'type=="object"' >/dev/null 2>&1; then
    blog_list_default_state_json "$slug"
    return 0
  fi
  normalized=$(printf '%s\n' "$event_json" | jq -c --arg slug "$slug" '{ slug: $slug, content: (.content // ""), tags: (.tags // []) }')
  blog_list_normalize_state_json "$slug" "$normalized"
}

blog_list_load_canonical_state_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  event_json=$(blog_nostr_list_latest_event_json "$slug" 2>/dev/null || printf '')
  if [ -z "$event_json" ]; then
    blog_list_default_state_json "$slug"
    return 0
  fi
  blog_list_state_from_event_json "$slug" "$event_json"
}

blog_list_load_draft_state_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  path=$(blog_list_draft_path "$slug")
  if [ ! -f "$path" ]; then
    return 1
  fi
  raw=$(cat "$path" 2>/dev/null || printf '')
  [ -n "$raw" ] || return 1
  blog_list_normalize_state_json "$slug" "$raw"
}

blog_list_save_draft_state_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  state_json=${2-}
  [ -n "$state_json" ] || return 1
  path=$(blog_list_draft_path "$slug")
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-draft.XXXXXX")
  printf '%s\n' "$state_json" > "$tmp"
  mv "$tmp" "$path"
  chmod 644 "$path" 2>/dev/null || true
}

blog_list_year_from_created_at() {
  raw=${1-}
  if printf '%s' "$raw" | grep -Eq '^[0-9]{4}-'; then
    printf '%s\n' "$(printf '%s' "$raw" | cut -c1-4)"
    return 0
  fi
  if printf '%s' "$raw" | grep -Eq '^[0-9]{10}$|^[0-9]{1,9}$'; then
    if date -u -d "@$raw" +%Y >/dev/null 2>&1; then
      date -u -d "@$raw" +%Y
      return 0
    fi
    if date -u -r "$raw" +%Y >/dev/null 2>&1; then
      date -u -r "$raw" +%Y
      return 0
    fi
  fi
  printf '\n'
}

blog_list_validate_and_enrich_state_json() {
  state_json=${1-}
  strict_publish=${2-false}
  if [ -z "$state_json" ]; then
    printf '{"elements":[],"entries":[],"errors":["Missing list state"],"warnings":[],"can_publish":false}\n'
    return 0
  fi

  group_by=$(printf '%s\n' "$state_json" | jq -r '.group_by // ""' 2>/dev/null || printf '')
  elements_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-elements.XXXXXX")
  entries_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-entries.XXXXXX")
  errors_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-errors.XXXXXX")
  warnings_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-warnings.XXXXXX")
  : > "$elements_tmp"
  : > "$entries_tmp"
  : > "$errors_tmp"
  : > "$warnings_tmp"

  current_year=""
  seen_years="|"
  prev_depth=-1
  idx=0
  printf '%s\n' "$state_json" | jq -c '(.elements // ((.entries // []) | map(. + {type:"entry"})) // []) | .[]' 2>/dev/null | while IFS= read -r element || [ -n "$element" ]; do
    element_type="entry"
    depth_raw=$(printf '%s\n' "$element" | jq -r '
      if (.type // "") == "subentry" or (.type // "") == "sub" then
        1
      else
        (.depth // 0)
      end
    ' 2>/dev/null || printf '0')
    if ! printf '%s' "$depth_raw" | grep -Eq '^[0-9]+$'; then
      printf 'Entry %s has invalid DEPTH: %s\n' "$((idx + 1))" "$depth_raw" >> "$errors_tmp"
      depth_int=0
    else
      depth_int=$depth_raw
    fi
    if [ "$depth_int" -lt 0 ]; then
      printf 'Entry %s has invalid DEPTH: %s\n' "$((idx + 1))" "$depth_int" >> "$errors_tmp"
      depth_int=0
    fi
    if [ "$idx" -eq 0 ] && [ "$depth_int" -gt 0 ]; then
      printf 'Entry %s has DEPTH %s before any root entry\n' "$((idx + 1))" "$depth_int" >> "$errors_tmp"
    fi
    if [ "$idx" -gt 0 ] && [ "$depth_int" -gt $((prev_depth + 1)) ]; then
      printf 'Entry %s has DEPTH %s but previous depth is %s (cannot skip levels)\n' "$((idx + 1))" "$depth_int" "$prev_depth" >> "$errors_tmp"
    fi
    prev_depth=$depth_int

    event_id=$(printf '%s\n' "$element" | jq -r '.event_id // ""' 2>/dev/null || printf '')
    relay_hint=$(printf '%s\n' "$element" | jq -r '.relay_hint // ""' 2>/dev/null || printf '')
    marker=$(printf '%s\n' "$element" | jq -r '.marker // ""' 2>/dev/null || printf '')
    date_raw=$(printf '%s\n' "$element" | jq -r '.date // ""' 2>/dev/null || printf '')
    markdown=$(printf '%s\n' "$element" | jq -r '.markdown // .[6] // .[5] // ""' 2>/dev/null || printf '')
    image_url=$(printf '%s\n' "$element" | jq -r '.image_url // .[7] // ""' 2>/dev/null || printf '')

    resolved=false
    post_url=""
    post_created_at=""
    post_oeuvre_date=""

    if [ -n "$relay_hint" ] && ! printf '%s' "$relay_hint" | grep -Eq '^wss://'; then
      printf 'Entry %s has a relay hint that does not start with wss://\n' "$((idx + 1))" >> "$warnings_tmp"
    fi

    if [ -n "$event_id" ]; then
      record=$(blog_nostr_post_record_for_event_id "$event_id" 2>/dev/null || printf '')
      if [ -n "$record" ]; then
        resolved=true
        md_path=$(printf '%s\n' "$record" | jq -r '.md_path // ""' 2>/dev/null || printf '')
        post_created_at=$(printf '%s\n' "$record" | jq -r '.created_at // ""' 2>/dev/null || printf '')
        if [ -n "$md_path" ]; then
          file="$blog_site_root/site/pages/$md_path"
          if [ -f "$file" ]; then
            post_oeuvre_date=$(blog_read_front_matter_value "$file" oeuvre_date 2>/dev/null || printf '')
            post_url=$(blog_rel_post_html_url "$file")
          fi
        fi
      else
        if [ "$strict_publish" = "true" ]; then
          printf 'Entry %s references EVENT_ID %s, but it could not be resolved\n' "$((idx + 1))" "$event_id" >> "$errors_tmp"
        else
          printf 'Entry %s references EVENT_ID %s, but it could not be resolved\n' "$((idx + 1))" "$event_id" >> "$warnings_tmp"
        fi
      fi
    fi

    year=""
    if [ -n "$date_raw" ]; then
      if ! printf '%s' "$date_raw" | grep -Eq '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'; then
        printf 'Entry %s has invalid DATE format: %s\n' "$((idx + 1))" "$date_raw" >> "$errors_tmp"
      fi
      if printf '%s' "$date_raw" | grep -Eq '^[0-9]{4}'; then
        year=$(printf '%s' "$date_raw" | cut -c1-4)
      fi
    fi
    if [ -z "$year" ] && [ -n "$post_oeuvre_date" ] && printf '%s' "$post_oeuvre_date" | grep -Eq '^[0-9]{4}'; then
      year=$(printf '%s' "$post_oeuvre_date" | cut -c1-4)
    fi
    if [ -z "$year" ] && [ -n "$post_created_at" ]; then
      year=$(blog_list_year_from_created_at "$post_created_at")
    fi

    if [ "$group_by" = "year" ]; then
      if [ -z "$event_id" ] && [ -z "$date_raw" ]; then
        printf '%s %s is markdown-only and must include DATE when group_by=year\n' "$(printf '%s' "$element_type" | tr '[:lower:]' '[:upper:]')" "$((idx + 1))" >> "$errors_tmp"
      fi
      if [ -z "$year" ]; then
        printf '%s %s has no resolvable year\n' "$(printf '%s' "$element_type" | tr '[:lower:]' '[:upper:]')" "$((idx + 1))" >> "$warnings_tmp"
      fi
      if [ -n "$year" ] && [ "$year" != "$current_year" ]; then
        case "$seen_years" in
          *"|$year|"*)
            printf '%s %s reopens year section %s; year sections must be monotone\n' "$(printf '%s' "$element_type" | tr '[:lower:]' '[:upper:]')" "$((idx + 1))" "$year" >> "$errors_tmp"
            ;;
          *)
            seen_years="${seen_years}${year}|"
            current_year="$year"
            ;;
        esac
      fi
    fi

    jq -cn \
      --arg event_id "$event_id" \
      --arg relay_hint "$relay_hint" \
      --arg marker "$marker" \
      --arg date "$date_raw" \
      --arg markdown "$markdown" \
      --arg image_url "$image_url" \
      --arg type "$element_type" \
      --argjson depth "$depth_int" \
      --arg year "$year" \
      --arg post_url "$post_url" \
      --arg post_created_at "$post_created_at" \
      --arg post_oeuvre_date "$post_oeuvre_date" \
      --argjson resolved "$( [ "$resolved" = "true" ] && printf true || printf false )" \
      '{
        type: $type,
        event_id: $event_id,
        relay_hint: $relay_hint,
        marker: $marker,
        date: $date,
        depth: $depth,
        markdown: $markdown,
        image_url: $image_url,
        year: $year,
        resolved: $resolved,
        post_url: $post_url,
        post_created_at: $post_created_at,
        post_oeuvre_date: $post_oeuvre_date
      }' | tee -a "$elements_tmp" >> "$entries_tmp"
    idx=$((idx + 1))
  done

  elements_json='[]'
  if [ -s "$elements_tmp" ]; then
    elements_json=$(jq -s '.' "$elements_tmp" 2>/dev/null || printf '[]')
  fi
  entries_json='[]'
  if [ -s "$entries_tmp" ]; then
    entries_json=$(jq -s '.' "$entries_tmp" 2>/dev/null || printf '[]')
  fi
  errors_json='[]'
  if [ -s "$errors_tmp" ]; then
    errors_json=$(awk 'NF' "$errors_tmp" | jq -R . | jq -s '.' 2>/dev/null || printf '[]')
  fi
  warnings_json='[]'
  if [ -s "$warnings_tmp" ]; then
    warnings_json=$(awk 'NF' "$warnings_tmp" | jq -R . | jq -s '.' 2>/dev/null || printf '[]')
  fi

  rm -f "$elements_tmp" "$entries_tmp" "$errors_tmp" "$warnings_tmp"
  jq -cn --argjson elements "$elements_json" --argjson entries "$entries_json" --argjson errors "$errors_json" --argjson warnings "$warnings_json" '{
    elements: $elements,
    entries: $entries,
    errors: $errors,
    warnings: $warnings,
    can_publish: (($errors | length) == 0)
  }'
}
