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
    group_by: "year",
    content: "",
    elements: [],
    entries: [],
    tags: [["title", $title], ["group_by", "year"]]
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
    def flex($obj; $idx; $key):
      if ($obj | type) == "array" then ($obj[$idx] // "") else ($obj[$key] // "") end;
    def entry_like_from($t):
      {
        type: $t,
        event_id: (flex(.; 1; "event_id") | tostring),
        relay_hint: (flex(.; 2; "relay_hint") | tostring),
        marker: (flex(.; 3; "marker") | tostring),
        date: (flex(.; 4; "date") | tostring),
        markdown: (flex(.; 5; "markdown") | tostring)
      };
    def elements_from_tags:
      [ .tags[]?
        | select(type=="array" and length>=1)
        | if .[0] == "group" then
            { type: "group", title: (.[1] // "" | tostring) }
          elif .[0] == "entry" then
            entry_like_from("entry")
          elif .[0] == "sub" then
            entry_like_from("sub")
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
            markdown: (flex(.; 5; "markdown") | tostring)
          }
      ];
    ((.elements // elements_from_entries // elements_from_tags // [])) as $raw_elements
    | ($raw_elements | map(
        if (.type == "group") then
          { type: "group", title: (flex(.; 1; "title") | tostring) }
        else
          {
            type: (if (.type == "sub") then "sub" else "entry" end),
            event_id: (flex(.; 1; "event_id") | tostring),
            relay_hint: (flex(.; 2; "relay_hint") | tostring),
            marker: (flex(.; 3; "marker") | tostring),
            date: (flex(.; 4; "date") | tostring),
            markdown: (flex(.; 5; "markdown") | tostring)
          }
        end
      )) as $elements
    | {
        slug: $slug,
        title: ((.title // first_tag("title") // "List") | tostring),
        description: ((.description // first_tag("description") // "") | tostring),
        group_by: ((.group_by // first_tag("group_by") // "") | tostring),
        content: ((.content // "") | tostring),
        elements: $elements,
        entries: ($elements | map(select(.type != "group")))
      }
    | .tags = (
        [
          (if (.title | length) > 0 then ["title", .title] else empty end),
          (if (.description | length) > 0 then ["description", .description] else empty end),
          (if (.group_by | length) > 0 then ["group_by", .group_by] else empty end)
        ]
        + (.elements | map(
            if .type == "group" then
              ["group", (.title // "")]
            elif .type == "sub" then
              ["sub", (.event_id // ""), (.relay_hint // ""), (.marker // ""), (.date // ""), (.markdown // "")]
            else
              ["entry", (.event_id // ""), (.relay_hint // ""), (.marker // ""), (.date // ""), (.markdown // "")]
            end
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
    description: (.description // ""),
    group_by: (.group_by // ""),
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
  active_group=""
  have_group=false
  idx=0
  printf '%s\n' "$state_json" | jq -c '(.elements // ((.entries // []) | map(. + {type:"entry"})) // []) | .[]' 2>/dev/null | while IFS= read -r element || [ -n "$element" ]; do
    element_type=$(printf '%s\n' "$element" | jq -r '.type // "entry"' 2>/dev/null || printf 'entry')
    if [ "$element_type" = "group" ]; then
      title=$(printf '%s\n' "$element" | jq -r '.title // ""' 2>/dev/null || printf '')
      if [ -n "$active_group" ]; then
        printf 'Group %s appears before closing previous group "%s"\n' "$((idx + 1))" "$active_group" >> "$errors_tmp"
      fi
      active_group="$title"
      have_group=true
      jq -cn --arg type "group" --arg title "$title" '{type:$type,title:$title}' >> "$elements_tmp"
      idx=$((idx + 1))
      continue
    fi

    if [ "$element_type" != "entry" ] && [ "$element_type" != "sub" ]; then
      element_type="entry"
    fi

    event_id=$(printf '%s\n' "$element" | jq -r '.event_id // ""' 2>/dev/null || printf '')
    relay_hint=$(printf '%s\n' "$element" | jq -r '.relay_hint // ""' 2>/dev/null || printf '')
    marker=$(printf '%s\n' "$element" | jq -r '.marker // ""' 2>/dev/null || printf '')
    date_raw=$(printf '%s\n' "$element" | jq -r '.date // ""' 2>/dev/null || printf '')
    markdown=$(printf '%s\n' "$element" | jq -r '.markdown // ""' 2>/dev/null || printf '')

    if [ "$element_type" = "sub" ]; then
      if [ "$have_group" != "true" ] || [ -z "$active_group" ]; then
        printf 'Sub entry %s appears before any group\n' "$((idx + 1))" >> "$errors_tmp"
      fi
    else
      active_group=""
    fi

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
      --arg type "$element_type" \
      --arg group_title "$active_group" \
      --arg year "$year" \
      --arg post_url "$post_url" \
      --arg post_created_at "$post_created_at" \
      --arg post_oeuvre_date "$post_oeuvre_date" \
      --argjson resolved "$( [ "$resolved" = "true" ] && printf true || printf false )" \
      '{
        type: $type,
        group_title: $group_title,
        event_id: $event_id,
        relay_hint: $relay_hint,
        marker: $marker,
        date: $date,
        markdown: $markdown,
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
