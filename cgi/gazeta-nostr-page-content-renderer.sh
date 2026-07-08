# Shared read-only Nostr page content rendering for Lodestone prerender and hydration.

if [ -n "${SCRIPT_DIR:-}" ] && [ -f "$SCRIPT_DIR/blog-video-chat-schedule-common.sh" ]; then
  # shellcheck disable=SC1090
  . "$SCRIPT_DIR/blog-video-chat-schedule-common.sh"
elif [ -n "${blog_site_root:-}" ] && [ -f "$blog_site_root/cgi/blog-video-chat-schedule-common.sh" ]; then
  # shellcheck disable=SC1090
  . "$blog_site_root/cgi/blog-video-chat-schedule-common.sh"
fi

blog_nostr_prerender_payload_input() {
  payload_json=${1-}
  if [ -n "${BLOG_NOSTR_PRERENDER_PAYLOAD_FILE:-}" ] && [ -f "$BLOG_NOSTR_PRERENDER_PAYLOAD_FILE" ]; then
    cat "$BLOG_NOSTR_PRERENDER_PAYLOAD_FILE"
  else
    printf '%s\n' "$payload_json"
  fi
}

blog_nostr_prerender_signature() {
  payload_json=${1-}
  signature_payload=$(blog_nostr_prerender_payload_input "$payload_json" | jq -c 'del(.prerender_signature)' 2>/dev/null || blog_nostr_prerender_payload_input "$payload_json")
  printf '%s' "$signature_payload" | cksum | awk '{ printf "%s-%s\n", $1, $2 }'
}

blog_nostr_prerender_attrs() {
  payload_json=${1-}
  signature=$(blog_nostr_prerender_signature "$payload_json")
  printf ' data-prerender-painted="true" data-prerender-signature="%s"' "$signature"
}

blog_nostr_prerender_title() {
  payload_json=${1-}
  fallback=${2-Untitled}
  title=$(blog_nostr_prerender_payload_input "$payload_json" | jq -r '(.state.title // .nav_title // "") | tostring' 2>/dev/null || printf '')
  if [ -n "$title" ]; then
    printf '%s\n' "$title"
  else
    printf '%s\n' "$fallback"
  fi
}

blog_nostr_prerender_description() {
  payload_json=${1-}
  blog_nostr_prerender_payload_input "$payload_json" | jq -r '(.state.description // .state.content // "") | tostring' 2>/dev/null || printf ''
}

blog_nostr_page_component_command_path() {
  if [ -n "${SCRIPT_DIR:-}" ] && [ -x "$SCRIPT_DIR/gazeta-lodestone-components" ]; then
    printf '%s\n' "$SCRIPT_DIR/gazeta-lodestone-components"
    return 0
  fi
  if [ -n "${blog_site_root:-}" ] && [ -x "$blog_site_root/cgi/gazeta-lodestone-components" ]; then
    printf '%s\n' "$blog_site_root/cgi/gazeta-lodestone-components"
    return 0
  fi
  return 1
}

blog_nostr_page_render_component_html() {
  component_name=${1-}
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  payload_json=${3-}
  fallback_body=${4-}
  [ -n "$component_name" ] || {
    printf '%s' "$fallback_body"
    return 0
  }
  component_command=$(blog_nostr_page_component_command_path 2>/dev/null || printf '')
  [ -n "$component_command" ] || {
    printf '%s' "$fallback_body"
    return 0
  }
  payload_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-component-payload.XXXXXX")
  printf '%s\n' "$payload_json" > "$payload_tmp"
  prev_prerender_payload_file=${BLOG_NOSTR_PRERENDER_PAYLOAD_FILE-}
  BLOG_NOSTR_PRERENDER_PAYLOAD_FILE=$payload_tmp
  export BLOG_NOSTR_PRERENDER_PAYLOAD_FILE
  component_payload=$(
    jq -cn --arg name "$component_name" --arg page_type "$page_type" --arg body "$fallback_body" '{
      name: $name,
      attrs: { page_type: $page_type },
      frontmatter: { page_type: $page_type },
      body: $body
    }' 2>/dev/null || printf ''
  )
  rendered_html=''
  if [ -n "$component_payload" ]; then
    rendered_html=$(printf '%s\n' "$component_payload" | "$component_command" 2>/dev/null || printf '')
  fi
  rm -f "$payload_tmp"
  if [ -n "$prev_prerender_payload_file" ]; then
    BLOG_NOSTR_PRERENDER_PAYLOAD_FILE=$prev_prerender_payload_file
    export BLOG_NOSTR_PRERENDER_PAYLOAD_FILE
  else
    unset BLOG_NOSTR_PRERENDER_PAYLOAD_FILE
  fi
  if [ -n "$rendered_html" ]; then
    printf '%s' "$rendered_html"
    return 0
  fi
  printf '%s' "$fallback_body"
}

blog_nostr_prerender_inline_html_from_text() {
  inline_text=${1-}
  printf '%s\n' "$inline_text" | jq -Rrs '
    def h:
      tostring
      | gsub("&"; "&amp;")
      | gsub("<"; "&lt;")
      | gsub(">"; "&gt;")
      | gsub("\""; "&quot;")
      | gsub("'"'"'"; "&#39;");
    def md_inline:
      tostring
      | h
      | gsub("\\[(?<label>[^\\]]+)\\]\\((?<href>[^)]+)\\)"; "<a href=\"\(.href)\">\(.label)</a>");
    tostring
    | gsub("^\\s+|\\s+$"; "")
    | if length > 0 then md_inline else "" end
  ' 2>/dev/null || printf ''
}

blog_nostr_prerender_list_html() {
  payload_json=${1-}
  if command -v python3 >/dev/null 2>&1; then
    payload_file=${BLOG_NOSTR_PRERENDER_PAYLOAD_FILE-}
    cleanup_payload_file=false
    if [ -z "$payload_file" ] || [ ! -f "$payload_file" ]; then
      payload_file=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-list-payload.XXXXXX")
      printf '%s\n' "$payload_json" > "$payload_file"
      cleanup_payload_file=true
    fi
    if python3 - "$payload_file" <<'PY'
import html
import json
import re
import sys

path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception:
    sys.exit(1)

state = payload.get("state") if isinstance(payload, dict) else {}
if not isinstance(state, dict):
    state = {}

def text(value):
    return "" if value is None else str(value)

page_slug = text(payload.get("slug") if isinstance(payload, dict) else state.get("slug"))

def md_inline(value):
    escaped = html.escape(text(value), quote=True)
    def link_repl(match):
        label = match.group(1)
        href = match.group(2)
        return '<a href="%s">%s</a>' % (href, label)
    escaped = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", link_repl, escaped)
    escaped = re.sub(r"\*([^*\n]+)\*", r"<em>\1</em>", escaped)
    return escaped

def md_inline_link_label(value):
    return md_inline(re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text(value)))

def has_markdown_link(value):
    return re.search(r"\[[^\]]+\]\([^)]+\)", text(value)) is not None

def external_post_url_link_html(url):
    url = text(url)
    if not url:
        return ""
    return (
        '<a class="list-entry-post-url-link" href="%s" title="Open linked post" aria-label="Open linked post">'
        '<svg class="list-entry-post-url-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 5h5v5M19 5l-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        '</a>'
    ) % html.escape(url, quote=True)

def marker_hash32(value):
    hash_value = 2166136261
    for char in text(value):
        hash_value ^= ord(char)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF
    hash_value ^= hash_value >> 16
    hash_value = (hash_value * 2246822507) & 0xFFFFFFFF
    hash_value ^= hash_value >> 13
    hash_value = (hash_value * 3266489909) & 0xFFFFFFFF
    hash_value ^= hash_value >> 16
    return hash_value & 0xFFFFFFFF

def marker_palette_swatches():
    return [
        {"hue": 8, "saturation": 56, "lightness": 88},
        {"hue": 28, "saturation": 58, "lightness": 87},
        {"hue": 48, "saturation": 56, "lightness": 88},
        {"hue": 68, "saturation": 52, "lightness": 88},
        {"hue": 92, "saturation": 50, "lightness": 87},
        {"hue": 116, "saturation": 52, "lightness": 86},
        {"hue": 138, "saturation": 48, "lightness": 87},
        {"hue": 160, "saturation": 46, "lightness": 88},
        {"hue": 184, "saturation": 52, "lightness": 87},
        {"hue": 206, "saturation": 56, "lightness": 87},
        {"hue": 226, "saturation": 54, "lightness": 88},
        {"hue": 246, "saturation": 50, "lightness": 88},
        {"hue": 266, "saturation": 52, "lightness": 88},
        {"hue": 286, "saturation": 52, "lightness": 88},
        {"hue": 306, "saturation": 54, "lightness": 88},
        {"hue": 326, "saturation": 52, "lightness": 88},
        {"hue": 346, "saturation": 54, "lightness": 88},
        {"hue": 18, "saturation": 50, "lightness": 89},
        {"hue": 58, "saturation": 48, "lightness": 89},
        {"hue": 108, "saturation": 46, "lightness": 88},
        {"hue": 168, "saturation": 44, "lightness": 89},
        {"hue": 198, "saturation": 48, "lightness": 89},
        {"hue": 238, "saturation": 46, "lightness": 89},
        {"hue": 278, "saturation": 46, "lightness": 89},
    ]

def circular_hue_distance(a, b):
    distance = abs(float(a) - float(b)) % 360
    return 360 - distance if distance > 180 else distance

def marker_tokens(value):
    tokens = []
    seen = set()
    for marker in text(value).split(","):
        marker = re.sub(r"\s+", " ", marker).strip()
        if marker and marker not in seen:
            seen.add(marker)
            tokens.append(marker)
    return tokens

def unique_marker_values(entries):
    seen = set()
    values = []
    for entry in entries:
        for marker in marker_tokens(entry.get("marker")):
            if marker in seen:
                continue
            seen.add(marker)
            values.append(marker)
    return values

def build_marker_color_map(entries):
    markers = unique_marker_values(entries)
    palette = marker_palette_swatches()
    if not markers or not palette:
        return {}
    markers.sort(key=lambda marker: (marker_hash32(marker), marker.lower(), marker))
    used = set()
    color_map = {}
    for marker in markers:
        marker_hash = marker_hash32(marker)
        desired_hue = marker_hash % 360
        best_index = -1
        best_score = -1000000000
        for index, swatch in enumerate(palette):
            if index in used:
                continue
            min_separation = 180
            for color in color_map.values():
                min_separation = min(min_separation, circular_hue_distance(swatch["hue"], color["hue"]))
            desired_score = 180 - circular_hue_distance(swatch["hue"], desired_hue)
            score = (min_separation * 4) + (desired_score * 0.55)
            if score > best_score:
                best_score = score
                best_index = index
        if best_index < 0:
            best_index = marker_hash % len(palette)
        used.add(best_index)
        color_map[marker] = palette[best_index]
    return color_map

def marker_color_from_text(marker, color_map):
    marker = text(marker)
    if marker and marker in color_map:
        return color_map[marker]
    palette = marker_palette_swatches()
    return palette[marker_hash32(marker) % len(palette)] if palette else {"hue": 220, "saturation": 56, "lightness": 90}

def marker_style(marker, color_map):
    color = marker_color_from_text(marker, color_map)
    return "--marker-pill-h:%d;--marker-pill-s:%d%%;--marker-pill-l:%d%%;" % (
        color["hue"],
        color["saturation"],
        color["lightness"],
    )

def entry_key(entry):
    for key in ("_list_entry_id", "_public_entry_id", "_uid"):
        value = text(entry.get(key))
        if value:
            return value
    return ""

def entry_href_attr(entry):
    url = text(entry.get("post_url"))
    if not url:
        return ""
    return ' data-list-entry-href="%s"' % html.escape(url, quote=True)

def linked_text(label, url, class_name):
    url = text(url)
    if url:
        if has_markdown_link(label):
            return '<span class="%s">%s</span>%s' % (
                class_name,
                md_inline(label),
                external_post_url_link_html(url),
            )
        return '<a class="%s is-post-url-linked" href="%s" title="Open linked post">%s</a>' % (
            class_name,
            html.escape(url, quote=True),
            md_inline_link_label(label) or html.escape(url, quote=True),
        )
    return '<span class="%s">%s</span>' % (class_name, md_inline(label))

def marker_pills(entry, show, color_map, hidden_markers=None):
    if not show:
        return ""
    markers = marker_tokens(entry.get("marker"))
    if hidden_markers:
        markers = [marker for marker in markers if marker not in hidden_markers]
    if not markers:
        return ""
    return '<span class="list-entry-marker-pills">%s</span>' % "".join(
        '<span class="list-entry-marker-pill" style="%s">%s</span>' % (
            marker_style(marker, color_map),
            html.escape(marker, quote=True),
        )
        for marker in markers
    )

def marker_filter_html(entries, show, default_markers_raw, color_map):
    if not show:
        return ""
    markers = unique_marker_values(entries)
    if not markers:
        return ""
    markers = sorted(markers, key=lambda marker: marker.lower())
    defaults = set(marker for marker in marker_tokens(default_markers_raw) if marker in markers)
    tooltip = "Click to filter. Cmd-click to multi-select. Alt-click to filter out. Unselect all filters to show all."
    parts = ['<section class="list-marker-filters" aria-label="Marker filters"><div class="list-marker-filters-row">']
    for marker in markers:
        cls = "list-marker-filter-pill"
        if marker in defaults:
            cls += " is-include"
        parts.append(
            '<button type="button" class="%s" data-marker-filter-action="toggle" data-marker-filter-value="%s" title="%s" aria-label="%s" style="%s">%s</button>' % (
                cls,
                html.escape(marker, quote=True),
                html.escape(tooltip, quote=True),
                html.escape(marker + ". " + tooltip, quote=True),
                marker_style(marker, color_map),
                html.escape(marker, quote=True),
            )
        )
    parts.append("</div></section>")
    return "".join(parts)

def apply_default_marker_filters(entries, default_markers_raw):
    available = set(unique_marker_values(entries))
    include = set(marker for marker in marker_tokens(default_markers_raw) if marker in available)
    if not include:
        return list(entries)
    keep = {}
    depth_stack = []
    parent_index_by_row = []
    for index, entry in enumerate(entries):
        try:
            depth = int(entry.get("depth") or 0)
        except Exception:
            depth = 0
        if depth < 0:
            depth = 0
        if depth > len(depth_stack):
            depth = len(depth_stack)
        if depth < len(depth_stack):
            depth_stack = depth_stack[:depth]
        parent_index_by_row.append(depth_stack[depth - 1] if depth > 0 else -1)
        if depth == len(depth_stack):
            depth_stack.append(index)
        else:
            depth_stack[depth] = index
            depth_stack = depth_stack[:depth + 1]
        if any(marker in include for marker in marker_tokens(entry.get("marker"))):
            keep[index] = True
            parent = parent_index_by_row[index]
            while parent >= 0:
                keep[parent] = True
                parent = parent_index_by_row[parent]
    return [entry for index, entry in enumerate(entries) if keep.get(index)]

def selected_default_marker_set(entries, show_marker_filters, default_markers_raw):
    if not show_marker_filters:
        return set()
    available = set(unique_marker_values(entries))
    return set(marker for marker in marker_tokens(default_markers_raw) if marker in available)

def date_pill(entry, group_by, section_label):
    date = text(entry.get("date"))
    if not date or (group_by == "year" and date == section_label):
        return ""
    return '<span class="list-entry-date-pill">%s</span>' % html.escape(date, quote=True)

def list_vote_arrow_svg(direction):
    path = "M12 20 4.5 10.8h4.25V4h6.5v6.8h4.25L12 20Z" if direction == "down" else "M12 4 19.5 13.2h-4.25V20h-6.5v-6.8H4.5L12 4Z"
    return '<svg class="list-entry-vote-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="%s" fill="currentColor"/></svg>' % path

def vote_controls(entry, allow_votes):
    entry_id = entry_key(entry)
    if not allow_votes or not entry_id:
        return ""
    try:
        score = int(float(entry.get("list_score") or 0))
    except Exception:
        score = 0
    escaped_id = html.escape(entry_id, quote=True)
    upvote_only = page_slug == "reading-list"
    control_class = "list-entry-vote-controls is-upvote-only" if upvote_only else "list-entry-vote-controls"
    downvote = "" if upvote_only else (
        '<button type="button" class="list-entry-vote-btn is-downvote" data-list-public-action="vote" data-list-entry-id="%s" data-list-vote-value="-1" aria-label="Downvote" disabled aria-disabled="true">%s</button>'
        % (escaped_id, list_vote_arrow_svg("down"))
    )
    return (
        '<span class="%s" data-list-entry-id="%s" aria-label="Entry score" title="Sign in to vote.">'
        '<button type="button" class="list-entry-vote-btn is-upvote" data-list-public-action="vote" data-list-entry-id="%s" data-list-vote-value="1" aria-label="Upvote" disabled aria-disabled="true">%s</button>'
        '<span class="list-entry-score">%s</span>'
        '%s'
        '</span>'
    ) % (
        control_class,
        escaped_id,
        escaped_id,
        list_vote_arrow_svg("up"),
        html.escape(str(score), quote=True),
        downvote,
    )

def normalize_vote_value(value):
    try:
        numeric = float(value or 0)
    except Exception:
        numeric = 0
    if numeric > 0:
        return 1
    if numeric < 0:
        return -1
    return 0

def vote_action_rank(value):
    normalized = normalize_vote_value(value)
    if normalized > 0:
        return 1
    if normalized < 0:
        return -1
    return 0

def sort_entries_for_votes(entries, allow_votes):
    if not allow_votes:
        return list(entries)
    if len(entries) <= 1:
        return list(entries)
    try:
        all_top_level = all(max(0, int(entry.get("depth") or 0)) == 0 for entry in entries)
    except Exception:
        all_top_level = False
    if not all_top_level:
        return list(entries)
    def sort_key(item):
        index, entry = item
        try:
            score = float(entry.get("list_score") or 0)
        except Exception:
            score = 0
        try:
            latest_at = float(entry.get("list_latest_vote_created_at") or 0)
        except Exception:
            latest_at = 0
        latest_vote = normalize_vote_value(entry.get("list_latest_vote"))
        return (-score, -vote_action_rank(latest_vote), -latest_at if latest_vote > 0 else latest_at if latest_vote < 0 else 0, index)
    return [entry for _index, entry in sorted(enumerate(entries), key=sort_key)]

def row_html(entry, group_by="", section_label="", show_markers=False, gallery=False, color_map=None, allow_votes=False, row_index=0, hidden_default_markers=None):
    line = text(entry.get("markdown"))
    description = text(entry.get("description"))
    image = text(entry.get("image_url"))
    post_url = text(entry.get("post_url"))
    try:
        depth = int(entry.get("depth") or 0)
    except Exception:
        depth = 0
    if depth < 0:
        depth = 0
    markers = marker_pills(entry, show_markers, color_map or {}, hidden_default_markers or set())
    date = date_pill(entry, group_by, section_label)
    meta = ""
    if markers or date:
        meta = '<span class="list-entry-meta-right"><span class="list-entry-meta-pills">%s%s</span></span>' % (markers, date)
    icon = ""
    if gallery and image:
        icon = '<img class="list-entry-list-icon" src="%s" alt="" loading="eager" decoding="async" fetchpriority="high">' % html.escape(image, quote=True)
    desc = ""
    if gallery and description:
        desc = '<span class="list-entry-description-inline">%s</span>' % md_inline(description)
    key = html.escape(entry_key(entry), quote=True)
    votes = vote_controls(entry, allow_votes)
    first_line_class = "list-entry-first-line" + (" has-votes" if votes else "")
    row_class = "list-entry-line list-depth-%d" % depth
    if row_index % 2 == 1:
        row_class += " is-row-highlight"
    return (
        '<li class="%s" data-list-entry-id="%s" style="--list-depth:%d;"%s>'
        '<div class="%s">%s<span class="list-entry-main-inline">%s%s%s</span>%s</div></li>'
    ) % (row_class, key, depth, entry_href_attr(entry), first_line_class, votes, icon, linked_text(line, post_url, "list-entry-markdown"), desc, meta)

def tile_html(entry):
    line = text(entry.get("markdown"))
    description = text(entry.get("description"))
    image = text(entry.get("image_url"))
    post_url = text(entry.get("post_url"))
    date = text(entry.get("date"))
    image_html = ""
    if image:
        image_html = '<div class="list-tile-image-wrap"><img class="list-tile-image" src="%s" alt="" loading="eager" decoding="async" fetchpriority="high"></div>' % html.escape(image, quote=True)
    date_html = ""
    if date:
        date_html = '<div class="list-tile-date">%s</div>' % html.escape(date, quote=True)
    desc = ""
    if description:
        desc = '<span class="list-tile-description">%s</span>' % md_inline(description)
    return '<li class="list-tile"%s><div class="list-tile-content">%s%s</div><div class="list-tile-main"><div class="list-tile-label">%s%s</div></div></li>' % (
        entry_href_attr(entry), image_html, date_html, linked_text(line, post_url, "list-tile-text"), desc
    )

def group_label(entry, group_by):
    if group_by == "year":
        return text(entry.get("date")) or "Unknown"
    if group_by == "first_letter":
        return (text(entry.get("markdown"))[:1].upper() or "#")
    if group_by == "month":
        return (text(entry.get("date"))[:7] or "Unknown")
    if group_by == "marker":
        marker = text(entry.get("marker")).split(",")[0]
        return re.sub(r"\s+", " ", marker).strip() or "Unmarked"
    return ""

gallery = text(payload.get("page_type") if isinstance(payload, dict) else "") == "icon-gallery"
raw_view = text(state.get("view_mode"))
view = "tile" if (gallery and not raw_view) or raw_view == "tile" else "list"
group_by = text(state.get("group_by"))
show_markers = state.get("show_markers") is True
show_marker_filters = state.get("show_marker_filters") is True
allow_votes = state.get("allow_signed_in_votes") is True
default_markers = text(state.get("default_markers"))
source_entries = state.get("elements") if isinstance(state.get("elements"), list) else state.get("entries")
if not isinstance(source_entries, list):
    source_entries = []
entries = [
    entry for entry in source_entries
    if isinstance(entry, dict)
    and text(entry.get("type") or "entry") == "entry"
    and text(entry.get("markdown"))
]
marker_color_by_token = build_marker_color_map(entries)
display_entries = apply_default_marker_filters(entries, default_markers) if show_marker_filters else entries
hidden_default_markers = selected_default_marker_set(entries, show_marker_filters, default_markers)

parts = []
if state.get("allow_signed_in_submissions") is True:
    parts.append('<section class="list-public-submit" aria-label="Add list entry"><div class="list-public-submit-inline"><div class="list-public-submit-reveal" aria-hidden="true"><div class="list-public-submit-fields"><input type="text" id="list-public-submit-title" placeholder="New entry"><button type="button" class="list-admin-primary-btn list-public-submit-add" data-list-public-action="submit">Add</button></div></div><button type="button" class="list-public-submit-toggle" data-list-public-action="expand-submit" aria-label="Add entry" title="Add entry" aria-expanded="false"><span class="list-public-submit-toggle-icon" aria-hidden="true">+</span></button></div></section>')

parts.append(marker_filter_html(entries, show_marker_filters, default_markers, marker_color_by_token))

after = ""
if text(state.get("extras_after")):
    after = '<section class="nostr-page-extra nostr-page-extra-after"><p>%s</p></section>' % md_inline(state.get("extras_after"))

if not entries:
    parts.append('<p class="list-page-empty-state">No content yet.</p>')
elif not display_entries:
    parts.append('<p class="list-page-empty-state">No entries match selected marker filters.</p>')
elif group_by in ("year", "first_letter", "month", "marker"):
    grouped_entries = []
    group_index = {}
    for entry in display_entries:
        label = group_label(entry, group_by)
        if label not in group_index:
            group_index[label] = len(grouped_entries)
            grouped_entries.append([label, []])
        grouped_entries[group_index[label]][1].append(entry)
    for label, bucket in grouped_entries:
        parts.append('<section class="list-year-group"><div class="list-year-head"><h3 class="list-year-heading">%s</h3></div>' % html.escape(label, quote=True))
        if view == "tile":
            parts.append('<ul class="list-tiles">%s</ul>' % "".join(tile_html(entry) for entry in bucket))
        else:
            parts.append('<ul class="list-entries">')
            for row_index, entry in enumerate(sort_entries_for_votes(bucket, allow_votes)):
                parts.append(row_html(entry, group_by, label, show_markers, gallery, marker_color_by_token, allow_votes, row_index, hidden_default_markers))
            parts.append("</ul>")
        parts.append("</section>")
elif view == "tile":
    parts.append('<ul class="list-tiles">%s</ul>' % "".join(tile_html(entry) for entry in display_entries))
else:
    parts.append('<ul class="list-entries">%s</ul>' % "".join(row_html(entry, "", "", show_markers, gallery, marker_color_by_token, allow_votes, row_index, hidden_default_markers) for row_index, entry in enumerate(sort_entries_for_votes(display_entries, allow_votes))))

if after:
    parts.append(after)
print("".join(parts))
PY
    then
      [ "$cleanup_payload_file" = "true" ] && rm -f "$payload_file"
      return 0
    fi
    [ "$cleanup_payload_file" = "true" ] && rm -f "$payload_file"
  fi
  blog_nostr_prerender_payload_input "$payload_json" | jq -r '
    def h:
      tostring
      | gsub("&"; "&amp;")
      | gsub("<"; "&lt;")
      | gsub(">"; "&gt;")
      | gsub("\""; "&quot;")
      | gsub("'"'"'"; "&#39;");
    def md_inline:
      h
      | gsub("\\[(?<label>[^\\]]+)\\]\\((?<href>[^)]+)\\)"; "<a href=\"\(.href)\">\(.label)</a>")
      | gsub("\\*(?<em>[^*\\n]+)\\*"; "<em>\(.em)</em>");
    def md_inline_link_label:
      gsub("\\[(?<label>[^\\]]+)\\]\\([^)]+\\)"; .label)
      | md_inline;
    def has_markdown_link:
      test("\\[[^\\]]+\\]\\([^)]+\\)");
    def external_post_url_link($url):
      "<a class=\"list-entry-post-url-link\" href=\"" + ($url | h) + "\" title=\"Open linked post\" aria-label=\"Open linked post\">" +
      "<svg class=\"list-entry-post-url-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M14 5h5v5M19 5l-8 8M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>" +
      "</a>";
    def entry_key($e):
      (($e._list_entry_id // $e._public_entry_id // $e._uid // "") | tostring);
    def entry_href_attr($e):
      (($e.post_url // "") | tostring) as $u
      | if ($u | length) > 0 then " data-list-entry-href=\"" + ($u | h) + "\"" else "" end;
    def linked_text($text; $url; $class):
      ($url // "" | tostring) as $u
      | if ($u | length) > 0 then
          if ($text | has_markdown_link) then
            "<span class=\"" + $class + "\">" + ($text | md_inline) + "</span>" + external_post_url_link($u)
          else
            ($text | md_inline_link_label) as $label
            | "<a class=\"" + $class + " is-post-url-linked\" href=\"" + ($u | h) + "\" title=\"Open linked post\">" + (if ($label | length) > 0 then $label else ($u | h) end) + "</a>"
          end
        else
          "<span class=\"" + $class + "\">" + ($text | md_inline) + "</span>"
        end;
    def marker_pills($e; $show):
      if $show then
        (($e.marker // "") | tostring | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))) as $markers
        | if ($markers | length) > 0 then
            "<span class=\"list-entry-marker-pills\">" +
            ($markers | map("<span class=\"list-entry-marker-pill\">" + (. | h) + "</span>") | join("")) +
            "</span>"
          else "" end
      else "" end;
    def date_pill($e; $group_by; $section_label):
      (($e.date // "") | tostring) as $date
      | if ($date | length) == 0 or ($group_by == "year" and $date == $section_label) then ""
        else "<span class=\"list-entry-date-pill\">" + ($date | h) + "</span>"
        end;
    def row_html($e; $group_by; $section_label; $show_markers; $gallery):
      (($e.markdown // "") | tostring) as $line
      | (($e.description // "") | tostring) as $description
      | (($e.image_url // "") | tostring) as $image
      | (($e.post_url // "") | tostring) as $post_url
      | (($e.depth // 0) | tonumber? // 0) as $depth
      | entry_key($e) as $key
      | marker_pills($e; $show_markers) as $markers
      | date_pill($e; $group_by; $section_label) as $date
      | (if ($markers + $date | length) > 0 then
          "<span class=\"list-entry-meta-right\"><span class=\"list-entry-meta-pills\">" + $markers + $date + "</span></span>"
        else "" end) as $meta
      | (if $gallery and ($image | length) > 0 then
          "<img class=\"list-entry-list-icon\" src=\"" + ($image | h) + "\" alt=\"\" loading=\"eager\" decoding=\"async\" fetchpriority=\"high\">"
        else "" end) as $icon
      | (if $gallery and ($description | length) > 0 then
          "<span class=\"list-entry-description-inline\">" + ($description | md_inline) + "</span>"
        else "" end) as $desc
      | "<li class=\"list-entry-line list-depth-" + ($depth | tostring) + "\" data-list-entry-id=\"" + ($key | h) + "\" style=\"--list-depth:" + ($depth | tostring) + ";\"" + entry_href_attr($e) + ">" +
        "<div class=\"list-entry-first-line\"><span class=\"list-entry-main-inline\">" + $icon + linked_text($line; $post_url; "list-entry-markdown") + $desc + "</span>" + $meta + "</div></li>";
    def tile_html($e):
      (($e.markdown // "") | tostring) as $line
      | (($e.description // "") | tostring) as $description
      | (($e.image_url // "") | tostring) as $image
      | (($e.post_url // "") | tostring) as $post_url
      | (($e.date // "") | tostring) as $date
      | "<li class=\"list-tile\"" + entry_href_attr($e) + "><div class=\"list-tile-content\">" +
        (if ($image | length) > 0 then "<div class=\"list-tile-image-wrap\"><img class=\"list-tile-image\" src=\"" + ($image | h) + "\" alt=\"\" loading=\"eager\" decoding=\"async\" fetchpriority=\"high\"></div>" else "" end) +
        (if ($date | length) > 0 then "<div class=\"list-tile-date\">" + ($date | h) + "</div>" else "" end) +
        "</div><div class=\"list-tile-main\"><div class=\"list-tile-label\">" +
        linked_text($line; $post_url; "list-tile-text") +
        (if ($description | length) > 0 then "<span class=\"list-tile-description\">" + ($description | md_inline) + "</span>" else "" end) +
        "</div></div></li>";
    def group_label($e; $group_by):
      if $group_by == "year" then (($e.date // "Unknown") | tostring | if length > 0 then . else "Unknown" end)
      elif $group_by == "first_letter" then (($e.markdown // "#") | tostring | .[0:1] | ascii_upcase | if length > 0 then . else "#" end)
      elif $group_by == "month" then (($e.date // "Unknown") | tostring | .[0:7] | if length > 0 then . else "Unknown" end)
      elif $group_by == "marker" then (($e.marker // "Unmarked") | tostring | split(",")[0] | gsub("^\\s+|\\s+$"; "") | if length > 0 then . else "Unmarked" end)
      else "" end;
    (.state // {}) as $s
    | ((.page_type // "") == "icon-gallery") as $gallery
    | (($s.view_mode // "") | tostring) as $raw_view
    | (if $gallery and ($raw_view | length) == 0 then "tile" elif $raw_view == "tile" then "tile" else "list" end) as $view
    | (($s.group_by // "") | tostring) as $group_by
    | (($s.show_markers // false) == true) as $show_markers
    | (($s.elements // $s.entries // []) | map(select(((.type // "entry") | tostring) == "entry" and (((.markdown // "") | tostring | length) > 0)))) as $entries
    | (if (($s.allow_signed_in_submissions // false) == true) then
        "<section class=\"list-public-submit\" aria-label=\"Add list entry\"><div class=\"list-public-submit-inline\"><div class=\"list-public-submit-reveal\" aria-hidden=\"true\"><div class=\"list-public-submit-fields\"><input type=\"text\" id=\"list-public-submit-title\" placeholder=\"New entry\"><button type=\"button\" class=\"list-admin-primary-btn list-public-submit-add\" data-list-public-action=\"submit\">Add</button></div></div><button type=\"button\" class=\"list-public-submit-toggle\" data-list-public-action=\"expand-submit\" aria-label=\"Add entry\" title=\"Add entry\" aria-expanded=\"false\"><span class=\"list-public-submit-toggle-icon\" aria-hidden=\"true\">+</span></button></div></section>"
      else "" end) as $submit
    | (if (($s.extras_after // "") | tostring | length) > 0 then
        "<section class=\"nostr-page-extra nostr-page-extra-after\"><p>" + (($s.extras_after // "") | md_inline) + "</p></section>"
      else "" end) as $after
    | if ($entries | length) == 0 then
        $submit + "<p class=\"list-page-empty-state\">No content yet.</p>" + $after
      elif (["year", "first_letter", "month", "marker"] | index($group_by)) then
        $submit + (
          reduce $entries[] as $e ({html:"", label:"__initial__", open:false};
            (group_label($e; $group_by)) as $label
            | if .label != $label then
                .html = (.html + (if .open then (if $view == "tile" then "</ul></section>" else "</ul></section>" end) else "" end) + "<section class=\"list-year-group\"><div class=\"list-year-head\"><h3 class=\"list-year-heading\">" + ($label | h) + "</h3></div>" + (if $view == "tile" then "<ul class=\"list-tiles\">" else "<ul class=\"list-entries\">" end))
                | .label = $label
                | .open = true
              else . end
            | .html = (.html + (if $view == "tile" then tile_html($e) else row_html($e; $group_by; $label; $show_markers; $gallery) end))
          )
          | .html + "</ul></section>"
        ) + $after
      elif $view == "tile" then
        $submit + "<ul class=\"list-tiles\">" + ($entries | map(tile_html(.)) | join("")) + "</ul>" + $after
      else
        $submit + "<ul class=\"list-entries\">" + ($entries | map(row_html(.; ""; ""; $show_markers; $gallery)) | join("")) + "</ul>" + $after
      end
  ' 2>/dev/null || printf '<p class="list-page-empty-state">No content yet.</p>\n'
}

blog_nostr_prerender_nip23_html() {
  payload_json=${1-}
  blog_nostr_prerender_payload_input "$payload_json" | jq -r '
    def h:
      tostring | gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;") | gsub("\""; "&quot;") | gsub("'"'"'"; "&#39;");
    def md_inline:
      tostring
      | h
      | gsub("\\[(?<label>[^\\]]+)\\]\\((?<href>[^)]+)\\)"; "<a href=\"\(.href)\">\(.label)</a>");
    def md_block:
      tostring as $raw
      | if ($raw | gsub("\\s"; "") | length) == 0 then ""
        else ($raw | split("\n\n") | map("<p>" + (md_inline | gsub("\n"; "<br>")) + "</p>") | join(""))
        end;
    def money_number($v):
      ($v | tostring | tonumber? // 0);
    def money_text($v):
      ((money_number($v) * 100 | round) / 100 | tostring);
    def price_label($price; $currency):
      ($price | tostring) as $raw
      | if ($raw | length) == 0 then ""
        else (money_number($raw)) as $value
        | (($currency // "USD") | tostring | ascii_upcase) as $curr
        | if $value == 0 then "Free"
          elif $curr == "USD" then "$" + money_text($value)
          else money_text($value) + " " + ($curr | h)
          end
        end;
    def resolved_product_image($s):
      ((($s.image_url // $s.thumbnail_url // "") | tostring));
    (.state // {}) as $s
    | (($s.content // "") | md_block) as $main
    | (($s.extras_after // "") | md_block) as $after
    | (price_label(($s.price // ""); ($s.currency // "USD"))) as $display_price
    | (resolved_product_image($s)) as $product_image
    | (if (($s.product_enabled // false) == true or (($s.price // "") | tostring | length) > 0) then
        "<section class=\"nip23-product-card" +
          (if ($product_image | length) > 0 then " has-image" else "" end) +
          (if (($s.product_type // "software") | tostring | ascii_downcase) == "merch" then " merch-product-page" else "" end) +
          "\" aria-label=\"Product checkout\">" +
          (if ($product_image | length) > 0 then "<div class=\"nip23-product-card-media\"><img class=\"nip23-product-card-image\" src=\"" + ($product_image | h) + "\" alt=\"" + (($s.title // "Product image") | h) + "\" loading=\"eager\" decoding=\"async\"></div>" else "" end) +
          "<div class=\"nip23-product-card-main\"><div class=\"nip23-product-card-head\"><strong>Checkout</strong><span class=\"nip23-product-type-pill\">" + (($s.product_type // "software") | h) + "</span></div>" +
          (if ($display_price | length) > 0 then "<div class=\"nip23-product-page-price\"><span>Price</span><strong>" + ($display_price | h) + "</strong></div>" else "" end) +
          "<div class=\"nip23-product-actions\"><button type=\"button\" class=\"nip23-product-btn nip23-product-btn-primary\" data-nip23-action=\"add-to-cart\">Add to Cart</button></div></div></section>"
      else "" end) as $product
    | $product + (if ($main | length) > 0 then "<article class=\"list-entry-markdown\">" + $main + "</article>" else "<p class=\"list-page-empty-state\">No content yet.</p>" end) +
      (if ($after | length) > 0 then "<section class=\"nostr-page-extra nostr-page-extra-after\">" + $after + "</section>" else "" end)
  ' 2>/dev/null || printf '<p class="list-page-empty-state">No content yet.</p>\n'
}

blog_nostr_prerender_blog_html() {
  payload_json=${1-}
  blog_nostr_prerender_payload_input "$payload_json" | jq -r '
    def h:
      tostring
      | gsub("&"; "&amp;")
      | gsub("<"; "&lt;")
      | gsub(">"; "&gt;")
      | gsub("\""; "&quot;")
      | gsub("'"'"'"; "&#39;");
    def md_inline:
      tostring
      | h
      | gsub("\\[(?<label>[^\\]]+)\\]\\((?<href>[^)]+)\\)"; "<a href=\"\(.href)\">\(.label)</a>");
    def md_block:
      tostring as $raw
      | if ($raw | gsub("\\s"; "") | length) == 0 then ""
        else ($raw | split("\n\n") | map("<p>" + (md_inline | gsub("\n"; "<br>")) + "</p>") | join(""))
        end;
    (.state // {}) as $s
    | (($s.extras_after // "") | md_block) as $after
    | if ($after | length) > 0 then
        "<section class=\"nostr-page-extra nostr-page-extra-after\">" + $after + "</section>"
      else
        ""
      end
  ' 2>/dev/null || printf ''
}

blog_nostr_page_prerender_content_html() {
  payload_json=${1-}
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  case "$page_type" in
    contact)
      blog_nostr_prerender_contact_html "$payload_json"
      ;;
    nip23)
      blog_nostr_prerender_nip23_html "$payload_json"
      ;;
    blog)
      blog_nostr_prerender_blog_html "$payload_json"
      ;;
    public-ranking)
      blog_nostr_prerender_public_ranking_html "$payload_json"
      ;;
    overworld)
      blog_nostr_prerender_overworld_html
      ;;
    list|icon-gallery|software-gallery)
      blog_nostr_prerender_list_html "$payload_json"
      ;;
    *)
      printf ''
      ;;
  esac
}

blog_nostr_page_prerender_projection_json() {
  payload_json=${1-}
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  description_text=$(blog_nostr_prerender_description "$payload_json")
  description_html=$(blog_nostr_prerender_inline_html_from_text "$description_text")
  content_html=$(blog_nostr_page_render_component_html "gazeta-nostr-page-content" "$page_type" "$payload_json" "")
  description_attrs=''
  content_attrs=''
  if [ -z "$description_html" ]; then
    description_attrs=' hidden'
  fi
  if [ -z "$content_html" ]; then
    content_attrs=' hidden'
  fi
  jq -cn \
    --arg description_html "$description_html" \
    --arg description_attrs "$description_attrs" \
    --arg content_html "$content_html" \
    --arg content_attrs "$content_attrs" \
    '{
      description_html: $description_html,
      description_attrs: $description_attrs,
      content_html: $content_html,
      content_attrs: $content_attrs
    }'
}

blog_nostr_page_attach_prerender_projection() {
  payload_json=${1-}
  page_type=${2-}
  projection_json=$(blog_nostr_page_prerender_projection_json "$payload_json" "$page_type")
  printf '%s\n' "$payload_json" | jq -c --argjson prerender "$projection_json" '. + {prerender: $prerender}' 2>/dev/null || printf '%s\n' "$payload_json"
}

blog_nostr_prerender_contact_html() {
  payload_json=${1-}
  contact_video_chat_html=$(blog_nostr_prerender_contact_video_chat_html)
  contact_secure_chat_login_gate_html=$(blog_nostr_prerender_contact_secure_chat_login_gate_html)
  blog_nostr_prerender_payload_input "$payload_json" | jq -r --arg video_chat_html "$contact_video_chat_html" --arg secure_chat_login_gate_html "$contact_secure_chat_login_gate_html" '
    def h:
      tostring | gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;") | gsub("\""; "&quot;") | gsub("'"'"'"; "&#39;");
    def transport($v):
      (($v // "") | tostring) as $raw
      | (($raw | ascii_downcase | gsub("[^a-z0-9]+"; "")) as $key
        | if ($key == "lightning" or $key == "lightningaddress" or $key == "ln" or $key == "lud16") then "Zap" else $raw end);
    def qualifier_key($v):
      (($v // "") | tostring | gsub("^\\s+|\\s+$"; "") | ascii_downcase);
    def qualifier_label($v):
      (qualifier_key($v)) as $q
      | if $q == "" then ""
        elif $q == "preferred" then "Preferred"
        elif $q == "unpreferred" then "Not preferred"
        elif $q == "public" then "Public"
        elif $q == "primary" then "Primary"
        elif $q == "secondary" then "Secondary"
        elif $q == "emergency" then "Emergencies only"
        elif $q == "archive" then "Archived"
        else $q end;
    def value_html($row):
      (($row.value // "") | tostring) as $raw
      | (($row.transport // "") | tostring | ascii_downcase | gsub("[^a-z0-9]+"; "")) as $key
      | if (($key == "email") and ($raw | test("@"))) then "<a class=\"contact-value-link\" href=\"mailto:" + ($raw | h) + "\">" + ($raw | h) + "</a>"
        elif ($raw | test("^https?://")) then "<a class=\"contact-value-link\" href=\"" + ($raw | h) + "\">" + ($raw | h) + "</a>"
        elif ($key == "lightning" or $key == "lightningaddress" or $key == "ln" or $key == "lud16") then "<button type=\"button\" class=\"contact-value-link contact-zap-link\" data-contact-zap-open=\"true\" data-contact-zap-address=\"" + ($raw | ascii_downcase | h) + "\">" + ($raw | h) + "</button>"
        else ($raw | h | gsub("\n"; "<br>"))
        end;
    def secure_chat_panel:
      "<h2 id=\"secure-chat-title\" class=\"contact-section-heading\"><span>Secure Chat</span></h2>" +
      "<section class=\"secure-chat-panel\" aria-labelledby=\"secure-chat-title\">" +
      "<div class=\"secure-chat-head\">" + $secure_chat_login_gate_html + "</div>" +
      "</section>";
    def has_secure_chat_include($v):
      (($v // "") | tostring | test("\\{\\{[[:space:]]*secure-chat[[:space:]]*\\}\\}"; "i"));
    def profile_table($rows):
      "<div class=\"contact-profile-table-wrap\"><table class=\"contact-profile-table\"><tbody>" +
      ($rows | map((qualifier_key(.qualifier)) as $q | (qualifier_label(.qualifier)) as $ql | "<tr class=\"contact-profile-row\"><th class=\"contact-platform-cell\" scope=\"row\">" + (transport(.transport) | h) + "</th><td class=\"contact-value-cell\"><div class=\"contact-value-main\">" + value_html(.) + "</div>" + (if ($q | length) > 0 then "<span class=\"contact-qualifier-pill contact-qualifier-open\" data-qualifier=\"" + ($q | h) + "\">" + ($ql | h) + "</span>" else "" end) + "</td></tr>") | join("")) +
      "</tbody></table></div>";
    (.state // {}) as $s
    | (($s.rows // []) | map(select(((.transport // "") | tostring | length) > 0 and ((.value // "") | tostring | length) > 0))) as $rows
    | ($rows | map(select(((.qualifier // "") | tostring | ascii_downcase) != "archive"))) as $visible_rows
    | ($rows | map(select(((.qualifier // "") | tostring | ascii_downcase) == "archive"))) as $archived_rows
    | (if has_secure_chat_include($s.extras_after) then "" else secure_chat_panel end) as $chat
    | $chat + $video_chat_html + (if ($rows | length) == 0 then "<p class=\"list-page-empty-state\">No content yet.</p>"
      else
        (if ($visible_rows | length) > 0 then "<h2 class=\"contact-section-heading\"><span>Contact Information</span></h2>" + profile_table($visible_rows) else "" end) +
        (if ($archived_rows | length) > 0 then "<details class=\"contact-archived-group\"><summary class=\"contact-archived-toggle\"><span class=\"contact-archived-toggle-label\">Archived</span></summary>" + profile_table($archived_rows) + "</details>" else "" end)
      end)
  ' 2>/dev/null || printf '<p class="list-page-empty-state">No content yet.</p>\n'
}

blog_nostr_prerender_contact_video_chat_html() {
  if ! blog_plugin_enabled "video_chat"; then
    return 0
  fi

  contact_video_chat_public_rooms=$(blog_config_get "$blog_site_conf" video_chat_public_rooms 2>/dev/null || printf 'false')
  case "$contact_video_chat_public_rooms" in
    true) ;;
    *) contact_video_chat_public_rooms=false ;;
  esac
  contact_video_chat_rooms=$(blog_config_get "$blog_site_conf" video_chat_rooms 2>/dev/null || printf '')
  contact_video_chat_scheduled_rooms=$(blog_config_get "$blog_site_conf" video_chat_scheduled_rooms 2>/dev/null || printf '')
  contact_video_chat_schedule_now=$(blog_video_chat_schedule_now_epoch 2>/dev/null || printf '')
  contact_video_chat_active_rooms_json=$(blog_video_chat_public_rooms_json "$contact_video_chat_rooms" "$contact_video_chat_scheduled_rooms" "$contact_video_chat_schedule_now" 2>/dev/null || printf '[]')
  contact_video_chat_rooms_attr=$(printf '%s\n' "$contact_video_chat_active_rooms_json" | jq -r 'if type == "array" then map((. // "") | tostring) | join(",") else "" end | @html' 2>/dev/null || printf '')
  contact_video_chat_room_theme_images_json=$(blog_video_chat_room_theme_images_json "$contact_video_chat_rooms" "$contact_video_chat_scheduled_rooms" "$contact_video_chat_schedule_now" 2>/dev/null || printf '{}')
  contact_video_chat_room_theme_images_attr=$(printf '%s' "$contact_video_chat_room_theme_images_json" | jq -Rr '@html' 2>/dev/null || printf '{}')
  contact_video_chat_max=$(blog_config_get "$blog_site_conf" video_chat_participant_limit 2>/dev/null || printf '6')
  case "$contact_video_chat_max" in ''|*[!0-9]*) contact_video_chat_max=6 ;; esac
  if [ "$contact_video_chat_max" -lt 2 ]; then contact_video_chat_max=2; fi
  if [ "$contact_video_chat_max" -gt 24 ]; then contact_video_chat_max=24; fi
  blog_nostr_template_inner_html 'site/lodestone/templates/contact.stone.html' 'contact-video-chat-widget-template' | jq -Rs \
    --arg public_rooms "$contact_video_chat_public_rooms" \
    --arg room_list "$contact_video_chat_rooms_attr" \
    --arg room_theme_images "$contact_video_chat_room_theme_images_attr" \
    --arg max_participants "$contact_video_chat_max" \
    '
      gsub("__CONTACT_VIDEO_CHAT_PUBLIC_ROOMS__"; $public_rooms)
      | gsub("__CONTACT_VIDEO_CHAT_ROOM_LIST__"; $room_list)
      | gsub("__CONTACT_VIDEO_CHAT_ROOM_THEME_IMAGES__"; $room_theme_images)
      | gsub("__CONTACT_VIDEO_CHAT_MAX_PARTICIPANTS__"; $max_participants)
    ' -r 2>/dev/null || printf ''
}

blog_nostr_prerender_public_ranking_html() {
  payload_json=${1-}
  if command -v python3 >/dev/null 2>&1; then
    payload_file=${BLOG_NOSTR_PRERENDER_PAYLOAD_FILE-}
    cleanup_payload_file=false
    if [ -z "$payload_file" ] || [ ! -f "$payload_file" ]; then
      payload_file=$(mktemp "${TMPDIR:-/tmp}/blog-public-ranking-payload.XXXXXX")
      printf '%s\n' "$payload_json" > "$payload_file"
      cleanup_payload_file=true
    fi
    if python3 - "$payload_file" <<'PY'
import html
import json
import re
import sys

path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception:
    sys.exit(1)

state = payload.get("state") if isinstance(payload, dict) else {}
if not isinstance(state, dict):
    state = {}

def text(value):
    return "" if value is None else str(value)

def esc(value):
    return html.escape(text(value), quote=True)

def md_inline(value):
    escaped = esc(value)
    escaped = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda match: '<a href="%s">%s</a>' % (html.escape(match.group(2), quote=True), html.escape(match.group(1), quote=True)), escaped)
    escaped = re.sub(r"\*([^*\n]+)\*", r"<em>\1</em>", escaped)
    return escaped.replace("\n", "<br>")

def md_block(value):
    raw = text(value).strip()
    if not raw:
        return ""
    blocks = re.split(r"\n\s*\n", raw)
    out = []
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        out.append("<p>%s</p>" % "<br>".join(md_inline(line) for line in block.splitlines()))
    return "".join(out)

def metric_name(value):
    raw = text(value).strip().lower()
    return raw if raw in ("support", "enthusiasm", "intensity") else "momentum"

def metric_label(metric):
    if metric == "support":
        return "Upvotes (unique voters)"
    if metric == "enthusiasm":
        return "Popularity (total votes)"
    if metric == "intensity":
        return "Engagement (votes/voter)"
    return "Hotness (recent-weighted)"

def metric_value(node, metric):
    metrics = node.get("metrics") if isinstance(node, dict) else {}
    if not isinstance(metrics, dict):
        metrics = {}
    try:
        if metric == "support":
            return float(metrics.get("support") or 0)
        if metric == "enthusiasm":
            return float(metrics.get("enthusiasm") or 0)
        if metric == "intensity":
            return float(metrics.get("intensity") or 0)
        return float(metrics.get("momentum") or 0)
    except Exception:
        return 0.0

def format_metric(value, metric):
    try:
        number = float(value)
    except Exception:
        number = 0.0
    if metric in ("momentum", "intensity"):
        return f"{number:.3f}"
    return str(int(round(number)))

def compare_key(node, metric):
    metrics = node.get("metrics") if isinstance(node, dict) else {}
    if not isinstance(metrics, dict):
        metrics = {}
    try:
        support = float(metrics.get("support") or 0)
    except Exception:
        support = 0.0
    try:
        enthusiasm = float(metrics.get("enthusiasm") or 0)
    except Exception:
        enthusiasm = 0.0
    try:
        created_at = int(float(node.get("created_at") or 0))
    except Exception:
        created_at = 0
    return (
        -metric_value(node, metric),
        -support,
        -enthusiasm,
        -created_at,
        text(node.get("coordinate")),
    )

nodes = state.get("nodes")
if not isinstance(nodes, list):
    nodes = []
edges = state.get("edges")
if not isinstance(edges, list):
    edges = []
root_coord = text(state.get("root_coord")).strip()
metric = metric_name(state.get("metric") or state.get("default_metric") or "momentum")

visible_nodes = []
for node in nodes:
    if not isinstance(node, dict):
        continue
    coord = text(node.get("coordinate")).strip()
    if not coord:
        continue
    status = text(node.get("status") or "approved").strip().lower()
    if status != "approved":
        continue
    visible_nodes.append(node)

node_map = {text(node.get("coordinate")).strip(): node for node in visible_nodes}
children = {}

def add_edge(parent, child):
    p = text(parent).strip()
    c = text(child).strip()
    if not p or not c or c not in node_map:
        return
    children.setdefault(p, [])
    if c not in children[p]:
        children[p].append(c)

for edge in edges:
    if not isinstance(edge, dict):
        continue
    add_edge(edge.get("parent"), edge.get("child"))

for node in visible_nodes:
    add_edge(node.get("parent"), node.get("coordinate"))

def render_links(node):
    url = text(node.get("url")).strip()
    post_ref = text(node.get("post_ref")).strip()
    if not url and not post_ref:
        return ""
    html_bits = ['<p class="public-ranking-node-links">']
    if url:
        html_bits.append('<a href="%s" target="_blank" rel="noopener noreferrer">External link</a>' % esc(url))
    if post_ref:
        if url:
            html_bits.append(" • ")
            html_bits.append('<a href="%s">Nostr post</a>' % esc(url))
        else:
            html_bits.append("<code>%s</code>" % esc(post_ref))
    html_bits.append("</p>")
    return "".join(html_bits)

def render_node(coord, depth, path):
    if coord in path or coord not in node_map:
        return ""
    node = node_map[coord]
    kids = [node_map[child] for child in children.get(coord, []) if child in node_map]
    kids.sort(key=lambda child: compare_key(child, metric))
    parts = []
    parts.append('<li class="public-ranking-item depth-%d">' % depth)
    parts.append('<article class="public-ranking-node" data-node-coord="%s">' % esc(coord))
    parts.append('<header class="public-ranking-node-head">')
    parts.append('<div class="public-ranking-node-title-wrap">')
    parts.append('<h4 class="public-ranking-node-title">%s</h4>' % esc(node.get("title") or node.get("coordinate") or "Untitled"))
    parts.append('</div>')
    parts.append('<div class="public-ranking-node-actions">')
    parts.append('<button type="button" data-ranking-action="vote" data-node-coord="%s" title="Upvote" disabled aria-disabled="true">+</button>' % esc(coord))
    parts.append('</div>')
    parts.append('</header>')
    metrics = node.get("metrics") if isinstance(node.get("metrics"), dict) else {}
    parts.append('<dl class="public-ranking-metrics">')
    parts.append('<div><dt>%s</dt><dd>%s</dd></div>' % (esc(metric_label(metric)), esc(format_metric(metric_value(node, metric), metric))))
    parts.append('<div><dt>Support</dt><dd>%s</dd></div>' % esc(format_metric(metrics.get("support") or 0, "support")))
    parts.append('<div><dt>Enthusiasm</dt><dd>%s</dd></div>' % esc(format_metric(metrics.get("enthusiasm") or 0, "enthusiasm")))
    parts.append('<div><dt>Intensity</dt><dd>%s</dd></div>' % esc(format_metric(metrics.get("intensity") or 0, "intensity")))
    parts.append('</dl>')
    summary = text(node.get("summary")).strip()
    content = text(node.get("content")).strip()
    if summary:
        parts.append('<p class="public-ranking-node-summary">%s</p>' % md_inline(summary))
    if content:
        parts.append('<div class="public-ranking-node-content">%s</div>' % md_block(content))
    parts.append(render_links(node))
    parts.append('</article>')
    if kids:
        parts.append('<ol class="public-ranking-level">')
        for child in kids:
            parts.append(render_node(text(child.get("coordinate")).strip(), depth + 1, path + [coord]))
        parts.append('</ol>')
    parts.append('</li>')
    return "".join(parts)

intro = text(state.get("content")).strip()
outro = text(state.get("extras_after")).strip()
root_children = [node_map[coord] for coord in children.get(root_coord, []) if coord in node_map]
root_children.sort(key=lambda node: compare_key(node, metric))

parts = []
if intro:
    parts.append('<section class="nostr-page-extra nostr-page-extra-before">%s</section>' % md_block(intro))
if not root_children:
    parts.append('<p class="list-page-empty-state">No content yet.</p>')
else:
    parts.append('<ol class="public-ranking-level depth-0">')
    for node in root_children:
        parts.append(render_node(text(node.get("coordinate")).strip(), 0, []))
    parts.append('</ol>')
if outro:
    parts.append('<section class="nostr-page-extra nostr-page-extra-after">%s</section>' % md_block(outro))

sys.stdout.write("".join(parts))
PY
    then
      if [ "$cleanup_payload_file" = true ]; then
        rm -f "$payload_file"
      fi
      return 0
    fi
    if [ "$cleanup_payload_file" = true ]; then
      rm -f "$payload_file"
    fi
  fi

  blog_nostr_prerender_payload_input "$payload_json" | jq -r '
    def h:
      tostring | gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;") | gsub("\""; "&quot;") | gsub("'"'"'"; "&#39;");
    (.state // {}) as $s
    | (($s.content // "") | tostring) as $intro
    | (($s.nodes // []) | map(select(((.status // "") | tostring | ascii_downcase) == "approved"))) as $nodes
    | (if ($intro | length) > 0 then "<section class=\"nostr-page-extra nostr-page-extra-before\"><p>" + ($intro | h) + "</p></section>" else "" end) +
      (if ($nodes | length) == 0 then "<p class=\"list-page-empty-state\">No content yet.</p>"
       else "<ol class=\"public-ranking-level depth-0\">" + ($nodes | map("<li class=\"public-ranking-item depth-0\"><article class=\"public-ranking-node\"><h4 class=\"public-ranking-node-title\">" + (((.title // .coordinate // "Untitled") | tostring) | h) + "</h4></article></li>") | join("")) + "</ol>"
       end) +
      (if (($s.extras_after // "") | tostring | length) > 0 then "<section class=\"nostr-page-extra nostr-page-extra-after\"><p>" + (($s.extras_after // "") | tostring | h) + "</p></section>" else "" end)
  ' 2>/dev/null || printf '<p class="list-page-empty-state">No content yet.</p>\n'
}

blog_nostr_template_path() {
  template_rel=${1-}
  [ -n "$template_rel" ] || return 1
  template_source=$(blog_template_rel_path "$template_rel" 2>/dev/null || printf '')
  if [ -n "$template_source" ] && [ -f "$template_source" ]; then
    printf '%s\n' "$template_source"
    return 0
  fi
  if [ -n "${blog_site_root:-}" ] && [ -f "$blog_site_root/$template_rel" ]; then
    printf '%s\n' "$blog_site_root/$template_rel"
    return 0
  fi
  if [ -n "${SCRIPT_DIR:-}" ]; then
    default_template_root=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)
    default_template="$default_template_root/$template_rel"
    if [ -f "$default_template" ]; then
      printf '%s\n' "$default_template"
      return 0
    fi
  fi
  return 1
}

blog_nostr_template_inner_html() {
  template_rel=${1-}
  template_id=${2-}
  [ -n "$template_rel" ] || return 1
  [ -n "$template_id" ] || return 1
  template_file=$(blog_nostr_template_path "$template_rel" 2>/dev/null || printf '')
  [ -f "$template_file" ] || return 1
  awk -v template_id="$template_id" '
    index($0, "<template id=\"" template_id "\">") { in_template=1; next }
    /<\/template>/ && in_template { exit }
    in_template { print }
  ' "$template_file"
}

blog_nostr_prerender_contact_secure_chat_login_gate_html() {
  blog_nostr_template_inner_html 'site/lodestone/templates/contact.stone.html' 'contact-secure-chat-login-gate-template'
}

blog_nostr_prerender_overworld_html() {
  blog_nostr_template_inner_html 'site/lodestone/templates/overworld.stone.html' 'overworld-static-shell-template'
}
