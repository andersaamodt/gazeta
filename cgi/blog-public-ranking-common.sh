#!/bin/sh
# Shared helpers for Public Ranking pages (kinds 30040/30041 + kind 7 upvotes).

set -eu

blog_public_ranking_default_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  title=$(blog_nostr_page_titleize_slug "$slug")
  jq -cn --arg slug "$slug" --arg title "$title" '{
    slug: $slug,
    type: "public-ranking",
    title: $title,
    description: "",
    content: "",
    extras_after: "",
    extras_after_format: "markdown",
    vote_cooldown_seconds: 86400,
    submission_mode: "owner_only",
    default_metric: "momentum",
    blacklist_pubkeys: [],
    root_refs: []
  }'
}

blog_public_ranking_normalize_state_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  raw_json=${2-}
  fallback_title=$(blog_nostr_page_titleize_slug "$slug")

  if [ -z "$raw_json" ] || ! printf '%s\n' "$raw_json" | jq -e 'type=="object"' >/dev/null 2>&1; then
    blog_public_ranking_default_state_json "$slug"
    return 0
  fi

  printf '%s\n' "$raw_json" | jq -c --arg slug "$slug" --arg fallback_title "$fallback_title" '
    def norm_extra_format($v):
      (($v // "") | tostring | ascii_downcase) as $f
      | if $f == "html" then "html" else "markdown" end;
    def norm_mode($v):
      (($v // "") | tostring | ascii_downcase) as $m
      | if ($m == "open" or $m == "moderated") then $m else "owner_only" end;
    def norm_metric($v):
      (($v // "") | tostring | ascii_downcase) as $m
      | if ($m == "support" or $m == "enthusiasm" or $m == "intensity") then $m else "momentum" end;
    def norm_pubkey($v):
      (($v // "") | tostring | ascii_downcase | gsub("[^0-9a-f]";""));
    def is_coord($v):
      (($v // "") | tostring | test("^[0-9]+:[0-9a-f]{64}:[^[:space:]]+$"));

    {
      slug: $slug,
      type: "public-ranking",
      title: ((.title // $fallback_title) | tostring),
      description: ((.description // .summary // "") | tostring),
      content: ((.content // "") | tostring),
      extras_after: ((.extras_after // (if ((.extras // null) | type) == "object" then .extras.after else empty end) // "") | tostring),
      extras_after_format: norm_extra_format(.extras_after_format // (if ((.extras // null) | type) == "object" then (.extras.after_format // .extras.after_type) else empty end) // "markdown"),
      vote_cooldown_seconds: ((.vote_cooldown_seconds // .vote_cooldown // 86400) | tonumber? // 86400),
      submission_mode: norm_mode(.submission_mode // .permission_mode // .entry_mode // "owner_only"),
      default_metric: norm_metric(.default_metric // .sort_metric // "momentum"),
      blacklist_pubkeys: (
        if (.blacklist_pubkeys | type) == "array" then .blacklist_pubkeys
        elif (.blacklist | type) == "array" then .blacklist
        elif (.blacklist | type) == "string" then (.blacklist | split("\n"))
        else [] end
        | map(norm_pubkey(.))
        | map(select(length == 64))
        | unique
      ),
      root_refs: (
        if (.root_refs | type) == "array" then .root_refs else [] end
        | map((. // "") | tostring)
        | map(select(is_coord(.)))
        | unique
      )
    }
    | .vote_cooldown_seconds = (
        if .vote_cooldown_seconds < 60 then 60
        elif .vote_cooldown_seconds > 604800 then 604800
        else (.vote_cooldown_seconds | floor)
        end
      )
  ' 2>/dev/null || blog_public_ranking_default_state_json "$slug"
}

blog_public_ranking_state_from_event_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  event_json=${2-}
  if [ -z "$event_json" ] || ! printf '%s\n' "$event_json" | jq -e 'type=="object"' >/dev/null 2>&1; then
    blog_public_ranking_default_state_json "$slug"
    return 0
  fi

  raw=$(printf '%s\n' "$event_json" | jq -c --arg slug "$slug" '
    {
      slug: $slug,
      title: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="title") | .[1]] | first) // ""),
      description: (([.tags[]? | select(type=="array" and length>=2 and (. [0]=="summary" or .[0]=="description")) | .[1]] | first) // ""),
      content: (.content // ""),
      vote_cooldown_seconds: (([.tags[]? | select(type=="array" and length>=2 and (. [0]=="vote_cooldown" or .[0]=="vote_cooldown_seconds")) | .[1]] | first) // "86400"),
      submission_mode: (([.tags[]? | select(type=="array" and length>=2 and (. [0]=="submission_mode" or .[0]=="permission_mode")) | .[1]] | first) // "owner_only"),
      default_metric: (([.tags[]? | select(type=="array" and length>=2 and (. [0]=="sort_metric" or .[0]=="default_metric")) | .[1]] | first) // "momentum"),
      blacklist_pubkeys: ([.tags[]? | select(type=="array" and length>=2 and .[0]=="blacklist") | .[1]]),
      root_refs: ([.tags[]? | select(type=="array" and length>=2 and .[0]=="a") | .[1]])
    }
  ' 2>/dev/null || printf '')

  blog_public_ranking_normalize_state_json "$slug" "$raw"
}

blog_public_ranking_state_signature_json() {
  state_json=${1-}
  if [ -z "$state_json" ]; then
    printf '{}\n'
    return 0
  fi

  printf '%s\n' "$state_json" | jq -c '{
    title: (.title // ""),
    description: (.description // ""),
    content: (.content // ""),
    vote_cooldown_seconds: (.vote_cooldown_seconds // 86400),
    submission_mode: (.submission_mode // "owner_only"),
    default_metric: (.default_metric // "momentum"),
    blacklist_pubkeys: (.blacklist_pubkeys // []),
    root_refs: (.root_refs // [])
  }' 2>/dev/null || printf '{}\n'
}

blog_public_ranking_validate_and_enrich_state_json() {
  state_json=${1-}
  strict_publish=${2-false}

  if [ -z "$state_json" ]; then
    printf '{"errors":["Missing public ranking state"],"warnings":[],"can_publish":false}\n'
    return 0
  fi

  printf '%s\n' "$state_json" | jq -c --arg strict "$strict_publish" '
    def is_coord($v): (($v // "") | tostring | test("^[0-9]+:[0-9a-f]{64}:[^[:space:]]+$"));

    . as $s
    | ([
        (if (($s.title // "") | tostring | gsub("\\s+";" ") | length) == 0 then "Title is required" else empty end),
        (if (($s.vote_cooldown_seconds // 0) | tonumber? // 0) < 60 then "Vote cooldown must be at least 60 seconds" else empty end),
        (if (((($s.submission_mode // "") | tostring | ascii_downcase) as $m | ($m == "owner_only" or $m == "open" or $m == "moderated")) | not) then "Submission mode must be owner_only, open, or moderated" else empty end),
        (if (((($s.default_metric // "") | tostring | ascii_downcase) as $m | ($m == "momentum" or $m == "support" or $m == "enthusiasm" or $m == "intensity")) | not) then "Default metric must be momentum, support, enthusiasm, or intensity" else empty end)
      ]
      + [ (($s.blacklist_pubkeys // [])[]? | tostring | ascii_downcase) | select(test("^[0-9a-f]{64}$") | not) | "Invalid blacklist pubkey: " + . ]
      + [ (($s.root_refs // [])[]? | tostring) | select(is_coord(.) | not) | "Invalid root reference: " + . ]
      ) as $errors
    | {
        errors: $errors,
        warnings: (
          if (($s.root_refs // []) | length) > 0 then []
          else ["No root references configured yet. Add items from the ranking page."] end
        ),
        can_publish: (($errors | length) == 0)
      }
  ' 2>/dev/null || printf '{"errors":["Could not validate public ranking state"],"warnings":[],"can_publish":false}\n'
}

blog_nostr_addressable_latest_event_json() {
  kind_raw=${1-}
  pubkey_raw=${2-}
  d_raw=${3-}

  case "$kind_raw" in
    ''|*[!0-9]*) return 1 ;;
  esac
  pubkey=$(blog_validate_nostr_pubkey "$pubkey_raw" 2>/dev/null || printf '')
  [ -n "$pubkey" ] || return 1
  [ -n "$d_raw" ] || return 1

  dir="$blog_nostr_events_dir/$pubkey/$kind_raw"
  [ -d "$dir" ] || return 1

  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-addressable.XXXXXX")
  find "$dir" -type f -name '*.json' 2>/dev/null | while IFS= read -r file; do
    [ -f "$file" ] || continue
    jq -c '.' "$file" 2>/dev/null || true
  done > "$tmp"

  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    return 1
  fi

  out=$(jq -cs --arg d "$d_raw" --argjson kind "$kind_raw" '
    [ .[]
      | select(type=="object" and (.kind|type)=="number" and .kind==$kind and (.tags|type)=="array")
      | (([.tags[]? | select(type=="array" and length>=2 and .[0]=="d") | .[1]] | first) // "") as $ev_d
      | select($ev_d == $d)
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

blog_nostr_public_ranking_latest_event_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  [ -n "$slug" ] || return 1
  [ -d "$blog_nostr_events_dir" ] || return 1

  authors_json=$(blog_nostr_list_file_to_json_array "$blog_nostr_authors_file" 2>/dev/null || printf '[]')
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-ranking-events.XXXXXX")

  find "$blog_nostr_events_dir" -type f -path '*/30040/*.json' 2>/dev/null | while IFS= read -r file; do
    [ -f "$file" ] || continue
    jq -c '.' "$file" 2>/dev/null || true
  done > "$tmp"

  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    return 1
  fi

  out=$(jq -cs --arg slug "$slug" --argjson authors "$authors_json" '
    [ .[]
      | select(type=="object" and (.kind|type)=="number" and .kind==30040 and (.tags|type)=="array" and (.pubkey|type)=="string")
      | .pubkey as $pk
      | select((($authors | length) == 0) or (($authors | index($pk)) != null))
      | (([.tags[]? | select(type=="array" and length>=2 and .[0]=="d") | .[1]] | first) // "") as $d
      | (([.tags[]? | select(type=="array" and length>=2 and .[0]=="t") | .[1]] | map(ascii_downcase)) // []) as $topics
      | select($d == $slug and (($topics | index("public-ranking")) != null))
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

blog_nostr_sign_public_ranking_event() {
  slug=$(blog_nostr_page_slug "${1-}")
  state_json=${2-}
  [ -n "$slug" ] || return 1
  [ -n "$state_json" ] || return 1

  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi
  if ! command -v nostril >/dev/null 2>&1; then
    return 1
  fi

  state_json=$(blog_public_ranking_normalize_state_json "$slug" "$state_json")

  secret=$(blog_nostr_secret_key 2>/dev/null || printf '')
  [ -n "$secret" ] || return 1

  title=$(printf '%s\n' "$state_json" | jq -r '.title // ""' 2>/dev/null || printf '')
  description=$(printf '%s\n' "$state_json" | jq -r '.description // ""' 2>/dev/null || printf '')
  content=$(printf '%s\n' "$state_json" | jq -r '.content // ""' 2>/dev/null || printf '')
  mode=$(printf '%s\n' "$state_json" | jq -r '.submission_mode // "owner_only"' 2>/dev/null || printf 'owner_only')
  metric=$(printf '%s\n' "$state_json" | jq -r '.default_metric // "momentum"' 2>/dev/null || printf 'momentum')
  cooldown=$(printf '%s\n' "$state_json" | jq -r '.vote_cooldown_seconds // 86400' 2>/dev/null || printf '86400')

  created_at=$(blog_now_epoch)
  set -- nostril --sec "$secret" --kind 30040 --created-at "$created_at" --content "$content" --tag d "$slug" --tag t public-ranking
  [ -n "$title" ] && set -- "$@" --tag title "$title"
  [ -n "$description" ] && set -- "$@" --tag summary "$description"
  set -- "$@" --tag submission_mode "$mode" --tag sort_metric "$metric" --tag vote_cooldown "$cooldown"

  refs_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-ranking-refs.XXXXXX")
  blacklist_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-ranking-blacklist.XXXXXX")
  printf '%s\n' "$state_json" | jq -r '.root_refs[]? // empty' 2>/dev/null > "$refs_tmp"
  printf '%s\n' "$state_json" | jq -r '.blacklist_pubkeys[]? // empty' 2>/dev/null > "$blacklist_tmp"

  if [ -s "$refs_tmp" ]; then
    sort -u "$refs_tmp" -o "$refs_tmp"
    while IFS= read -r ref || [ -n "$ref" ]; do
      [ -n "$ref" ] || continue
      set -- "$@" --tag a "$ref"
    done < "$refs_tmp"
  fi
  if [ -s "$blacklist_tmp" ]; then
    sort -u "$blacklist_tmp" -o "$blacklist_tmp"
    while IFS= read -r blocked || [ -n "$blocked" ]; do
      [ -n "$blocked" ] || continue
      set -- "$@" --tag blacklist "$blocked"
    done < "$blacklist_tmp"
  fi
  rm -f "$refs_tmp" "$blacklist_tmp"

  sign_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-ranking-sign.XXXXXX")
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

blog_nostr_sign_public_ranking_node_event() {
  kind_raw=${1-}
  d_tag=${2-}
  content=${3-}
  tags_json=${4-}

  case "$kind_raw" in
    30040|30041) ;;
    *) return 1 ;;
  esac
  [ -n "$d_tag" ] || return 1

  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi
  if ! command -v nostril >/dev/null 2>&1; then
    return 1
  fi
  if ! printf '%s\n' "$tags_json" | jq -e 'type=="array"' >/dev/null 2>&1; then
    return 1
  fi

  secret=$(blog_nostr_secret_key 2>/dev/null || printf '')
  [ -n "$secret" ] || return 1

  created_at=$(blog_now_epoch)
  set -- nostril --sec "$secret" --kind "$kind_raw" --created-at "$created_at" --content "$content" --tag d "$d_tag"

  tags_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-ranking-node-tags.XXXXXX")
  printf '%s\n' "$tags_json" | jq -c '.[] | select(type=="array" and length>=2)' > "$tags_tmp"
  while IFS= read -r tag_line || [ -n "$tag_line" ]; do
    [ -n "$tag_line" ] || continue
    key=$(printf '%s\n' "$tag_line" | jq -r '.[0] // ""' 2>/dev/null || printf '')
    value=$(printf '%s\n' "$tag_line" | jq -r '.[1] // ""' 2>/dev/null || printf '')
    [ -n "$key" ] || continue
    [ "$key" = "d" ] && continue
    set -- "$@" --tag "$key" "$value"
  done < "$tags_tmp"
  rm -f "$tags_tmp"

  sign_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-ranking-node-sign.XXXXXX")
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

blog_public_ranking_parse_coordinate() {
  coord=${1-}
  if [ -z "$coord" ]; then
    return 1
  fi
  kind=${coord%%:*}
  rest=${coord#*:}
  [ "$rest" != "$coord" ] || return 1
  pubkey=${rest%%:*}
  d=${rest#*:}
  [ "$d" != "$rest" ] || return 1
  case "$kind" in
    ''|*[!0-9]*) return 1 ;;
  esac
  pubkey=$(blog_validate_nostr_pubkey "$pubkey" 2>/dev/null || printf '')
  [ -n "$pubkey" ] || return 1
  [ -n "$d" ] || return 1
  printf '%s;%s;%s\n' "$kind" "$pubkey" "$d"
}

blog_public_ranking_latest_node_event_json() {
  coord=${1-}
  parsed=$(blog_public_ranking_parse_coordinate "$coord" 2>/dev/null || printf '')
  [ -n "$parsed" ] || return 1
  kind=$(printf '%s' "$parsed" | cut -d';' -f1)
  pubkey=$(printf '%s' "$parsed" | cut -d';' -f2)
  d=$(printf '%s' "$parsed" | cut -d';' -f3-)
  blog_nostr_addressable_latest_event_json "$kind" "$pubkey" "$d"
}

blog_public_ranking_effective_root_coord() {
  slug=$(blog_nostr_page_slug "${1-}")
  canonical_event_json=${2-}
  if [ -n "$canonical_event_json" ] && printf '%s\n' "$canonical_event_json" | jq -e 'type=="object"' >/dev/null 2>&1; then
    root_coord=$(printf '%s\n' "$canonical_event_json" | jq -r '((.kind|tostring) + ":" + (.pubkey // "") + ":" + (([.tags[]? | select(type=="array" and length>=2 and .[0]=="d") | .[1]] | first) // ""))' 2>/dev/null || printf '')
    if printf '%s' "$root_coord" | grep -Eq '^[0-9]+:[0-9a-f]{64}:[^[:space:]]+$'; then
      printf '%s\n' "$root_coord"
      return 0
    fi
  fi

  site_pubkey=$(blog_nostr_site_pubkey 2>/dev/null || printf '')
  if [ -n "$site_pubkey" ]; then
    printf '30040:%s:%s\n' "$site_pubkey" "$slug"
    return 0
  fi
  printf '\n'
}

blog_public_ranking_view_json() {
  slug=$(blog_nostr_page_slug "${1-}")
  state_json=${2-}
  canonical_event_json=${3-}
  include_pending=${4-false}
  selected_metric=${5-}
  viewer_pubkey_raw=${6-}

  now_epoch=$(blog_now_epoch)
  viewer_pubkey=$(blog_validate_nostr_pubkey "$viewer_pubkey_raw" 2>/dev/null || printf '')
  root_coord=$(blog_public_ranking_effective_root_coord "$slug" "$canonical_event_json")
  root_event_id=$(printf '%s\n' "$canonical_event_json" | jq -r '.id // ""' 2>/dev/null || printf '')

  events_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-ranking-events-all.XXXXXX")
  find "$blog_nostr_events_dir" -type f \( -path '*/30040/*.json' -o -path '*/30041/*.json' -o -path '*/7/*.json' \) 2>/dev/null | while IFS= read -r file; do
    [ -f "$file" ] || continue
    jq -c '.' "$file" 2>/dev/null || true
  done > "$events_tmp"

  events_json=$(jq -s '.' "$events_tmp" 2>/dev/null || printf '[]')
  rm -f "$events_tmp"

  posts_json='[]'
  if [ -f "$blog_nostr_posts_index" ]; then
    posts_json=$(jq -c '.' "$blog_nostr_posts_index" 2>/dev/null || printf '[]')
  fi

  jq -cn \
    --arg slug "$slug" \
    --arg root_coord "$root_coord" \
    --arg root_event_id "$root_event_id" \
    --arg include_pending "$include_pending" \
    --arg selected_metric "$selected_metric" \
    --arg viewer_pubkey "$viewer_pubkey" \
    --argjson now_epoch "$now_epoch" \
    --argjson state "$state_json" \
    --argjson events "$events_json" \
    --argjson posts "$posts_json" '
      def first_tag($tags; $k): ([($tags // [])[]? | select(type=="array" and length>=2 and .[0]==$k) | .[1]] | first // "");
      def all_tags($tags; $k): [($tags // [])[]? | select(type=="array" and length>=2 and .[0]==$k) | .[1]];
      def is_coord($v): (($v // "") | tostring | test("^[0-9]+:[0-9a-f]{64}:[^[:space:]]+$"));
      def coord_of($ev): ((($ev.kind // 0) | tostring) + ":" + ($ev.pubkey // "") + ":" + first_tag($ev.tags; "d"));
      def is_root($ev):
        (coord_of($ev) == $root_coord)
        and ((all_tags($ev.tags; "t") | map(ascii_downcase) | index("public-ranking")) != null);
      def metric_name($state_metric; $override):
        ($override | tostring | ascii_downcase) as $o
        | if ($o == "momentum" or $o == "support" or $o == "enthusiasm" or $o == "intensity") then $o else $state_metric end;
      def metric_value($node; $metric):
        if $metric == "support" then ($node.metrics.support // 0)
        elif $metric == "enthusiasm" then ($node.metrics.enthusiasm // 0)
        elif $metric == "intensity" then ($node.metrics.intensity // 0)
        else ($node.metrics.momentum // 0)
        end;

      ($state.default_metric // "momentum") as $state_metric
      | metric_name($state_metric; $selected_metric) as $metric
      | (($state.vote_cooldown_seconds // 86400) | tonumber? // 86400 | floor | if . < 60 then 60 else . end) as $cooldown
      | (($state.blacklist_pubkeys // []) | map(ascii_downcase)) as $blocked
      | ($events
          | map(select(type=="object" and (.kind==30040 or .kind==30041) and (.tags|type)=="array"))
          | map(. + {
              coordinate: coord_of(.),
              d: first_tag(.tags; "d"),
              ranking: first_tag(.tags; "ranking"),
              parent: (first_tag(.tags; "parent") | if is_coord(.) then . else (first_tag(.tags; "a") | if is_coord(.) then . else "" end) end),
              status: (first_tag(.tags; "status") | tostring | ascii_downcase),
              title: first_tag(.tags; "title"),
              summary: first_tag(.tags; "summary"),
              url: first_tag(.tags; "url"),
              post_ref: first_tag(.tags; "r"),
              author: first_tag(.tags; "author"),
              a_refs: (all_tags(.tags; "a") | map(select(is_coord(.))))
            })
          | map(select(.d != ""))
          | map(select(is_root(.) | not))
          | sort_by(.kind, .pubkey, .d, (.created_at // 0), (.id // ""))
          | group_by(.kind, .pubkey, .d)
          | map(last)
        ) as $all_nodes
      | (if ($root_coord | length) > 0 then
          ((all_tags(($events | map(select(is_root(.))) | sort_by((.created_at // 0), (.id // "")) | last | .tags // []); "a") | map(select(is_coord(.))))
            + ($state.root_refs // []))
        else
          ($state.root_refs // [])
        end
        | unique) as $root_refs
      | (
          (($all_nodes
            | map(select((.ranking == $root_coord) or (.parent == $root_coord) or (($root_refs | index(.coordinate)) != null)))
            | map(.coordinate)
            | unique)
          + ($root_refs | map(select(is_coord(.)))))
          | unique
        ) as $seed
      | def descendants($set):
          ($set + ($all_nodes | map(select((.parent | length) > 0 and (($set | index(.parent)) != null)) | .coordinate)) | unique) as $next
          | if ($next | length) == ($set | length) then $next else descendants($next) end;
      (descendants($seed)) as $selected_coords
      | ($all_nodes | map(select(($selected_coords | index(.coordinate)) != null))) as $selected_nodes
      | (($selected_nodes | map(select(.status == "pending"))) // []) as $pending_nodes
      | (
          ([ $root_refs[]? | { parent: $root_coord, child: . } ]
          + [ $selected_nodes[] | select((.parent | length) > 0) | { parent: .parent, child: .coordinate } ]
          + [ $selected_nodes[] as $n | $n.a_refs[]? | { parent: $n.coordinate, child: . } ])
          | map(select((.parent | length) > 0 and (.child | length) > 0 and (.parent != .child)))
          | unique
        ) as $all_edges
      | (($all_edges | map(.child) | map(select(startswith("30023:"))) | unique)) as $post_ref_coords
      | ($post_ref_coords | map(. as $coord | {
          coordinate: $coord,
          kind: 30023,
          pubkey: "",
          created_at: (($posts | map(select(.address == $coord) | .created_at) | first) // 0),
          title: (($posts | map(select(.address == $coord) | .title) | first) // $coord),
          summary: (($posts | map(select(.address == $coord) | .summary) | first) // ""),
          content: "",
          status: "approved",
          url: (($posts | map(select(.address == $coord and (.html_path // "") != "") | ("/pages/" + .html_path)) | first) // ""),
          post_ref: $coord,
          author: "",
          parent: "",
          ranking: $root_coord,
          node_kind: "post"
        })) as $virtual_post_nodes
      | (
          if ($include_pending == "true") then
            $selected_nodes
          else
            $selected_nodes | map(select((.status == "" or .status == "approved")))
          end
        ) as $visible_nodes
      | ($visible_nodes + $virtual_post_nodes) as $score_nodes
      | (($score_nodes | map(.coordinate) + [$root_coord]) | map(select(length > 0)) | unique) as $score_coords
      | (
          $events
          | map(select(type=="object" and (.kind // 0) == 7 and (.content // "") == "+" and (.pubkey | type) == "string" and (.tags | type) == "array"))
          | map(select(($blocked | index((.pubkey | ascii_downcase))) == null))
          | map({
              id: (.id // ""),
              pubkey: (.pubkey // ""),
              created_at: ((.created_at // 0) | tonumber? // 0),
              target: ((all_tags(.tags; "a") | map(select(($score_coords | index(.)) != null)) | first) // "")
            })
          | map(select((.target | length) > 0))
          | map(. + { bucket: ((.created_at / 86400) | floor) })
          | sort_by(.target, .pubkey, .bucket, .created_at, .id)
          | group_by(.target, .pubkey, .bucket)
          | map(first)
        ) as $counted_votes
      | ($counted_votes
          | group_by(.target)
          | map({
              key: (.[0].target),
              value: {
                enthusiasm: length,
                support: (map(.pubkey) | unique | length),
                momentum: (map((($now_epoch - (.created_at // 0)) / 86400) | if . < 0 then 0 else . end | (1 / (1 + .))) | add // 0)
              }
            })
          | map(.value.intensity = (if (.value.support // 0) > 0 then ((.value.enthusiasm // 0) / (.value.support // 1)) else 0 end))
          | from_entries
        ) as $metrics_map
      | (
          if ($viewer_pubkey | length) == 64 then
            ($events
              | map(select(type=="object" and (.kind // 0) == 7 and (.content // "") == "+" and (.pubkey // "") == $viewer_pubkey and (.tags | type) == "array"))
              | map({
                  target: ((all_tags(.tags; "a") | map(select(($score_coords | index(.)) != null)) | first) // ""),
                  created_at: (((.created_at // 0) | tonumber? // 0))
                })
              | map(select((.target | length) > 0))
              | sort_by(.target, .created_at)
              | group_by(.target)
              | map({
                  key: (.[0].target),
                  value: {
                    last_vote_at: (map(.created_at) | max // 0),
                    next_vote_at: ((map(.created_at) | max // 0) + $cooldown),
                    can_vote_now: ($now_epoch >= ((map(.created_at) | max // 0) + $cooldown))
                  }
                })
              | from_entries)
          else
            {}
          end
        ) as $viewer_vote_window
      | ($score_nodes
          | map(. + {
              status: (if (.status | length) > 0 then .status else "approved" end),
              metrics: ($metrics_map[.coordinate] // { enthusiasm: 0, support: 0, momentum: 0, intensity: 0 }),
              viewer_vote: ($viewer_vote_window[.coordinate] // null),
              node_kind: (if (.kind == 30040) then "group" elif (.kind == 30023) then "post" else "entry" end)
            })) as $scored_nodes
      | ($scored_nodes | sort_by(
          -metric_value(.; $metric),
          -(.metrics.support // 0),
          -(.metrics.enthusiasm // 0),
          -(.created_at // 0),
          .coordinate
        )) as $sorted_nodes
      | {
          root_coord: $root_coord,
          root_event_id: $root_event_id,
          metric: $metric,
          vote_cooldown_seconds: $cooldown,
          pending_count: ($pending_nodes | length),
          viewer_vote_window: $viewer_vote_window,
          metrics: $metrics_map,
          nodes: $sorted_nodes,
          edges: (
            $all_edges
            | map(select(($score_coords | index(.child)) != null and ($score_coords | index(.parent)) != null))
            | unique
          )
        }
    '
}
