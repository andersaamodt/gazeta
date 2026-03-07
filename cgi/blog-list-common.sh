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
    def entries_from_tags:
      [ .tags[]?
        | select(type=="array" and length>=1 and .[0]=="entry")
        | {
            event_id: (.[1] // "" | tostring),
            relay_hint: (.[2] // "" | tostring),
            marker: (.[3] // "" | tostring),
            date: (.[4] // "" | tostring),
            markdown: (.[5] // "" | tostring)
          }
      ];
    (.entries // entries_from_tags // []) as $entries
    | {
        slug: $slug,
        title: ((.title // first_tag("title") // "List") | tostring),
        description: ((.description // first_tag("description") // "") | tostring),
        group_by: ((.group_by // first_tag("group_by") // "") | tostring),
        content: ((.content // "") | tostring),
        entries: (
          $entries
          | map({
              event_id: (.event_id // .[1] // "" | tostring),
              relay_hint: (.relay_hint // .[2] // "" | tostring),
              marker: (.marker // .[3] // "" | tostring),
              date: (.date // .[4] // "" | tostring),
              markdown: (.markdown // .[5] // "" | tostring)
            })
        )
      }
    | .tags = (
        [
          (if (.title | length) > 0 then ["title", .title] else empty end),
          (if (.description | length) > 0 then ["description", .description] else empty end),
          (if (.group_by | length) > 0 then ["group_by", .group_by] else empty end)
        ] + (.entries | map(["entry", .event_id, .relay_hint, .marker, .date, .markdown]))
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
  normalized=$(printf '%s\n' "$event_json" | jq -c --arg slug "$slug" '{
    slug: $slug,
    title: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="title") | .[1]] | first) // "List"),
    description: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="description") | .[1]] | first) // ""),
    group_by: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="group_by") | .[1]] | first) // ""),
    content: (.content // ""),
    entries: (
      [.tags[]? | select(type=="array" and length>=1 and .[0]=="entry")
      | {
          event_id: (.[1] // "" | tostring),
          relay_hint: (.[2] // "" | tostring),
          marker: (.[3] // "" | tostring),
          date: (.[4] // "" | tostring),
          markdown: (.[5] // "" | tostring)
        }
      ]
    )
  }')
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
    printf '{"entries":[],"errors":["Missing list state"],"warnings":[],"can_publish":false}\n'
    return 0
  fi

  group_by=$(printf '%s\n' "$state_json" | jq -r '.group_by // ""' 2>/dev/null || printf '')
  entries_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-entries.XXXXXX")
  errors_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-errors.XXXXXX")
  warnings_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-warnings.XXXXXX")
  : > "$entries_tmp"
  : > "$errors_tmp"
  : > "$warnings_tmp"

  current_year=""
  seen_years="|"
  idx=0
  printf '%s\n' "$state_json" | jq -c '.entries // [] | .[]' 2>/dev/null | while IFS= read -r entry || [ -n "$entry" ]; do
    event_id=$(printf '%s\n' "$entry" | jq -r '.event_id // ""' 2>/dev/null || printf '')
    relay_hint=$(printf '%s\n' "$entry" | jq -r '.relay_hint // ""' 2>/dev/null || printf '')
    marker=$(printf '%s\n' "$entry" | jq -r '.marker // ""' 2>/dev/null || printf '')
    date_raw=$(printf '%s\n' "$entry" | jq -r '.date // ""' 2>/dev/null || printf '')
    markdown=$(printf '%s\n' "$entry" | jq -r '.markdown // ""' 2>/dev/null || printf '')

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
        printf 'Entry %s is markdown-only and must include DATE when group_by=year\n' "$((idx + 1))" >> "$errors_tmp"
      fi
      if [ -z "$year" ]; then
        printf 'Entry %s has no resolvable year\n' "$((idx + 1))" >> "$warnings_tmp"
      fi
      if [ -n "$year" ] && [ "$year" != "$current_year" ]; then
        case "$seen_years" in
          *"|$year|"*)
            printf 'Entry %s reopens year section %s; year sections must be monotone\n' "$((idx + 1))" "$year" >> "$errors_tmp"
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
      --arg year "$year" \
      --arg post_url "$post_url" \
      --arg post_created_at "$post_created_at" \
      --arg post_oeuvre_date "$post_oeuvre_date" \
      --argjson resolved "$( [ "$resolved" = "true" ] && printf true || printf false )" \
      '{
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
      }' >> "$entries_tmp"
    idx=$((idx + 1))
  done

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

  rm -f "$entries_tmp" "$errors_tmp" "$warnings_tmp"
  jq -cn --argjson entries "$entries_json" --argjson errors "$errors_json" --argjson warnings "$warnings_json" '{
    entries: $entries,
    errors: $errors,
    warnings: $warnings,
    can_publish: (($errors | length) == 0)
  }'
}
