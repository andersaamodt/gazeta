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
    show_marker_filters: false,
    show_markers: false,
    alphabetize_markers: false,
    default_markers: "",
    allow_signed_in_submissions: false,
    allow_signed_in_votes: false,
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
    def norm_marker_list($v):
      (($v // "") | tostring
        | split(",")
        | map(gsub("\\s+"; " ") | gsub("^\\s+|\\s+$"; "") | select(length > 0))
      ) as $tokens
      | reduce $tokens[] as $token ([]; if index($token) then . else . + [$token] end)
      | join(", ");
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
    def flex_description($obj):
      if ($obj | type) == "array" then
        (($obj[8] // "") | tostring)
      else
        (($obj.description // "") | tostring)
      end;
    def flex_post_url($obj):
      if ($obj | type) == "array" then
        (($obj[9] // "") | tostring)
      else
        (($obj.post_url // "") | tostring)
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
        marker: norm_marker_list(flex(.; 3; "marker")),
        date: (flex(.; 4; "date") | tostring),
        depth: (if $depth < 0 then 0 else $depth end),
        markdown: ($dm.markdown | tostring),
        image_url: (flex_image_url(.)),
        description: (flex_description(.)),
        post_url: (flex_post_url(.))
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
            marker: norm_marker_list(flex(.; 3; "marker")),
            date: (flex(.; 4; "date") | tostring),
            depth: (flex_depth(.) | tonumber? // 0),
            markdown: (flex_markdown(.)),
            image_url: (flex_image_url(.)),
            description: (flex_description(.)),
            post_url: (flex_post_url(.))
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
        marker: norm_marker_list(flex(.; 3; "marker")),
        date: (flex(.; 4; "date") | tostring),
        depth: ((if (.type == "subentry" or .type == "sub") then 1 else (.depth // 0) end) | tonumber? // 0),
        markdown: (flex_markdown(.)),
        image_url: (flex_image_url(.)),
        description: (flex_description(.)),
        post_url: (flex_post_url(.))
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
        show_marker_filters: (
          if (.show_marker_filters // null) == null then
            ((first_tag("show_marker_filters") // "") | tostring | ascii_downcase) == "true"
          else
            ((.show_marker_filters == true) or ((.show_marker_filters | tostring | ascii_downcase) == "true"))
          end
        ),
        show_markers: (
          if (.show_markers // null) == null then
            ((first_tag("show_markers") // "") | tostring | ascii_downcase) == "true"
          else
            ((.show_markers == true) or ((.show_markers | tostring | ascii_downcase) == "true"))
          end
        ),
        alphabetize_markers: (
          if (.alphabetize_markers // null) == null then
            ((first_tag("alphabetize_markers") // "") | tostring | ascii_downcase) == "true"
          else
            ((.alphabetize_markers == true) or ((.alphabetize_markers | tostring | ascii_downcase) == "true"))
          end
        ),
        default_markers: (
          norm_marker_list(
            if (.default_markers // null) == null then
              (first_tag("default_markers") // "")
            else
              (.default_markers // "")
            end
          )
        ),
        allow_signed_in_submissions: (
          if (.allow_signed_in_submissions // null) == null then
            ((first_tag("allow_signed_in_submissions") // first_tag("signed_in_submissions") // "") | tostring | ascii_downcase) == "true"
          else
            ((.allow_signed_in_submissions == true) or ((.allow_signed_in_submissions | tostring | ascii_downcase) == "true"))
          end
        ),
        allow_signed_in_votes: (
          if (.allow_signed_in_votes // null) == null then
            ((first_tag("allow_signed_in_votes") // first_tag("signed_in_votes") // "") | tostring | ascii_downcase) == "true"
          else
            ((.allow_signed_in_votes == true) or ((.allow_signed_in_votes | tostring | ascii_downcase) == "true"))
          end
        ),
        group_by: ((.group_by // first_tag("group_by") // "") | tostring),
        view_mode: norm_view_mode(.view_mode // first_tag("view_mode") // "list"),
        content: ((.content // "") | tostring),
        extras_before: ((.extras_before // (if ((.extras // null) | type) == "object" then .extras.before else empty end) // "") | tostring),
        extras_before_format: norm_extra_format(.extras_before_format // (if ((.extras // null) | type) == "object" then (.extras.before_format // .extras.before_type) else empty end) // "markdown"),
        extras_after: ((.extras_after // (if ((.extras // null) | type) == "object" then .extras.after else empty end) // "") | tostring),
        extras_after_format: "markdown",
        elements: $elements,
        entries: $elements
      }
    | .tags = (
        [
          (if (.title | length) > 0 then ["title", .title] else empty end),
          (if .publish_intro_to_nostr and (.description | length) > 0 then ["description", .description] else empty end),
          (if .show_marker_filters then ["show_marker_filters", "true"] else empty end),
          (if .show_markers then ["show_markers", "true"] else empty end),
          (if .alphabetize_markers then ["alphabetize_markers", "true"] else empty end),
          (if (.default_markers | length) > 0 then ["default_markers", .default_markers] else empty end),
          (if .allow_signed_in_submissions then ["allow_signed_in_submissions", "true"] else empty end),
          (if .allow_signed_in_votes then ["allow_signed_in_votes", "true"] else empty end),
          (if (.group_by | length) > 0 then ["group_by", .group_by] else empty end),
          (if (.view_mode // "list") != "list" then ["view_mode", .view_mode] else empty end)
        ]
        + (.elements | map(
            ["entry", (.event_id // ""), (.relay_hint // ""), (.marker // ""), (.date // ""), ((.depth // 0) | tostring), (.markdown // ""), (.image_url // ""), (.description // ""), (.post_url // "")]
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
    show_marker_filters: (.show_marker_filters // false),
    show_markers: (.show_markers // false),
    alphabetize_markers: (.alphabetize_markers // false),
    default_markers: (.default_markers // ""),
    allow_signed_in_submissions: (.allow_signed_in_submissions // false),
    allow_signed_in_votes: (.allow_signed_in_votes // false),
    group_by: (.group_by // ""),
    view_mode: (.view_mode // "list"),
    content: (.content // ""),
    elements: (.elements // []),
    entries: (.entries // [])
  }' 2>/dev/null || printf '{}\n'
}

blog_list_oeuvre_protected_content_messages_json() {
  state_json=${1-}
  [ -n "$state_json" ] || state_json='{}'
  printf '%s\n' "$state_json" | jq -c '
    def field($e; $idx; $key):
      if ($e | type) == "array" then (($e[$idx] // "") | tostring)
      else (($e[$key] // "") | tostring)
      end;
    def entry_markdown($e):
      if ($e | type) == "array" then (($e[6] // $e[5] // "") | tostring)
      else (($e.markdown // "") | tostring)
      end;
    def entry_date($e): field($e; 4; "date");
    def entry_event_id($e): field($e; 1; "event_id");
    def entry_post_url($e): field($e; 9; "post_url");
    def has_markdown_link($s): ($s | test("\\[[^]]+\\]\\([^)]+\\)"));
    def protected_recent($e):
      (entry_date($e) | test("^202[4-6]"))
      and ((entry_markdown($e)) != "Doing Nothing on Purpose (Semanthesis essay)");
    def has_public_link($e):
      (has_markdown_link(entry_markdown($e)))
      or ((entry_post_url($e) | length) > 0)
      or ((entry_event_id($e) | length) > 0);
    def display_label($s):
      ($s | gsub("\\[[^]]+\\]\\(([^)]+)\\)"; "") | gsub("[*_`]"; "") | gsub("\\s+"; " ") | gsub("^\\s+|\\s+$"; "")) as $clean
      | if ($clean | length) > 0 then $clean else "(blank)" end;
    (.slug // "") as $slug
    | if $slug != "oeuvre" then []
      else
        ((.elements // .entries // []) | to_entries | map(
          .key as $i
          | .value as $entry
          | (entry_markdown($entry)) as $markdown
          | (entry_post_url($entry)) as $post_url
          | [
              (if protected_recent($entry) and (has_public_link($entry) | not) then
                "Oeuvre entry " + (($i + 1) | tostring) + " (" + (display_label($markdown)) + ") is protected 2024-2026 content and must keep a markdown link, POST_URL, or EVENT_ID."
              else empty end),
              (if (($markdown + " " + $post_url) | contains("new.andersaamodt.com")) then
                "Oeuvre entry " + (($i + 1) | tostring) + " points to new.andersaamodt.com; use andersaamodt.com."
              else empty end)
            ]
        ) | add // [])
      end
  ' 2>/dev/null || printf '[]\n'
}

blog_list_public_entries_path() {
  slug=$(blog_list_normalize_slug "${1-}")
  [ -n "$slug" ] || return 1
  dir="$blog_site_data/list-public-entries"
  mkdir -p "$dir"
  printf '%s/%s.jsonl\n' "$dir" "$slug"
}

blog_list_public_votes_path() {
  slug=$(blog_list_normalize_slug "${1-}")
  [ -n "$slug" ] || return 1
  dir="$blog_site_data/list-public-votes"
  mkdir -p "$dir"
  printf '%s/%s.jsonl\n' "$dir" "$slug"
}

blog_list_public_entries_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  path=$(blog_list_public_entries_path "$slug")
  if [ ! -s "$path" ]; then
    printf '[]\n'
    return 0
  fi
  jq -s '[.[] | select(type=="object" and ((.id // "") | length > 0) and ((.markdown // "") | length > 0))]' "$path" 2>/dev/null || printf '[]\n'
}

blog_list_public_votes_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  path=$(blog_list_public_votes_path "$slug")
  nostr_votes_json=$(blog_list_nostr_vote_events_json "$slug" 2>/dev/null || printf '[]')
  if [ ! -s "$path" ]; then
    printf '%s\n' "$nostr_votes_json"
    return 0
  fi
  local_votes_json=$(jq -s '[.[] | select(type=="object" and ((.entry_id // "") | length > 0) and ((.voter // "") | length > 0) and (((.value // 0) == 1) or ((.value // 0) == -1) or ((.value // 0) == 0)))]' "$path" 2>/dev/null || printf '[]')
  jq -cn --argjson local_votes "$local_votes_json" --argjson nostr_votes "$nostr_votes_json" '
    ($local_votes + $nostr_votes)
    | map(. + {
        _dedupe_key: (
          if ((.event_id // "") | length) > 0 then (.event_id // "")
          else ("local:" + ((.entry_id // "")|tostring) + ":" + ((.voter // "")|tostring) + ":" + ((.created_at // 0)|tostring) + ":" + ((.value // 0)|tostring))
          end
        )
      })
    | sort_by(._dedupe_key, (.created_at // 0))
    | group_by(._dedupe_key)
    | map(last | del(._dedupe_key))
  ' 2>/dev/null || printf '[]\n'
}

blog_list_vote_cooldown_seconds() {
  printf '64800\n'
}

blog_list_vote_context_for_slug() {
  slug=$(blog_list_normalize_slug "${1-}")
  page_type='list'
  if command -v blog_nostr_page_type_for_slug >/dev/null 2>&1; then
    page_type=$(blog_nostr_page_type_for_slug "$slug" 2>/dev/null || printf 'list')
  fi
  if command -v blog_nostr_page_kind_for_type >/dev/null 2>&1; then
    kind=$(blog_nostr_page_kind_for_type "$page_type" 2>/dev/null || printf '30004')
  else
    case "$page_type" in
      software-gallery) kind=30267 ;;
      *) kind=30004 ;;
    esac
  fi
  pubkey=$(blog_nostr_site_pubkey 2>/dev/null || printf '')
  if [ -n "$pubkey" ]; then
    printf '%s:%s:%s\n' "$kind" "$pubkey" "$slug"
  else
    printf '%s::%s\n' "$kind" "$slug"
  fi
}

blog_list_vote_epoch_for_created_at() {
  created_at=${1-}
  cooldown=$(blog_list_vote_cooldown_seconds)
  case "$created_at" in
    ''|*[!0-9]*) created_at=0 ;;
  esac
  printf '%s\n' $(( (created_at / cooldown) * cooldown ))
}

blog_list_nostr_vote_events_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  [ -d "$blog_nostr_events_dir" ] || {
    printf '[]\n'
    return 0
  }
  context=$(blog_list_vote_context_for_slug "$slug" 2>/dev/null || printf '')
  [ -n "$context" ] || {
    printf '[]\n'
    return 0
  }
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-vote-events.XXXXXX")
  find "$blog_nostr_events_dir" -type f \( -path '*/7/*.json' -o -path '*/17/*.json' \) 2>/dev/null | while IFS= read -r file; do
    [ -f "$file" ] || continue
    jq -c '.' "$file" 2>/dev/null || true
  done > "$tmp"
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    printf '[]\n'
    return 0
  fi
  jq -cs --arg context "$context" --argjson cooldown "$(blog_list_vote_cooldown_seconds)" '
    def tagv($k): ([.tags[]? | select(type=="array" and length>=2 and .[0]==$k) | .[1]] | first // "");
    def vote_value:
      ((.content // "") | tostring | gsub("^\\s+|\\s+$"; "")) as $c
      | if $c == "+" then 1 elif $c == "-" then -1 elif $c == "0" then 0 else null end;
    [ .[]?
      | select(type=="object" and ((.kind == 7) or (.kind == 17)) and ((.tags // []) | type) == "array")
      | . as $ev
      | select((tagv("context") == $context) or (tagv("list_context") == $context))
      | (tagv("entry") // tagv("list_entry")) as $entry_id
      | (vote_value) as $value
      | select(($entry_id | length) > 0 and ($value != null))
      | (.created_at // 0 | tonumber? // 0) as $created_at
      | (tagv("vote_epoch") | tonumber? // (($created_at / $cooldown | floor) * $cooldown)) as $epoch
      | {
          entry_id: $entry_id,
          voter: (.pubkey // ""),
          value: $value,
          created_at: $created_at,
          vote_epoch: $epoch,
          vote_context: $context,
          event_id: (.id // ""),
          event_kind: (.kind // 0),
          source: "nostr"
        }
      | select((.voter | length) > 0)
    ]
  ' "$tmp" 2>/dev/null || printf '[]\n'
  rm -f "$tmp"
}

blog_list_merge_public_activity_json() {
  state_json=${1-}
  validation_json=${2-}
  viewer=${3-}
  [ -n "$state_json" ] || state_json='{}'
  [ -n "$validation_json" ] || validation_json='{"elements":[],"entries":[],"errors":[],"warnings":[],"can_publish":true}'
  slug=$(printf '%s\n' "$state_json" | jq -r '.slug // ""' 2>/dev/null || printf '')
  [ -n "$slug" ] || slug='list'
  submissions_json=$(blog_list_public_entries_json "$slug")
  votes_json=$(blog_list_public_votes_json "$slug")
  now_epoch=$(blog_now_epoch)
  vote_cooldown_seconds=$(blog_list_vote_cooldown_seconds)
  vote_context=$(blog_list_vote_context_for_slug "$slug" 2>/dev/null || printf '')
  current_vote_epoch=$(( (now_epoch / vote_cooldown_seconds) * vote_cooldown_seconds ))
  jq -cn \
    --argjson validation "$validation_json" \
    --argjson submissions "$submissions_json" \
    --argjson votes "$votes_json" \
    --arg viewer "$viewer" \
    --arg vote_context "$vote_context" \
    --argjson now_epoch "$now_epoch" \
    --argjson vote_cooldown_seconds "$vote_cooldown_seconds" \
    --argjson current_vote_epoch "$current_vote_epoch" \
    '
      def epoch_for($vote):
        (($vote.vote_epoch // (((($vote.created_at // 0) | tonumber? // 0) / $vote_cooldown_seconds | floor) * $vote_cooldown_seconds)) | tonumber? // 0);
      ($votes
        | map(. + {vote_epoch: epoch_for(.)})
        | sort_by((.entry_id // ""), (.voter // ""), (.vote_epoch // 0), (.created_at // 0), (.event_id // ""))
      ) as $normalized_votes
      | ($normalized_votes
        | group_by([(.entry_id // ""), (.voter // ""), (.vote_epoch // 0)])
        | map(max_by([(.created_at // 0), (.event_id // "")]))
      ) as $epoch_votes
      | ($normalized_votes
        | map(select(((.value // 0) == 1) or ((.value // 0) == -1)))
      ) as $scored_votes
      | def score_for($id):
          ([$scored_votes[]? | select((.entry_id // "") == $id) | ((.value // 0) | tonumber? // 0)] | add // 0);
        def latest_vote_for($id):
          ([$scored_votes[]? | select((.entry_id // "") == $id)] | max_by([(.created_at // 0), (.event_id // "")]) // {});
        def latest_vote_value_for($id):
          ((latest_vote_for($id).value // 0) | tonumber? // 0);
        def latest_vote_created_at_for($id):
          ((latest_vote_for($id).created_at // 0) | tonumber? // 0);
        def viewer_votes_for($id):
          [$normalized_votes[]? | select((.entry_id // "") == $id and (.voter // "") == $viewer)];
        def viewer_epoch_votes_for($id):
          [$epoch_votes[]? | select((.entry_id // "") == $id and (.voter // "") == $viewer)];
        def viewer_latest_vote_for($id):
          (viewer_epoch_votes_for($id) | max_by([(.vote_epoch // 0), (.created_at // 0), (.event_id // "")]) // {});
        def viewer_current_epoch_vote_for($id):
          ([viewer_epoch_votes_for($id)[]? | select((.vote_epoch // 0) == $current_vote_epoch)] | max_by([(.created_at // 0), (.event_id // "")]) // {});
        def viewer_vote_for($id):
          ((viewer_current_epoch_vote_for($id).value // 0) | tonumber? // 0);
        def viewer_vote_created_at_for($id):
          ((viewer_latest_vote_for($id).created_at // 0) | tonumber? // 0);
        def viewer_vote_epoch_for($id):
          ((viewer_latest_vote_for($id).vote_epoch // 0) | tonumber? // 0);
        def viewer_vote_total_for($id):
          ([$scored_votes[]? | select((.entry_id // "") == $id and (.voter // "") == $viewer)] | length);
        def viewer_next_vote_at_for($id):
          (viewer_latest_vote_for($id).vote_epoch // 0) as $last_epoch
          | if $last_epoch > 0 then ($last_epoch + $vote_cooldown_seconds) else 0 end;
        def viewer_can_vote_now_for($id):
          (viewer_next_vote_at_for($id)) as $next_vote_at
          | ($next_vote_at == 0 or $now_epoch >= $next_vote_at);
        def viewer_can_change_vote_for($id):
          ((viewer_current_epoch_vote_for($id).created_at // 0) | tonumber? // 0) > 0;
        def vote_fields($id): {
          vote_context: $vote_context,
          vote_epoch: $current_vote_epoch,
          list_score: score_for($id),
          list_latest_vote: latest_vote_value_for($id),
          list_latest_vote_created_at: latest_vote_created_at_for($id),
          viewer_vote: viewer_vote_for($id),
          viewer_vote_created_at: viewer_vote_created_at_for($id),
          viewer_vote_event_id: (viewer_latest_vote_for($id).event_id // ""),
          viewer_vote_epoch: viewer_vote_epoch_for($id),
          viewer_vote_total: viewer_vote_total_for($id),
          viewer_next_vote_at: viewer_next_vote_at_for($id),
          viewer_can_vote_now: viewer_can_vote_now_for($id),
          viewer_can_change_vote: viewer_can_change_vote_for($id),
          vote_cooldown_seconds: $vote_cooldown_seconds
        };
        (($validation.elements // []) | to_entries | map(.value + {_list_entry_id: ("entry-" + (.key | tostring))})) as $base
      | ($submissions | map({
          type: "entry",
          event_id: "",
          relay_hint: "",
          marker: (.marker // ""),
          date: (.date // ""),
          depth: 0,
          markdown: (.markdown // ""),
          image_url: "",
          description: (.description // ""),
          year: "",
          resolved: false,
          post_url: (.post_url // ""),
          post_created_at: "",
          post_list_date: "",
          _list_entry_id: (.id // ""),
          _public_entry_id: (.id // ""),
          public_submitter: (.submitter // ""),
          public_created_at: (.created_at // 0)
        })) as $public_entries
      | ($base + $public_entries) as $merged
      | $validation + {
          elements: ($merged | map(. + vote_fields(._list_entry_id // ""))),
          entries: ($merged | map(. + vote_fields(._list_entry_id // ""))),
          public_entry_count: ($public_entries | length)
        }
    '
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
  if [ -f "$path" ]; then
    raw=$(blog_state_markdown_to_json "$path" content 2>/dev/null || printf '')
  else
    path=$(blog_list_legacy_draft_path "$slug")
    if [ ! -f "$path" ]; then
      return 1
    fi
    raw=$(cat "$path" 2>/dev/null || printf '')
  fi
  [ -n "$raw" ] || return 1
  blog_list_normalize_state_json "$slug" "$raw"
}

blog_list_save_draft_state_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  state_json=${2-}
  [ -n "$state_json" ] || return 1
  path=$(blog_list_draft_path "$slug")
  normalized=$(blog_list_normalize_state_json "$slug" "$state_json")
  markdown_state=$(printf '%s\n' "$normalized" | jq -c 'del(.entries, .tags)')
  blog_state_markdown_write_json "$path" "$markdown_state" content
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
    tile_description=$(printf '%s\n' "$element" | jq -r '.description // .[8] // ""' 2>/dev/null || printf '')
    explicit_post_url=$(printf '%s\n' "$element" | jq -r '.post_url // .[9] // ""' 2>/dev/null || printf '')
    allow_votes=$(printf '%s\n' "$state_json" | jq -r '.allow_signed_in_votes // false | if . then "true" else "false" end' 2>/dev/null || printf 'false')

    resolved=false
    post_url=$explicit_post_url
    post_created_at=""
    post_list_date=""

    if [ -n "$relay_hint" ] && ! printf '%s' "$relay_hint" | grep -Eq '^wss://'; then
      printf 'Entry %s has a relay hint that does not start with wss://\n' "$((idx + 1))" >> "$warnings_tmp"
    fi

    if [ -n "$event_id" ] && [ -n "$explicit_post_url" ]; then
      if [ "$strict_publish" = "true" ]; then
        printf 'Entry %s has both POST_URL and EVENT_ID; use one link source\n' "$((idx + 1))" >> "$errors_tmp"
      else
        printf 'Entry %s has both POST_URL and EVENT_ID; POST_URL is the visible link and EVENT_ID will not replace it\n' "$((idx + 1))" >> "$warnings_tmp"
      fi
    fi

    vote_target_kind=""
    vote_target_ref=""
    if [ -n "$event_id" ]; then
      vote_target_kind="event"
      vote_target_ref="$event_id"
    elif [ -n "$explicit_post_url" ]; then
      vote_target_kind="web"
      vote_target_ref="$explicit_post_url"
    elif [ -n "$markdown" ]; then
      vote_target_kind="text"
      vote_target_ref=$(printf '%s' "$markdown" | shasum -a 256 2>/dev/null | awk '{print "sha256:" $1}' || printf '')
      if [ "$allow_votes" = "true" ]; then
        printf 'Entry %s has no Nostr event or URL; votes will target a derived text identity\n' "$((idx + 1))" >> "$warnings_tmp"
      fi
    elif [ "$allow_votes" = "true" ] && [ "$strict_publish" = "true" ]; then
      printf 'Entry %s needs a stable vote target before publishing votes\n' "$((idx + 1))" >> "$errors_tmp"
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
            post_list_date=$(blog_read_front_matter_value "$file" list_date 2>/dev/null || printf '')
            if [ -z "$explicit_post_url" ]; then
              post_url=$(blog_rel_post_html_url "$file")
            fi
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
    if [ -z "$year" ] && [ -n "$post_list_date" ] && printf '%s' "$post_list_date" | grep -Eq '^[0-9]{4}'; then
      year=$(printf '%s' "$post_list_date" | cut -c1-4)
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
      --arg description "$tile_description" \
      --arg type "$element_type" \
      --argjson depth "$depth_int" \
      --arg year "$year" \
      --arg post_url "$post_url" \
      --arg post_created_at "$post_created_at" \
      --arg post_list_date "$post_list_date" \
      --arg vote_target_kind "$vote_target_kind" \
      --arg vote_target_ref "$vote_target_ref" \
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
        description: $description,
        year: $year,
        resolved: $resolved,
        post_url: $post_url,
        post_created_at: $post_created_at,
        post_list_date: $post_list_date,
        vote_target_kind: $vote_target_kind,
        vote_target_ref: $vote_target_ref
      }' | tee -a "$elements_tmp" >> "$entries_tmp"
    idx=$((idx + 1))
  done

  elements_json='[]'
  if [ -s "$elements_tmp" ]; then
    elements_json=$(jq -s '.' "$elements_tmp" 2>/dev/null || printf '[]')
  fi
  protected_messages_json=$(blog_list_oeuvre_protected_content_messages_json "$state_json")
  if printf '%s\n' "$protected_messages_json" | jq -e 'length > 0' >/dev/null 2>&1; then
    printf '%s\n' "$protected_messages_json" | jq -r '.[]' >> "$errors_tmp"
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
