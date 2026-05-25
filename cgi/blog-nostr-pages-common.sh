#!/bin/sh
# Shared helpers for generic Nostr-backed pages.

set -eu

blog_nostr_list_page_js_version='20260524-vote-tie-sort1'
blog_nostr_blog_page_js_version='20260524-inline-chip-active1'
blog_nostr_contact_page_js_version='20260524-contact-pill-prerender1'
blog_nostr_simplex_web_default_chat_js_version='20260523-login-note1'
blog_nostr_simplex_web_adapter_init_js_version='20260516-browserprofilev2'
blog_nostr_nip23_page_js_version='20260521-login-sync1'
blog_nostr_public_ranking_page_js_version='20260404-rankingv1'
blog_nostr_overworld_game_js_version='20260522-overworld-textures'

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
    overworld) printf '30023\n' ;;
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
      (($v // "") | tostring | ascii_downcase) as $t
      | if $t == "contact" then "contact"
        elif ($t == "public-ranking" or $t == "public_ranking" or $t == "ranking") then "public-ranking"
        elif ($t == "overworld" or $t == "overworld-game" or $t == "overworld_game") then "overworld"
        elif ($t == "icon-gallery" or $t == "icon_gallery" or $t == "gallery") then "icon-gallery"
        elif ($t == "blog" or $t == "blog-index" or $t == "blog_index") then "blog"
        elif ($t == "nip23" or $t == "article" or $t == "document") then "nip23"
        else "list" end;
    def norm_path($slug; $type; $v):
      if $slug == "index" then "/"
      else ("/" + $slug)
      end;

    ((if type=="object" then .pages else . end) // []) as $raw_pages
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
          show_in_footer: (
            if has("show_in_footer") then
              (if .show_in_footer == true then true else false end)
            elif has("show_footer") then
              (if .show_footer == true then true else false end)
            else false end
          ),
          default_tag: ((.default_tag // "") | tostring | gsub("^\\s+|\\s+$";"")),
          placeholder_title: ((.placeholder_title // .title // "") | tostring),
          path: ((.path // "") | tostring)
        })
      | map(select((.slug | length) > 0))
    ) as $pages
    | (reduce $pages[] as $p ([];
        # Last one wins for duplicate slugs so explicit user edits override
        # stale legacy rows (for example old index/Home entries).
        ([.[] | select(.slug != $p.slug)] + [$p])
      )) as $with_required_pages
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
                 elif .type == "overworld" then 30023
                 elif (.type == "nip23" or .type == "blog") then 30023
                 else 30004
               end
             )
             | .show_in_nav = (if .show_in_nav == false then false else true end)
             | .show_in_footer = (if .show_in_footer == true then true else false end)
             | .default_tag = (if .type == "blog" then (.default_tag // "") else "" end)
             | .placeholder_title = (if (.placeholder_title | length) > 0 then .placeholder_title else title_from_slug(.slug) end)
             | .path = norm_path(.slug; .type; .path)
             ))
           end)
      }
  ' 2>/dev/null || blog_nostr_pages_default_json
}

blog_nostr_pages_prune_legacy_empty_home_json() {
  cfg_json=${1-}
  [ -n "$cfg_json" ] || {
    blog_nostr_pages_default_json
    return 0
  }
  has_legacy_index=$(printf '%s\n' "$cfg_json" | jq -r '
    [
      .pages[]?
      | select((.slug // "" | tostring) == "index")
      | select((.type // "list" | tostring | ascii_downcase) == "nip23")
    ] | length
  ' 2>/dev/null || printf '0')
  case "$has_legacy_index" in
    ''|*[!0-9]*) has_legacy_index=0 ;;
  esac
  if [ "$has_legacy_index" -le 0 ]; then
    printf '%s\n' "$cfg_json"
    return 0
  fi

  index_event=$(blog_nostr_nip23_latest_event_json "index" 2>/dev/null || printf '')
  index_draft=$(blog_nostr_page_load_draft_state_json "index" "nip23" 2>/dev/null || printf '')
  if [ -n "$index_event" ] || [ -n "$index_draft" ]; then
    printf '%s\n' "$cfg_json"
    return 0
  fi

  printf '%s\n' "$cfg_json" | jq -c '
    .pages = [
      .pages[]?
      | select(
          ((.slug // "" | tostring) != "index")
          or ((.type // "list" | tostring | ascii_downcase) != "nip23")
        )
    ]
  ' 2>/dev/null || printf '%s\n' "$cfg_json"
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
  normalized=$(blog_nostr_pages_prune_legacy_empty_home_json "$normalized")
  normalized_norm=$(printf '%s\n' "$normalized" | jq -c '.' 2>/dev/null || printf '')
  if [ ! -f "$path" ] || [ "$raw_norm" != "$normalized_norm" ]; then
    blog_nostr_pages_save_json "$normalized"
  fi
  printf '%s\n' "$normalized"
}

blog_nostr_pages_load_json_fast() {
  path=$(blog_nostr_pages_config_path)
  raw=''
  if [ -f "$path" ]; then
    raw=$(cat "$path" 2>/dev/null || printf '')
  fi
  normalized=$(blog_nostr_pages_normalize_json "$raw")
  normalized=$(blog_nostr_pages_prune_legacy_empty_home_json "$normalized")
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

blog_nostr_navbar_pages_json() {
  cfg_json=${1-}
  if [ -z "$cfg_json" ]; then
    cfg_json=$(blog_nostr_pages_load_json_fast)
  fi

  nav_json=$(printf '%s\n' "$cfg_json" | jq -c '
    def title_from_slug($slug):
      (($slug // "") | tostring | gsub("-";" ")) as $text
      | if ($text | length) == 0 then "Untitled"
        else (($text[0:1] | ascii_upcase) + ($text[1:]))
        end;
    def norm_slug($value):
      (($value // "") | tostring | ascii_downcase
        | gsub("[^a-z0-9-]"; "-")
        | gsub("-+"; "-")
        | gsub("(^-+|-+$)"; ""));
    def norm_type($value):
      (($value // "") | tostring | ascii_downcase) as $type
      | if $type == "contact" then "contact"
        elif ($type == "public-ranking" or $type == "public_ranking" or $type == "ranking") then "public-ranking"
        elif ($type == "overworld" or $type == "overworld-game" or $type == "overworld_game") then "overworld"
        elif ($type == "icon-gallery" or $type == "icon_gallery" or $type == "gallery") then "icon-gallery"
        elif ($type == "blog" or $type == "blog-index" or $type == "blog_index") then "blog"
        elif ($type == "nip23" or $type == "article" or $type == "document") then "nip23"
        else "list"
        end;
    def norm_kind($page_type; $value):
      if ($value | type) == "number" then $value
      elif $page_type == "contact" then 0
      elif $page_type == "public-ranking" then 30040
      elif $page_type == "overworld" then 30023
      elif ($page_type == "nip23" or $page_type == "blog") then 30023
      else 30004
      end;
    def norm_path($slug; $value):
      (($value // "") | tostring) as $path
      | if ($path | length) > 0 then $path
        elif $slug == "index" then "/"
        else ("/" + $slug)
        end;

    {
      success: true,
      pages: [
        .pages[]?
        | .slug = norm_slug(.slug // "")
        | select((.slug | length) > 0)
        | .type = norm_type(.type // .page_type // "list")
        | select((if has("show_in_nav") then .show_in_nav else true end) != false)
        | {
            slug: .slug,
            title: (
              ((.placeholder_title // .title // "") | tostring | gsub("\r"; "")) as $title
              | if ($title | length) > 0 then $title
                elif .slug == "index" and .type == "blog" then "Blog"
                elif .slug == "index" then "Home"
                else title_from_slug(.slug)
                end
            ),
            path: norm_path(.slug; .path),
            type: .type,
            kind: norm_kind(.type; .kind)
          }
      ]
    }
  ' 2>/dev/null || printf '')
  if [ -z "$nav_json" ]; then
    nav_json='{"success":true,"pages":[]}'
  fi
  printf '%s\n' "$nav_json"
}

blog_nostr_footer_pages_json() {
  cfg_json=${1-}
  if [ -z "$cfg_json" ]; then
    cfg_json=$(blog_nostr_pages_load_json_fast)
  fi

  footer_json=$(printf '%s\n' "$cfg_json" | jq -c '
    def title_from_slug($slug):
      (($slug // "") | tostring | gsub("-";" ")) as $text
      | if ($text | length) == 0 then "Untitled"
        else (($text[0:1] | ascii_upcase) + ($text[1:]))
        end;
    def norm_slug($value):
      (($value // "") | tostring | ascii_downcase
        | gsub("[^a-z0-9-]"; "-")
        | gsub("-+"; "-")
        | gsub("(^-+|-+$)"; ""));
    def norm_path($slug; $value):
      (($value // "") | tostring) as $path
      | if ($path | length) > 0 then $path
        elif $slug == "index" then "/"
        else ("/" + $slug)
        end;

    {
      success: true,
      pages: [
        .pages[]?
        | .slug = norm_slug(.slug // "")
        | select((.slug | length) > 0)
        | select((if has("show_in_footer") then .show_in_footer else false end) == true)
        | {
            slug: .slug,
            title: (
              ((.placeholder_title // .title // "") | tostring | gsub("\r"; "")) as $title
              | if ($title | length) > 0 then $title
                elif .slug == "index" then "Home"
                else title_from_slug(.slug)
                end
            ),
            path: norm_path(.slug; .path)
          }
      ]
    }
  ' 2>/dev/null || printf '')
  if [ -z "$footer_json" ]; then
    footer_json='{"success":true,"pages":[]}'
  fi
  printf '%s\n' "$footer_json"
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

blog_nostr_prerender_signature() {
  payload_json=${1-}
  signature_payload=$(blog_nostr_prerender_payload_input "$payload_json" | jq -c 'del(.prerender_signature)' 2>/dev/null || blog_nostr_prerender_payload_input "$payload_json")
  printf '%s' "$signature_payload" | cksum | awk '{ printf "%s-%s\n", $1, $2 }'
}

blog_nostr_prerender_payload_input() {
  payload_json=${1-}
  if [ -n "${BLOG_NOSTR_PRERENDER_PAYLOAD_FILE:-}" ] && [ -f "$BLOG_NOSTR_PRERENDER_PAYLOAD_FILE" ]; then
    cat "$BLOG_NOSTR_PRERENDER_PAYLOAD_FILE"
  else
    printf '%s\n' "$payload_json"
  fi
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

def md_inline(value):
    escaped = html.escape(text(value), quote=True)
    escaped = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', escaped)
    escaped = re.sub(r"\*([^*\n]+)\*", r"<em>\1</em>", escaped)
    return escaped

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
        return '<a class="%s is-post-url-linked" href="%s">%s</a>' % (
            class_name,
            html.escape(url, quote=True),
            md_inline(label),
        )
    return '<span class="%s">%s</span>' % (class_name, md_inline(label))

def marker_pills(entry, show):
    if not show:
        return ""
    markers = []
    for marker in text(entry.get("marker")).split(","):
        marker = re.sub(r"\s+", " ", marker).strip()
        if marker:
            markers.append(marker)
    if not markers:
        return ""
    return '<span class="list-entry-marker-pills">%s</span>' % "".join(
        '<span class="list-entry-marker-pill">%s</span>' % html.escape(marker, quote=True)
        for marker in markers
    )

def date_pill(entry, group_by, section_label):
    date = text(entry.get("date"))
    if not date or (group_by == "year" and date == section_label):
        return ""
    return '<span class="list-entry-date-pill">%s</span>' % html.escape(date, quote=True)

def row_html(entry, group_by="", section_label="", show_markers=False, gallery=False):
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
    markers = marker_pills(entry, show_markers)
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
    return (
        '<li class="list-entry-line list-depth-%d" data-list-entry-id="%s" style="--list-depth:%d;"%s>'
        '<div class="list-entry-first-line"><span class="list-entry-main-inline">%s%s%s</span>%s</div></li>'
    ) % (depth, key, depth, entry_href_attr(entry), icon, linked_text(line, post_url, "list-entry-markdown"), desc, meta)

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
source_entries = state.get("elements") if isinstance(state.get("elements"), list) else state.get("entries")
if not isinstance(source_entries, list):
    source_entries = []
entries = [
    entry for entry in source_entries
    if isinstance(entry, dict)
    and text(entry.get("type") or "entry") == "entry"
    and text(entry.get("markdown"))
]

parts = []
if state.get("allow_signed_in_submissions") is True:
    parts.append('<section class="list-public-submit" aria-label="Add list entry"><div class="list-public-submit-inline"><input type="text" id="list-public-submit-title" placeholder="New entry"><button type="button" class="list-admin-primary-btn list-public-submit-add" data-list-public-action="submit">Add</button></div></section>')

after = ""
if text(state.get("extras_after")):
    after = '<section class="nostr-page-extra nostr-page-extra-after"><p>%s</p></section>' % md_inline(state.get("extras_after"))

if not entries:
    parts.append('<p class="list-page-empty-state">No content yet.</p>')
elif view == "tile":
    parts.append('<ul class="list-tiles">%s</ul>' % "".join(tile_html(entry) for entry in entries))
elif group_by in ("year", "first_letter", "month", "marker"):
    current = None
    opened = False
    for entry in entries:
        label = group_label(entry, group_by)
        if not opened or label != current:
            if opened:
                parts.append("</ul></section>")
            parts.append('<section class="list-year-group"><div class="list-year-head"><h3 class="list-year-heading">%s</h3></div><ul class="list-entries">' % html.escape(label, quote=True))
            current = label
            opened = True
        parts.append(row_html(entry, group_by, label, show_markers, gallery))
    parts.append("</ul></section>")
else:
    parts.append('<ul class="list-entries">%s</ul>' % "".join(row_html(entry, "", "", show_markers, gallery) for entry in entries))

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
    def entry_key($e):
      (($e._list_entry_id // $e._public_entry_id // $e._uid // "") | tostring);
    def entry_href_attr($e):
      (($e.post_url // "") | tostring) as $u
      | if ($u | length) > 0 then " data-list-entry-href=\"" + ($u | h) + "\"" else "" end;
    def linked_text($text; $url; $class):
      ($url // "" | tostring) as $u
      | if ($u | length) > 0 then
          "<a class=\"" + $class + " is-post-url-linked\" href=\"" + ($u | h) + "\">" + ($text | md_inline) + "</a>"
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
        "<section class=\"list-public-submit\" aria-label=\"Add list entry\"><div class=\"list-public-submit-inline\"><input type=\"text\" id=\"list-public-submit-title\" placeholder=\"New entry\"><button type=\"button\" class=\"list-admin-primary-btn list-public-submit-add\" data-list-public-action=\"submit\">Add</button></div></section>"
      else "" end) as $submit
    | (if (($s.extras_after // "") | tostring | length) > 0 then
        "<section class=\"nostr-page-extra nostr-page-extra-after\"><p>" + (($s.extras_after // "") | md_inline) + "</p></section>"
      else "" end) as $after
    | if ($entries | length) == 0 then
        $submit + "<p class=\"list-page-empty-state\">No content yet.</p>" + $after
      elif $view == "tile" then
        $submit + "<ul class=\"list-tiles\">" + ($entries | map(tile_html(.)) | join("")) + "</ul>" + $after
      elif (["year", "first_letter", "month", "marker"] | index($group_by)) then
        $submit + (
          reduce $entries[] as $e ({html:"", label:"__initial__", open:false};
            (group_label($e; $group_by)) as $label
            | if .label != $label then
                .html = (.html + (if .open then "</ul></section>" else "" end) + "<section class=\"list-year-group\"><div class=\"list-year-head\"><h3 class=\"list-year-heading\">" + ($label | h) + "</h3></div><ul class=\"list-entries\">")
                | .label = $label
                | .open = true
              else . end
	            | .html = (.html + row_html($e; $group_by; $label; $show_markers; $gallery))
	          )
	          | .html + "</ul></section>"
	        ) + $after
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
    def md_block:
      tostring as $raw
      | if ($raw | gsub("\\s"; "") | length) == 0 then ""
        else ($raw | h | gsub("\\[(?<label>[^\\]]+)\\]\\((?<href>[^)]+)\\)"; "<a href=\"\(.href)\">\(.label)</a>") | split("\n\n") | map("<p>" + (gsub("\n"; "<br>")) + "</p>") | join(""))
        end;
    (.state // {}) as $s
    | (($s.content // "") | md_block) as $main
    | (($s.extras_after // "") | md_block) as $after
    | (if (($s.product_enabled // false) == true or (($s.price // "") | tostring | length) > 0) then
        "<section class=\"nip23-product-card\" aria-label=\"Product checkout\"><div class=\"nip23-product-card-head\"><strong>Checkout</strong><span class=\"nip23-product-type-pill\">" + (($s.product_type // "software") | h) + "</span></div></section>"
      else "" end) as $product
    | $product + (if ($main | length) > 0 then "<article class=\"list-entry-markdown\">" + $main + "</article>" else "<p class=\"list-page-empty-state\">No content yet.</p>" end) +
      (if ($after | length) > 0 then "<section class=\"nostr-page-extra nostr-page-extra-after\">" + $after + "</section>" else "" end)
  ' 2>/dev/null || printf '<p class="list-page-empty-state">No content yet.</p>\n'
}

blog_nostr_prerender_contact_html() {
  payload_json=${1-}
  contact_video_chat_html=$(blog_nostr_prerender_contact_video_chat_html)
  blog_nostr_prerender_payload_input "$payload_json" | jq -r --arg video_chat_html "$contact_video_chat_html" '
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
      "<div class=\"secure-chat-head\"><div class=\"secure-chat-login-gate\"><p class=\"secure-chat-login-note\">Login with Nostr to chat.</p><button type=\"button\" class=\"list-admin-primary-btn secure-chat-login-btn\" data-secure-chat-action=\"login\">Login...</button></div></div>" +
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

  contact_video_chat_public_rooms=$(config-get "$blog_site_conf" video_chat_public_rooms 2>/dev/null || printf 'false')
  case "$contact_video_chat_public_rooms" in
    true) ;;
    *) contact_video_chat_public_rooms=false ;;
  esac
  contact_video_chat_rooms=$(config-get "$blog_site_conf" video_chat_rooms 2>/dev/null || printf '')
  contact_video_chat_rooms_attr=$(printf '%s' "$contact_video_chat_rooms" | tr ';' ',' | jq -Rr '@html' 2>/dev/null || printf '')
  contact_video_chat_max=$(config-get "$blog_site_conf" video_chat_participant_limit 2>/dev/null || printf '6')
  case "$contact_video_chat_max" in ''|*[!0-9]*) contact_video_chat_max=6 ;; esac
  if [ "$contact_video_chat_max" -lt 2 ]; then contact_video_chat_max=2; fi
  if [ "$contact_video_chat_max" -gt 24 ]; then contact_video_chat_max=24; fi

  cat <<EOF
<section class="contact-widget contact-widget-video-chat" aria-label="Video calling"><h2 id="contact-call-title" class="contact-section-heading"><span>Call</span></h2><div data-video-chat data-video-chat-token-endpoint="/cgi/blog-video-chat-token" data-video-chat-call-room-id="call-me" data-video-chat-call-label="Call Anders" data-video-chat-show-heading="false" data-video-chat-center-precall="true" data-video-chat-owner-call-private="true" data-video-chat-public-rooms="$contact_video_chat_public_rooms" data-video-chat-room-list="$contact_video_chat_rooms_attr" data-video-chat-room-theme-images="{}" data-video-chat-room-policy="open" data-video-chat-max-participants="$contact_video_chat_max" data-video-chat-allow-join-link="true"></div></section>
EOF
}

blog_nostr_prerender_blog_posts_html() {
  payload_json=${1-}
  blog_nostr_prerender_payload_input "$payload_json" | jq -r '
    def h:
      tostring | gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;") | gsub("\""; "&quot;") | gsub("'"'"'"; "&#39;");
    def clean:
      tostring | gsub("#+"; "") | gsub("\\*"; "") | gsub("\\[(?<label>[^\\]]+)\\]\\((?<href>[^)]+)\\)"; "\(.label)");
    def post_html($p):
      (($p.title // "") | tostring) as $title
      | (($p.summary // "") | clean) as $summary
      | (($p.url // $p.path // "#") | tostring) as $url
      | (($p.author // "Blog Author") | tostring) as $author
      | (($p.published_date // $p.pub_date // $p.date // "Unknown date") | tostring) as $date
      | (($p.reading_minutes // 1) | tonumber? // 1) as $mins
      | "<article class=\"post-item blog-post-item\"><div class=\"post-head\"><div class=\"post-head-main\"><h2 class=\"post-title\"><a href=\"" + ($url | h) + "\">" + ((if ($title | length) > 0 then $title else "Untitled" end) | h) + "</a></h2><div class=\"post-head-divider\" aria-hidden=\"true\"></div><div class=\"post-byline post-byline-bottom\"><span class=\"post-author\">" + ($author | h) + "</span><span class=\"post-reading-inline\">" + ($mins | tostring | h) + " min read</span><span class=\"post-date\">" + ($date | h) + "</span></div></div></div>" +
        (if ($summary | length) > 0 then "<div class=\"post-summary\"><p>" + ($summary | h) + "</p></div>" else "" end) +
        "</article>";
    (.bootstrap_posts // []) as $posts
    | if ($posts | length) == 0 then "<p class=\"placeholder\">No posts to show yet.</p>"
      else ($posts | map(post_html(.)) | join(""))
      end
  ' 2>/dev/null || printf '<p class="placeholder">No posts to show yet.</p>\n'
}

blog_nostr_prerender_public_ranking_html() {
  payload_json=${1-}
  blog_nostr_prerender_payload_input "$payload_json" | jq -r '
    def h:
      tostring | gsub("&"; "&amp;") | gsub("<"; "&lt;") | gsub(">"; "&gt;") | gsub("\""; "&quot;") | gsub("'"'"'"; "&#39;");
    (.state // {}) as $s
    | (($s.content // "") | tostring) as $intro
    | (($s.nodes // []) | map(select(((.status // "") | tostring | ascii_downcase) != "pending"))) as $nodes
    | (if ($intro | length) > 0 then "<section class=\"nostr-page-extra nostr-page-extra-before\"><p>" + ($intro | h) + "</p></section>" else "" end) +
      (if ($nodes | length) == 0 then "<p class=\"list-page-empty-state\">No rankings yet.</p>"
       else "<ol class=\"public-ranking-tree\">" + ($nodes | map("<li class=\"public-ranking-node\"><article><h3>" + (((.title // .coordinate // "Untitled") | tostring) | h) + "</h3>" + (if (((.summary // .content // "") | tostring | length) > 0) then "<p>" + (((.summary // .content // "") | tostring) | h) + "</p>" else "" end) + "</article></li>") | join("")) + "</ol>"
       end) +
      (if (($s.extras_after // "") | tostring | length) > 0 then "<section class=\"nostr-page-extra nostr-page-extra-after\"><p>" + (($s.extras_after // "") | tostring | h) + "</p></section>" else "" end)
  ' 2>/dev/null || printf '<p class="list-page-empty-state">No rankings yet.</p>\n'
}

blog_nostr_prerender_overworld_html() {
  cat <<'EOOVERWORLDHTML'
<div class="overworld-godot-shell" data-overworld-static-shell="true">
<div class="overworld-godot-frame-wrap">
<div class="overworld-godot-splash">
<div class="overworld-godot-splash-panel">
<div class="overworld-godot-kicker">Godot Web</div>
<h2 class="overworld-godot-title">Overworld</h2>
<p class="overworld-godot-copy">The game loads a compressed Godot Web build before play starts.</p>
<button type="button" class="overworld-godot-download">Download (6.8 MB)</button>
</div>
</div>
</div>
<div class="overworld-godot-status">Waiting for download</div>
<div class="overworld-godot-help">
<div class="overworld-godot-keys"><span class="overworld-godot-key">Enter: note</span><span class="overworld-godot-key">I: inventory</span><span class="overworld-godot-key">B: spells</span><span class="overworld-godot-key">C: character</span></div>
<div class="overworld-godot-login-note">Anonymous players can inspect the starting room. Log in with Nostr to walk through doors into the server.</div>
</div>
</div>
EOOVERWORLDHTML
}

blog_nostr_page_front_matter_to_tmp() {
  page_file=${1-}
  page_title=${2-Untitled}
  tags=${3-nostr}
  tmp=${4-}
  [ -n "$tmp" ] || return 1
  if [ -f "$page_file" ] && [ "$(sed -n '1p' "$page_file" 2>/dev/null || printf '')" = "---" ]; then
    awk '
      BEGIN { fence = 0 }
      {
        print
        if ($0 == "---") {
          fence += 1
          if (fence == 2) {
            print ""
            exit
          }
        }
      }
    ' "$page_file" > "$tmp"
    if [ -s "$tmp" ]; then
      return 0
    fi
  fi
  {
    printf '%s\n' '---'
    printf 'title: "%s"\n' "$(blog_json_escape "$page_title")"
    printf 'published_at: "%s"\n' "$(blog_now_iso)"
    printf '%s\n' 'content_hash: ""'
    printf 'tags: [%s]\n' "$tags"
    printf '%s\n' 'author: "author"'
    printf '%s\n' 'visibility: "public"'
    printf '%s\n' 'license: "CC BY 4.0"'
    printf '%s\n\n' '---'
  } > "$tmp"
}

blog_nostr_page_write_prerendered_source() {
  slug=$(blog_nostr_page_slug "${1-}")
  page_type=$(printf '%s' "${2-}" | tr '[:upper:]' '[:lower:]')
  payload_json=${3-}
  [ -n "$slug" ] || return 1
  [ -n "$payload_json" ] || payload_json=$(jq -cn --arg slug "$slug" --arg page_type "$page_type" '{slug:$slug,page_type:$page_type,state:{title:$slug}}')
	  page_file=$(blog_nostr_page_source_path "$slug" "$page_type")
	  mkdir -p "$(dirname "$page_file")" "$blog_pages_store_dir"
  payload_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-prerender-payload.XXXXXX")
  printf '%s\n' "$payload_json" > "$payload_tmp"
  prev_prerender_payload_file=${BLOG_NOSTR_PRERENDER_PAYLOAD_FILE-}
  BLOG_NOSTR_PRERENDER_PAYLOAD_FILE=$payload_tmp
  export BLOG_NOSTR_PRERENDER_PAYLOAD_FILE
	  page_title=$(blog_nostr_prerender_title "$payload_json" "$(blog_nostr_page_default_title "$slug" "$page_type")")
  page_description=$(blog_nostr_prerender_description "$payload_json")
  attrs=$(blog_nostr_prerender_attrs "$payload_json")
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-prerender-page.XXXXXX")
  tags='"nostr", "list"'
  case "$page_type" in
    contact) tags='"nostr", "contact"' ;;
    nip23) tags='"nostr", "nip23"' ;;
    blog) tags='"nostr", "blog"' ;;
    public-ranking) tags='"nostr", "public-ranking"' ;;
    overworld) tags='"nostr", "overworld"' ;;
    icon-gallery) tags='"nostr", "list", "icon-gallery"' ;;
  esac
  blog_nostr_page_front_matter_to_tmp "$page_file" "$page_title" "$tags" "$tmp"

  case "$page_type" in
    contact)
      content_html=$(blog_nostr_prerender_contact_html "$payload_json")
      {
        printf '<section id="contact-page-root" class="list-page-shell" data-page-slug="%s" data-page-type="contact" data-page-title="%s"%s>\n' "$slug" "$(printf '%s' "$page_title" | jq -Rr '@html')" "$attrs"
        printf '%s\n' '<div class="list-page-head">'
        printf '<h1 id="contact-page-title">%s</h1>\n' "$(printf '%s' "$page_title" | jq -Rr '@html')"
        printf '<p id="contact-page-description" class="muted">%s</p>\n' "$(printf '%s' "$page_description" | jq -Rr '@html')"
        printf '%s\n' '</div><div id="contact-page-admin" class="list-admin" hidden></div><div id="contact-page-validation" class="list-validation" hidden></div>'
        printf '<div id="contact-page-content" class="list-page-content"%s>\n%s\n</div>\n</section>\n\n' "$attrs" "$content_html"
        printf '%s\n' '<script src="/static/nostr-page-bootstrap/'"$slug"'.js"></script>'
        printf '%s\n' '<script src="/static/nostr-publish-dialog.js"></script>'
        printf '%s\n' '<script src="/static/simplex-web-transport.js"></script>'
        printf '%s\n' '<script type="importmap">'
        printf '%s\n' '{"imports":{"@noble/ciphers/":"https://cdn.jsdelivr.net/npm/@noble/ciphers@2.2.0/","@noble/curves/":"https://cdn.jsdelivr.net/npm/@noble/curves@2.2.0/","@noble/hashes/":"https://cdn.jsdelivr.net/npm/@noble/hashes@2.2.0/"}}'
        printf '%s\n' '</script>'
        printf '<script type="module" src="/static/simplex-web-browser-adapter-init.mjs?v=%s"></script>\n' "$blog_nostr_simplex_web_adapter_init_js_version"
        printf '<script src="/static/simplex-web-default-chat.js?v=%s"></script>\n' "$blog_nostr_simplex_web_default_chat_js_version"
        printf '%s\n' '<script src="/static/simplex-web-session-store.js"></script>'
        printf '%s\n' '<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>'
        printf '%s\n' '<script src="/static/video-chat-widget.js?v=20260524-janus-default1" data-video-chat-widget="1"></script>'
        printf '<script src="/static/contact-page.js?v=%s"></script>\n' "$blog_nostr_contact_page_js_version"
      } >> "$tmp"
      ;;
    nip23)
      content_html=$(blog_nostr_prerender_nip23_html "$payload_json")
      {
        printf '<section id="nip23-page-root" class="list-page-shell" data-page-slug="%s" data-page-type="nip23" data-page-title="%s"%s>\n' "$slug" "$(printf '%s' "$page_title" | jq -Rr '@html')" "$attrs"
        printf '<div class="list-page-head"><h1 id="nip23-page-title">%s</h1></div>\n' "$(printf '%s' "$page_title" | jq -Rr '@html')"
        printf '%s\n' '<div id="nip23-page-admin" class="list-admin" hidden></div><div id="nip23-page-validation" class="list-validation" hidden></div>'
        printf '<div id="nip23-page-content" class="list-page-content"%s>\n%s\n</div>\n</section>\n\n' "$attrs" "$content_html"
        printf '%s\n' '<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>'
        printf '%s\n' '<script src="/static/nostr-page-bootstrap/'"$slug"'.js"></script>'
        printf '%s\n' '<script src="/static/nostr-publish-dialog.js"></script>'
        printf '<script src="/static/nip23-page.js?v=%s"></script>\n' "$blog_nostr_nip23_page_js_version"
      } >> "$tmp"
      ;;
    blog)
      posts_html=$(blog_nostr_prerender_blog_posts_html "$payload_json")
      {
        printf '<section id="blog-page-root" class="blog-page" data-blog-slug="%s" data-page-type="blog" aria-live="polite"%s>\n' "$slug" "$attrs"
        printf '%s\n' '<div class="blog-layout"><div class="blog-filter-column"><button id="blog-filter-toggle" type="button" class="blog-filter-toggle unobtrusive-icon-button" aria-expanded="false" aria-controls="blog-filter-panel" aria-label="Filter posts" title="Filter posts"><svg class="blog-filter-icon" viewBox="0 0 16 16" aria-hidden="true"><line x1="2" y1="3" x2="14" y2="3"></line><circle cx="6" cy="3" r="1.25"></circle><line x1="2" y1="8" x2="14" y2="8"></line><circle cx="10.5" cy="8" r="1.25"></circle><line x1="2" y1="13" x2="14" y2="13"></line><circle cx="4.5" cy="13" r="1.25"></circle></svg></button></div><div class="blog-main-column">'
        printf '<div class="list-page-head"><h1 id="blog-page-title">%s</h1><p id="blog-page-description" class="muted" hidden></p></div>\n' "$(printf '%s' "$page_title" | jq -Rr '@html')"
        printf '%s\n' '<div id="blog-page-admin" class="list-admin" hidden></div><div id="blog-page-validation" class="list-validation" hidden></div><div id="blog-page-content" class="list-page-content" hidden></div>'
        printf '%s\n' '<div id="blog-filter-panel" class="blog-filter-panel" hidden><div class="blog-filter-grid"><div class="blog-filter-group"><h3>Tags</h3><div id="blog-filter-tags" class="blog-filter-options"></div></div><div class="blog-filter-group"><h3>Year</h3><div id="blog-filter-years" class="blog-filter-options"></div></div><div class="blog-filter-group"><h3>Type</h3><div id="blog-filter-types" class="blog-filter-options"></div></div></div><div class="blog-filter-footer"><button id="blog-clear-filters" type="button" class="blog-clear-filters">Clear filters</button></div></div>'
        printf '<div id="blog-post-list" class="post-list"%s>\n%s\n</div><p id="blog-empty" class="placeholder" hidden>No posts match these filters.</p>\n' "$attrs" "$posts_html"
        printf '%s\n' '</div></div></section>'
        printf '%s\n' '<script src="/static/nostr-page-bootstrap/'"$slug"'.js"></script>'
        printf '<script src="/static/blog-page.js?v=%s"></script>\n' "$blog_nostr_blog_page_js_version"
      } >> "$tmp"
      ;;
    public-ranking)
      content_html=$(blog_nostr_prerender_public_ranking_html "$payload_json")
      {
        printf '<section id="public-ranking-root" class="list-page-shell public-ranking-shell" data-ranking-slug="%s" data-page-type="public-ranking" data-page-title="%s"%s>\n' "$slug" "$(printf '%s' "$page_title" | jq -Rr '@html')" "$attrs"
        printf '<div class="list-page-head"><h1 id="public-ranking-title">%s</h1><p id="public-ranking-description" class="muted">%s</p></div>\n' "$(printf '%s' "$page_title" | jq -Rr '@html')" "$(printf '%s' "$page_description" | jq -Rr '@html')"
        printf '%s\n' '<div id="public-ranking-admin" class="list-admin" hidden></div><div id="public-ranking-validation" class="list-validation" hidden></div>'
        printf '<div id="public-ranking-content" class="list-page-content"%s>\n%s\n</div>\n</section>\n\n' "$attrs" "$content_html"
        printf '%s\n' '<script src="/static/nostr-page-bootstrap/'"$slug"'.js"></script>'
        printf '%s\n' '<script src="/static/nostr-publish-dialog.js"></script>'
        printf '%s\n' '<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>'
        printf '<script src="/static/public-ranking-page.js?v=%s"></script>\n' "$blog_nostr_public_ranking_page_js_version"
      } >> "$tmp"
      ;;
    overworld)
      content_html=$(blog_nostr_prerender_overworld_html)
      {
        printf '<section id="overworld-page-root" class="overworld-page-shell" data-page-slug="%s" data-page-type="overworld" data-page-title="%s"%s>\n' "$slug" "$(printf '%s' "$page_title" | jq -Rr '@html')" "$attrs"
        printf '<div class="list-page-head overworld-page-head"><h1 id="overworld-page-title">%s</h1></div>\n' "$(printf '%s' "$page_title" | jq -Rr '@html')"
        printf '<div class="overworld-game-mount" data-overworld-game%s>\n%s\n</div>\n</section>\n\n' "$attrs" "$content_html"
        printf '%s\n' '<script src="/static/nostr-page-bootstrap/'"$slug"'.js"></script>'
        printf '<script src="/static/overworld-game.js?v=%s"></script>\n' "$blog_nostr_overworld_game_js_version"
      } >> "$tmp"
      ;;
    icon-gallery|*)
      content_html=$(blog_nostr_prerender_list_html "$payload_json")
      root_id=list-page-root
      [ "$page_type" = "icon-gallery" ] && root_id=icon-gallery-root
      {
        printf '<section id="%s" class="list-page-shell%s" data-list-slug="%s" data-list-title="%s" data-page-type="%s"%s>\n' "$root_id" "$( [ "$page_type" = "icon-gallery" ] && printf ' icon-gallery-shell' || printf '' )" "$slug" "$(printf '%s' "$page_title" | jq -Rr '@html')" "$page_type" "$attrs"
        printf '<div class="list-page-head"><h1 id="list-page-title">%s</h1><p id="list-page-description" class="muted">%s</p></div>\n' "$(printf '%s' "$page_title" | jq -Rr '@html')" "$(printf '%s' "$page_description" | jq -Rr '@html')"
        printf '%s\n' '<div id="list-page-admin" class="list-admin" hidden></div><div id="list-page-validation" class="list-validation" hidden></div>'
        printf '<div id="list-page-content" class="list-page-content"%s>\n%s\n</div>\n</section>\n\n' "$attrs" "$content_html"
        printf '%s\n' '<script src="/static/nostr-page-bootstrap/'"$slug"'.js"></script>'
        printf '%s\n' '<script src="/static/nostr-publish-dialog.js"></script>'
        printf '%s\n' '<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>'
        printf '<script src="/static/list-page.js?v=%s"></script>\n' "$blog_nostr_list_page_js_version"
      } >> "$tmp"
      ;;
  esac

  mv "$tmp" "$page_file"
  rm -f "$payload_tmp"
  if [ -n "$prev_prerender_payload_file" ]; then
    BLOG_NOSTR_PRERENDER_PAYLOAD_FILE=$prev_prerender_payload_file
    export BLOG_NOSTR_PRERENDER_PAYLOAD_FILE
  else
    unset BLOG_NOSTR_PRERENDER_PAYLOAD_FILE
  fi
  chmod 644 "$page_file" 2>/dev/null || true
  blog_nostr_page_sync_mount "$slug" "$page_type" >/dev/null 2>&1 || true
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
    {
      errors: (
        []
        + (if ($strict == "true" and ($title | length) == 0) then ["Title is required"] else [] end)
        + (if $is_product and (($price | length) == 0) then ["Product price is required"] else [] end)
        + (if (($price | length) > 0 and (is_price($price) | not)) then ["Price must be a positive USD amount with up to 2 decimals"] else [] end)
        + (if (($price | length) > 0 and (is_price($price)) and (($price | tonumber) <= 0)) then ["Price must be greater than zero"] else [] end)
        + (if $is_product and (($currency | test("^[A-Z]{3}$")) | not) then ["Currency must be a 3-letter code"] else [] end)
        + (if $is_product and (($purchase_endpoint | length) == 0) then ["Purchase endpoint is required"] else [] end)
        + (if $is_product and (($purchase_endpoint | length) > 0) and ((($purchase_endpoint | startswith("/")) or ($purchase_endpoint | startswith("https://")) or ($purchase_endpoint | startswith("http://"))) | not) then ["Purchase endpoint must be an absolute path or URL"] else [] end)
      ),
      warnings: [],
      can_publish: (
        (
          []
          + (if ($strict == "true" and ($title | length) == 0) then ["Title is required"] else [] end)
          + (if $is_product and (($price | length) == 0) then ["Product price is required"] else [] end)
          + (if (($price | length) > 0 and (is_price($price) | not)) then ["Price must be a positive USD amount with up to 2 decimals"] else [] end)
          + (if (($price | length) > 0 and (is_price($price)) and (($price | tonumber) <= 0)) then ["Price must be greater than zero"] else [] end)
          + (if $is_product and (($currency | test("^[A-Z]{3}$")) | not) then ["Currency must be a 3-letter code"] else [] end)
          + (if $is_product and (($purchase_endpoint | length) == 0) then ["Purchase endpoint is required"] else [] end)
          + (if $is_product and (($purchase_endpoint | length) > 0) and ((($purchase_endpoint | startswith("/")) or ($purchase_endpoint | startswith("https://")) or ($purchase_endpoint | startswith("http://"))) | not) then ["Purchase endpoint must be an absolute path or URL"] else [] end)
        ) | length
      ) == 0
    }
  ' 2>/dev/null || printf '{"errors":[],"warnings":[],"can_publish":true}\n'
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
    def lightning_aliases: ["lightning","lightningaddress","ln","lud16","lnurlp"];
    def norm_extra_format($v):
      (($v // "") | tostring | ascii_downcase) as $f
      | if $f == "html" then "html" else "markdown" end;
    def norm_transport($v):
      (($v // "") | tostring | ascii_downcase
      | gsub("[^a-z0-9/]+";"")
      | gsub("/+";"/")
      | gsub("^/+|/+$";""));
    def transport_key($v):
      (norm_transport($v) | gsub("[^a-z0-9]+";""));
    def is_lightning_transport($v):
      (lightning_aliases | index(transport_key($v))) != null;
    def norm_qual($v):
      (($v // "") | tostring | ascii_downcase) as $q
      | if (qualifiers | index($q)) then $q else "" end;
    def norm_lud16($v):
      (($v // "") | tostring | gsub("^\\s+|\\s+$";"") | ascii_downcase);
    def is_lud16($v):
      ((norm_lud16($v) | test("^[^@[:space:]]+@[^@[:space:]]+$")));
    def parse_content_rows($obj):
      [ ($obj | to_entries[]) as $pair
        | ($pair.key | tostring) as $k
        | select($k != "title" and $k != "description")
        | ($pair.value | tostring) as $v
        | if ($k == "lud16") then
            { transport: "lightning", qualifier: "preferred", value: (norm_lud16($v)) }
          elif ($k | contains("_")) then
            ($k | split("_")) as $parts
            | ($parts[0] // "") as $base
            | ($parts[1:] | join("_")) as $suffix
            | if is_lightning_transport($base) then
                { transport: "lightning", qualifier: (if (qualifiers | index(($suffix | ascii_downcase))) then ($suffix | ascii_downcase) else "preferred" end), value: $v }
              elif (qualifiers | index(($suffix | ascii_downcase))) then
                { transport: $base, qualifier: ($suffix | ascii_downcase), value: $v }
              else
                { transport: $k, qualifier: "", value: $v }
              end
          elif is_lightning_transport($k) then
            { transport: "lightning", qualifier: "preferred", value: $v }
          else
            { transport: $k, qualifier: "", value: $v }
          end
      ];

    (if ((.content_json // null) | type) == "object" then .content_json
      elif ((.content // "") | type) == "string" and ((.content // "") | length) > 0 then (try (.content | fromjson) catch {})
      else {}
     end) as $content_obj
    | (if (.rows | type) == "array" and ((.rows | length) > 0) then .rows else parse_content_rows($content_obj) end) as $rows_raw
    | ($rows_raw
      | if type=="array" then . else [] end
      | map({
          transport: norm_transport(.transport // ""),
          value: ((.value // "") | tostring),
          qualifier: norm_qual(.qualifier // "")
        })
      | map(select((.transport | length) > 0 or (.value | length) > 0))
      ) as $rows
    | (($rows
        | map(select((is_lightning_transport(.transport)) and is_lud16(.value)))
        | map(norm_lud16(.value))
        | first) // "") as $row_lud16
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
        rows: $rows
      }
    | .content_json = (
        ({
          title: .title
        }
        + (if .publish_intro_to_nostr then {description: .description} else {} end)
        + (if ($row_lud16 | length) > 0 then {lud16: $row_lud16} else {} end))
        + (reduce .rows[] as $r ({};
            if (($r.transport | length) > 0 and ($r.value | length) > 0 and (is_lightning_transport($r.transport) | not)) then
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
    def lightning_aliases: ["lightning","lightningaddress","ln","lud16","lnurlp"];
    def norm_transport($v):
      (($v // "") | tostring | ascii_downcase
        | gsub("[^a-z0-9/]+";"")
        | gsub("/+";"/")
        | gsub("^/+|/+$";""));
    def transport_key($v):
      (norm_transport($v) | gsub("[^a-z0-9]+";""));
    def is_lightning_transport($v):
      (lightning_aliases | index(transport_key($v))) != null;
    def norm_lud16($v):
      (($v // "") | tostring | gsub("^\\s+|\\s+$";"") | ascii_downcase);
    def is_lud16($v):
      ((norm_lud16($v) | test("^[^@[:space:]]+@[^@[:space:]]+$")));
    def key_for($r):
      (($r.transport // "") + (if (($r.qualifier // "") | length) > 0 then ("_" + ($r.qualifier // "")) else "" end));

    (.rows // []) as $rows0
    | ($rows0 | if type=="array" then . else [] end
      | map({
          transport: norm_transport(.transport // ""),
          value: ((.value // "") | tostring),
          qualifier: ((.qualifier // "") | tostring | ascii_downcase)
        })
      ) as $rows
    | (($rows
        | map(select((is_lightning_transport(.transport)) and is_lud16(.value)))
        | map(norm_lud16(.value))
        | first) // "") as $row_lud16
    | ([ range(0; ($rows|length)) as $i
          | ($rows[$i]) as $r
          | if (($r.qualifier|length) > 0 and ((qualifiers | index($r.qualifier)) == null)) then
              "Row \(($i+1)) has invalid qualifier: \($r.qualifier)"
            elif (($r.transport|length) == 0 and ($r.value|length) > 0) then
              "Row \(($i+1)) is missing transport"
            elif ((is_lightning_transport($r.transport)) and (is_lud16($r.value) | not)) then
              "Row \(($i+1)) needs a valid lightning address"
            else empty end
       ]) as $errors0
    | ([ range(0; ($rows|length)) as $i
          | ($rows[$i]) as $r
          | if (($r.transport|length) > 0 and ($r.value|length) == 0) then
              "Row \(($i+1)) has no value"
            else empty end
       ]) as $warnings0
    | (reduce $rows[] as $r ({};
         if (($r.transport|length) > 0 and ($r.value|length) > 0 and (is_lightning_transport($r.transport) | not)) then
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
          + (if (.publish_intro_to_nostr // false) then { description: ((.description // "") | tostring) } else {} end)
          + (if ($row_lud16 | length) > 0 then { lud16: $row_lud16 } else {} end))
          + (reduce $rows[] as $r ({};
              if (($r.transport|length) > 0 and ($r.value|length) > 0 and (is_lightning_transport($r.transport) | not)) then
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

blog_nostr_contact_desired_state_json() {
  state_json=$(blog_nostr_page_load_draft_state_json "contact" "contact" 2>/dev/null || printf '')
  if [ -n "$state_json" ] && printf '%s\n' "$state_json" | jq -e 'type=="object"' >/dev/null 2>&1; then
    blog_contact_normalize_state_json "contact" "$state_json"
    return 0
  fi

  canonical_event=$(blog_nostr_contact_latest_event_json 2>/dev/null || printf '')
  if [ -n "$canonical_event" ]; then
    blog_contact_state_from_event_json "contact" "$canonical_event"
    return 0
  fi

  blog_contact_default_state_json "contact"
}

blog_nostr_contact_desired_event_json() {
  desired_state=$(blog_nostr_contact_desired_state_json 2>/dev/null || printf '')
  [ -n "$desired_state" ] || return 1
  validation_json=$(blog_contact_validate_and_enrich_state_json "$desired_state" false)
  can_publish=$(printf '%s\n' "$validation_json" | jq -r '.can_publish' 2>/dev/null || printf 'false')
  [ "$can_publish" = "true" ] || return 1
  content_json=$(printf '%s\n' "$validation_json" | jq -c '.content_json // {}' 2>/dev/null || printf '')
  [ -n "$content_json" ] || return 1
  blog_nostr_sign_contact_event "$content_json"
}

blog_nostr_contact_metadata_in_sync() {
  desired_event_json=$(blog_nostr_contact_desired_event_json 2>/dev/null || printf '')
  existing_event_json=$(blog_nostr_contact_latest_event_json 2>/dev/null || printf '')
  [ -n "$desired_event_json" ] || return 1
  [ -n "$existing_event_json" ] || return 1
  desired_signature=$(blog_nostr_event_signature_json "$desired_event_json" 2>/dev/null || printf '')
  existing_signature=$(blog_nostr_event_signature_json "$existing_event_json" 2>/dev/null || printf '')
  [ -n "$desired_signature" ] || return 1
  [ -n "$existing_signature" ] || return 1
  [ "$desired_signature" = "$existing_signature" ]
}

blog_nostr_sync_contact_metadata() {
  desired_state=$(blog_nostr_contact_desired_state_json 2>/dev/null || printf '')
  [ -n "$desired_state" ] || return 1
  validation_json=$(blog_contact_validate_and_enrich_state_json "$desired_state" false)
  can_publish=$(printf '%s\n' "$validation_json" | jq -r '.can_publish' 2>/dev/null || printf 'false')
  [ "$can_publish" = "true" ] || return 1
  content_json=$(printf '%s\n' "$validation_json" | jq -c '.content_json // {}' 2>/dev/null || printf '')
  [ -n "$content_json" ] || return 1

  desired_event_json=$(blog_nostr_sign_contact_event "$content_json" 2>/dev/null || printf '')
  [ -n "$desired_event_json" ] || return 1
  existing_event_json=$(blog_nostr_contact_latest_event_json 2>/dev/null || printf '')
  desired_signature=$(blog_nostr_event_signature_json "$desired_event_json" 2>/dev/null || printf '')
  existing_signature=$(blog_nostr_event_signature_json "$existing_event_json" 2>/dev/null || printf '')
  event_to_publish=$desired_event_json
  if [ -n "$existing_signature" ] && [ "$existing_signature" = "$desired_signature" ]; then
    event_to_publish=$existing_event_json
  fi
  if ! blog_nostr_publish_and_store_event_json "$event_to_publish" >/dev/null 2>&1; then
    return 1
  fi
  blog_nostr_page_save_draft_state_json "contact" "contact" "$desired_state"
  printf '%s\n' "$event_to_publish"
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
  if grep -q 'id="overworld-page-root"' "$file" 2>/dev/null; then
    printf 'overworld\n'
    return 0
  fi
  if grep -q 'id="list-page-root"' "$file" 2>/dev/null; then
    printf 'list\n'
    return 0
  fi
  if grep -q 'data-list-slug="' "$file" 2>/dev/null &&
     grep -q 'id="list-page-title"' "$file" 2>/dev/null &&
     grep -q 'id="list-page-content"' "$file" 2>/dev/null; then
    # Legacy generated list wrappers (for example id="<slug>-root") are still
    # managed list pages and should be kept on the current template path.
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
      grep -q '/static/nostr-page-bootstrap/' "$file" 2>/dev/null &&
      grep -q "/static/blog-page.js?v=$blog_nostr_blog_page_js_version" "$file" 2>/dev/null
      ;;
    nip23)
      grep -q 'id="nip23-page-title"' "$file" 2>/dev/null &&
      grep -q 'id="nip23-page-admin"' "$file" 2>/dev/null &&
      grep -q 'id="nip23-page-content"' "$file" 2>/dev/null &&
      grep -q '/static/nostr-page-bootstrap/' "$file" 2>/dev/null
      ;;
    public-ranking)
      grep -q 'id="public-ranking-title"' "$file" 2>/dev/null &&
      grep -q 'id="public-ranking-admin"' "$file" 2>/dev/null &&
      grep -q 'id="public-ranking-content"' "$file" 2>/dev/null &&
      grep -q '/static/nostr-page-bootstrap/' "$file" 2>/dev/null
      ;;
	    overworld)
	      grep -q 'id="overworld-page-root"' "$file" 2>/dev/null &&
	      grep -q 'data-overworld-game' "$file" 2>/dev/null &&
	      grep -q 'overworld-godot-frame-wrap' "$file" 2>/dev/null &&
	      grep -q '/static/nostr-page-bootstrap/' "$file" 2>/dev/null &&
	      grep -q "/static/overworld-game.js?v=$blog_nostr_overworld_game_js_version" "$file" 2>/dev/null
      ;;
    contact)
      grep -q 'id="contact-page-title"' "$file" 2>/dev/null &&
      grep -q 'id="contact-page-admin"' "$file" 2>/dev/null &&
      grep -q 'id="contact-page-content"' "$file" 2>/dev/null &&
      grep -q '/static/nostr-page-bootstrap/' "$file" 2>/dev/null &&
      grep -q '/static/nostr-publish-dialog.js' "$file" 2>/dev/null &&
      grep -q 'marked@11\.0\.0/marked\.min\.js' "$file" 2>/dev/null &&
      grep -q '/static/simplex-web-transport.js' "$file" 2>/dev/null &&
      grep -q "/static/simplex-web-browser-adapter-init.mjs?v=$blog_nostr_simplex_web_adapter_init_js_version" "$file" 2>/dev/null &&
      grep -q "/static/simplex-web-default-chat.js?v=$blog_nostr_simplex_web_default_chat_js_version" "$file" 2>/dev/null &&
      grep -q '/static/simplex-web-session-store.js' "$file" 2>/dev/null &&
      grep -q "/static/contact-page.js?v=$blog_nostr_contact_page_js_version" "$file" 2>/dev/null
      ;;
    list)
      grep -q 'id="list-page-title"' "$file" 2>/dev/null &&
      grep -q 'id="list-page-admin"' "$file" 2>/dev/null &&
      grep -q 'id="list-page-content"' "$file" 2>/dev/null &&
      grep -q '/static/nostr-page-bootstrap/' "$file" 2>/dev/null &&
      grep -q "/static/list-page.js?v=$blog_nostr_list_page_js_version" "$file" 2>/dev/null
      ;;
    icon-gallery)
      grep -q 'id="list-page-title"' "$file" 2>/dev/null &&
      grep -q 'id="list-page-admin"' "$file" 2>/dev/null &&
      grep -q 'id="list-page-content"' "$file" 2>/dev/null &&
      grep -q '/static/nostr-page-bootstrap/' "$file" 2>/dev/null &&
      grep -q "/static/list-page.js?v=$blog_nostr_list_page_js_version" "$file" 2>/dev/null
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

blog_nostr_pages_prune_clean_url_build_dirs() {
  prune_clean_url_cfg_json=${1-}
  prune_clean_url_build_dir=$blog_site_root/build
  [ -d "$prune_clean_url_build_dir" ] || return 0

  printf '%s\n' "$prune_clean_url_cfg_json" | jq -r '.pages[]? | .slug // ""' 2>/dev/null | while IFS= read -r prune_clean_url_slug || [ -n "$prune_clean_url_slug" ]; do
    prune_clean_url_slug=$(blog_nostr_page_slug "$prune_clean_url_slug")
    [ -n "$prune_clean_url_slug" ] || continue
    case "$prune_clean_url_slug" in
      .*|*/*|pages|static|cgi)
        continue
        ;;
    esac

    prune_clean_url_source_page=$blog_site_root/site/pages/$prune_clean_url_slug.md
    prune_clean_url_build_path=$prune_clean_url_build_dir/$prune_clean_url_slug
    [ -f "$prune_clean_url_source_page" ] || continue
    [ -d "$prune_clean_url_build_path" ] || continue
    rm -rf "$prune_clean_url_build_path"
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

<script src="/static/nostr-page-bootstrap/$slug.js"></script>
<script src="/static/nostr-publish-dialog.js"></script>
<script src="/static/simplex-web-transport.js"></script>
<script type="importmap">
{
  "imports": {
    "@noble/ciphers/": "https://cdn.jsdelivr.net/npm/@noble/ciphers@2.2.0/",
    "@noble/curves/": "https://cdn.jsdelivr.net/npm/@noble/curves@2.2.0/",
    "@noble/hashes/": "https://cdn.jsdelivr.net/npm/@noble/hashes@2.2.0/"
  }
}
</script>
<script type="module" src="/static/simplex-web-browser-adapter-init.mjs?v=$blog_nostr_simplex_web_adapter_init_js_version"></script>
<script src="/static/simplex-web-default-chat.js?v=$blog_nostr_simplex_web_default_chat_js_version"></script>
<script src="/static/simplex-web-session-store.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/video-chat-widget.js?v=20260524-janus-default1" data-video-chat-widget="1"></script>
<script src="/static/contact-page.js?v=$blog_nostr_contact_page_js_version"></script>
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

<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/nostr-page-bootstrap/$slug.js"></script>
<script src="/static/nostr-publish-dialog.js"></script>
<script src="/static/nip23-page.js?v=$blog_nostr_nip23_page_js_version"></script>
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
<h1 id="blog-page-title">$page_title</h1>
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

	<div id="blog-post-list" class="post-list"><p class="placeholder">No posts to show yet.</p></div>
<p id="blog-empty" class="placeholder" hidden>No posts match these filters.</p>
</div>
</div>
</section>

<script src="/static/nostr-page-bootstrap/$slug.js"></script>
<script src="/static/blog-page.js?v=$blog_nostr_blog_page_js_version"></script>
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

<script src="/static/nostr-page-bootstrap/$slug.js"></script>
<script src="/static/nostr-publish-dialog.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/public-ranking-page.js?v=$blog_nostr_public_ranking_page_js_version"></script>
EORANKING
      ;;
    overworld)
      cat > "$page_file" <<EOOVERWORLD
---
title: "$page_title"
published_at: "$(blog_now_iso)"
content_hash: ""
tags: ["nostr", "overworld"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

<section id="overworld-page-root" class="overworld-page-shell" data-page-slug="$slug" data-page-type="overworld" data-page-title="$page_title">
<div class="list-page-head overworld-page-head">
<h1 id="overworld-page-title">$page_title</h1>
</div>
	<div class="overworld-game-mount" data-overworld-game>
	$(blog_nostr_prerender_overworld_html)
	</div>
</section>

<script src="/static/nostr-page-bootstrap/$slug.js"></script>
<script src="/static/overworld-game.js?v=$blog_nostr_overworld_game_js_version"></script>
EOOVERWORLD
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

<script src="/static/nostr-page-bootstrap/$slug.js"></script>
<script src="/static/nostr-publish-dialog.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/list-page.js?v=$blog_nostr_list_page_js_version"></script>
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

<script src="/static/nostr-page-bootstrap/$slug.js"></script>
<script src="/static/nostr-publish-dialog.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@11.0.0/marked.min.js"></script>
<script src="/static/list-page.js?v=$blog_nostr_list_page_js_version"></script>
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
