# Shared blog post card rendering for Lodestone prerender and client hydration.

blog_post_cards_count() {
  posts_json=${1-}
  if [ -z "$posts_json" ]; then
    printf '0\n'
    return 0
  fi
  count=$(printf '%s\n' "$posts_json" | jq -r 'if type == "array" then length else 0 end' 2>/dev/null || printf '0')
  case "$count" in
    ''|*[!0-9]*) count=0 ;;
  esac
  printf '%s\n' "$count"
}

blog_post_cards_empty_text() {
  posts_json=${1-}
  count=$(blog_post_cards_count "$posts_json")
  if [ "$count" -gt 0 ]; then
    printf '\n'
    return 0
  fi
  printf 'No posts to show yet.\n'
}

blog_post_cards_empty_attrs() {
  posts_json=${1-}
  count=$(blog_post_cards_count "$posts_json")
  if [ "$count" -gt 0 ]; then
    printf ' hidden\n'
    return 0
  fi
  printf '\n'
}

blog_post_cards_render_card_html() {
  post_json=${1-}
  active_tag=${2-}
  [ -n "$post_json" ] || return 1
  printf '%s\n' "$post_json" | jq -r --arg active_tag "$active_tag" '
    def trimmed($value):
      (($value // "") | tostring | gsub("^\\s+|\\s+$"; ""));
    def esc($value):
      (trimmed($value) | @html);
    def nonempty_or_null($key):
      (trimmed(.[ $key ])) as $value
      | if $value == "" then null else $value end;
    def integer_value($key):
      (.[$key] // 0)
      | if type == "number" then .
        elif type == "string" then (tonumber? // 0)
        else 0
        end;
    def bool_value($key):
      ((.[$key] // false) == true);
    def tags_value:
      (.tags // [])
      | if type == "array" then
          map((. // "") | tostring | gsub("^\\s+|\\s+$"; "") | select(length > 0))
        else
          []
        end;
    def format_post_type($value):
      (($value // "") | tostring | gsub("_"; "-") | split("-"))
      | map(select(length > 0) | (.[:1] | ascii_upcase) + .[1:])
      | join(" ");
    def render_blog_filter_pill($class_name; $group; $value; $label):
      "<button type=\"button\" class=\"\($class_name | @html)\" data-inline-filter-group=\"\($group | @html)\" data-inline-filter-value=\"\($value | @html)\" aria-pressed=\"false\" aria-label=\"Filter by \($label | @html)\">\($label | @html)</button>";
    def render_blog_link_note($author):
      (trimmed(.link_url)) as $link_url
      | "<div class=\"post-offsite-link-note\"><span class=\"post-offsite-link-kind\">Off-site link</span><span>Linked by \($author | @html)</span>"
        + (if $link_url == "" then
             ""
           else
             "<a class=\"post-offsite-url\" href=\"\($link_url | @html)\" title=\"\($link_url | @html)\">\($link_url | @html)</a>"
           end)
        + "</div>\n";
    def render_blog_post_summary($url):
      (trimmed(.summary)) as $summary
      | if $summary == "" then
          ""
        else
          "<div class=\"post-summary\"><p>\($summary | @html)</p>"
          + (if bool_value("summary_truncated") and ($url != "") then
               "<a class=\"post-summary-read-more\" href=\"\($url | @html)\">Read more...</a>"
             else
               ""
             end)
          + "</div>\n"
        end;

    (nonempty_or_null("title") // nonempty_or_null("summary") // "Untitled") as $title
    | (nonempty_or_null("url") // "") as $url
    | (nonempty_or_null("source_path") // "") as $source_path
    | (nonempty_or_null("type") // "post") as $post_type
    | (nonempty_or_null("author") // "Blog Author") as $author
    | ([integer_value("reading_minutes"), 1] | max) as $read_minutes
    | (nonempty_or_null("published_date") // nonempty_or_null("pub_date") // "Unknown date") as $published_date
    | (nonempty_or_null("published_timestamp") // nonempty_or_null("published_at") // "") as $published_timestamp
    | (nonempty_or_null("year") // "Unknown") as $year
    | tags_value as $tags
    | ([integer_value("comment_count"), 0] | max) as $comments
    | (if $comments == 1 then "1 comment" else "\($comments) comments" end) as $comments_label
    | "<article class=\"post-item blog-post-item"
      + (if $post_type == "link-share" then " is-link-share" else "" end)
      + "\""
      + (if $source_path == "" then "" else " data-post-path=\"\($source_path | @html)\"" end)
      + ">\n"
      + "<div class=\"post-head\">\n"
      + "<div class=\"post-head-main\">\n"
      + "<h2 class=\"post-title\"><a href=\"\($url | @html)\">\($title | @html)</a></h2>\n"
      + (if $post_type == "link-share" then render_blog_link_note($author) else "" end)
      + "<div class=\"post-head-divider\" aria-hidden=\"true\"></div>\n"
      + "<div class=\"post-byline post-byline-bottom\"><span class=\"post-author\">\($author | @html)</span><span class=\"post-reading-inline\">\($read_minutes | tostring | @html) min read</span><span class=\"post-date\""
      + (if $published_timestamp == "" then "" else " title=\"\($published_timestamp | @html)\"" end)
      + ">\($published_date | @html)</span></div>\n"
      + "</div>\n"
      + "</div>\n"
      + render_blog_post_summary($url)
      + "<div class=\"post-card-footer\"><div class=\"tags post-card-meta-tags\">"
      + render_blog_filter_pill("tag blog-type-pill"; "types"; $post_type; format_post_type($post_type))
      + render_blog_filter_pill("tag blog-year-pill"; "years"; $year; $year)
      + ($tags | map(
          (. == $active_tag) as $is_active
          | "<button type=\"button\" class=\"tag blog-inline-tag"
            + (if $is_active then " is-active" else "" end)
            + "\" data-inline-tag=\"\(. | @html)\" aria-pressed=\""
            + (if $is_active then "true" else "false" end)
            + "\">\(. | @html)</button>"
        ) | join(""))
      + "</div><span class=\"post-card-comments-count\">\($comments_label | @html)</span></div>\n"
      + "</article>\n"
  ' 2>/dev/null
}

blog_post_cards_render_list_html() {
  posts_json=${1-}
  active_tag=${2-}
  count=$(blog_post_cards_count "$posts_json")
  if [ "$count" -eq 0 ]; then
    return 0
  fi

  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-post-cards.XXXXXX")
  printf '%s\n' "$posts_json" | jq -c '.[]' > "$tmp"
  while IFS= read -r post_json || [ -n "$post_json" ]; do
    [ -n "$post_json" ] || continue
    blog_post_cards_render_card_html "$post_json" "$active_tag"
  done < "$tmp"
  rm -f "$tmp"
}

blog_post_cards_type_label() {
  raw_type=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]')
  case "$raw_type" in
    shortform)
      printf 'shortform\n'
      ;;
    capture-media)
      printf 'capture\n'
      ;;
    upload-media)
      printf 'media\n'
      ;;
    attachment)
      printf 'attachment\n'
      ;;
    audio-note)
      printf 'audio\n'
      ;;
    link-share)
      printf 'link\n'
      ;;
    go-live)
      printf 'go live\n'
      ;;
    *)
      printf 'post\n'
      ;;
  esac
}

blog_post_cards_filter_chip_html() {
  group=${1-}
  value=${2-}
  label=${3-}
  active=${4-false}
  class_name='blog-filter-chip'
  aria_pressed='false'
  if [ "$active" = "true" ]; then
    class_name="$class_name is-active"
    aria_pressed='true'
  fi
  jq -rn \
    --arg class_name "$class_name" \
    --arg group "$group" \
    --arg value "$value" \
    --arg label "$label" \
    --arg aria_pressed "$aria_pressed" \
    '"<button type=\"button\" class=\"\($class_name | @html)\" data-filter-group=\"\($group | @html)\" data-filter-value=\"\($value | @html)\" aria-pressed=\"\($aria_pressed)\">\($label | @html)</button>"' 2>/dev/null
}

blog_post_cards_render_tag_filter_html() {
  posts_json=${1-}
  active_tag=${2-}
  printf '%s\n' "$posts_json" | jq -r '
    [ .[]? | (.tags // [])[]? | tostring | gsub("^\\s+|\\s+$"; "") | select(length > 0) ]
    | unique
    | sort
    | .[]
  ' 2>/dev/null | while IFS= read -r tag || [ -n "$tag" ]; do
    [ -n "$tag" ] || continue
    active=false
    if [ "$tag" = "$active_tag" ]; then
      active=true
    fi
    blog_post_cards_filter_chip_html 'tags' "$tag" "$tag" "$active"
  done
}

blog_post_cards_render_year_filter_html() {
  posts_json=${1-}
  printf '%s\n' "$posts_json" | jq -r '
    [ .[]? | (.year // "") | tostring | gsub("^\\s+|\\s+$"; "") | select(length > 0) ]
    | unique
    | sort_by((tonumber? // -1))
    | reverse
    | .[]
  ' 2>/dev/null | while IFS= read -r year || [ -n "$year" ]; do
    [ -n "$year" ] || continue
    blog_post_cards_filter_chip_html 'years' "$year" "$year" false
  done
}

blog_post_cards_render_type_filter_html() {
  posts_json=${1-}
  printf '%s\n' "$posts_json" | jq -r '
    [ .[]? | (.type // "post") | tostring | gsub("^\\s+|\\s+$"; "") | select(length > 0) ]
    | unique
    | sort
    | .[]
  ' 2>/dev/null | while IFS= read -r post_type || [ -n "$post_type" ]; do
    [ -n "$post_type" ] || continue
    blog_post_cards_filter_chip_html 'types' "$post_type" "$(blog_post_cards_type_label "$post_type")" false
  done
}
