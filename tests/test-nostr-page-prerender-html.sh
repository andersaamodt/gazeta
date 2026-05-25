#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

assert_file_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    pass
  else
    fail "$label (missing: $needle in $file)"
  fi
}

assert_file_not_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    fail "$label (unexpected: $needle in $file)"
  else
    pass
  fi
}

write_event() {
  pubkey=$1
  kind=$2
  event_id=$3
  created_at=$4
  tags_json=$5
  content=${6-""}
  dir="$blog_nostr_events_dir/$pubkey/$kind"
  mkdir -p "$dir"
  jq -cn \
    --arg id "$event_id" \
    --arg pubkey "$pubkey" \
    --argjson kind "$kind" \
    --argjson created_at "$created_at" \
    --argjson tags "$tags_json" \
    --arg content "$content" \
    '{id:$id,pubkey:$pubkey,kind:$kind,created_at:$created_at,tags:$tags,content:$content}' > "$dir/$event_id.json"
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/nostr-page-prerender-html.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=testsite
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
SITE_DATA="$SITES_DIR/.sitedata/$SITE_NAME"
BIN_DIR="$TMP_ROOT/bin"

export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"
export PATH="$BIN_DIR:$PATH"

mkdir -p "$SITE_ROOT/site/includes" "$SITE_ROOT/site/pages" "$SITE_ROOT/site/static" "$SITE_ROOT/build/static" "$SITE_DATA" "$BIN_DIR"

cat > "$BIN_DIR/config-get" <<'EOS'
#!/bin/sh
set -eu
file=${1-}
key=${2-}
[ -f "$file" ] || exit 1
line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)
[ -n "$line" ] || exit 1
printf '%s\n' "${line#*=}"
EOS
chmod +x "$BIN_DIR/config-get"

cat > "$SITE_ROOT/site.conf" <<'EOFCONF'
template=blog
theme=lapidarist
site_title=Fixture Site
append_site_title_to_page_title=false
plugin_video_chat=true
video_chat_rooms=Lobby
EOFCONF

cat > "$SITE_ROOT/site/includes/head.html" <<'EOFHEAD'
<script src="/static/site-bootstrap.js"></script>
EOFHEAD
cat > "$SITE_ROOT/site/includes/nav.md" <<'EOFNAV'
<nav class="site-nav">Fixture Nav</nav>
EOFNAV
cat > "$SITE_ROOT/site/includes/footer.md" <<'EOFFOOT'
<footer>Fixture Footer</footer>
EOFFOOT

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-list-common.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-public-ranking-common.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-nostr-pages-common.sh"

blog_init

KEY_A=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
NODE_ID=1111111111111111111111111111111111111111111111111111111111111111
ROOT_ID=2222222222222222222222222222222222222222222222222222222222222222
printf '%s\n' "$KEY_A" > "$blog_nostr_authors_file"

blog_nostr_pages_save_json '{
  "pages": [
    {"slug":"oeuvre","type":"list","show_in_nav":true,"placeholder_title":"Oeuvre"},
    {"slug":"reading-list","type":"list","show_in_nav":true,"placeholder_title":"Reading List"},
    {"slug":"software","type":"icon-gallery","show_in_nav":true,"placeholder_title":"Software"},
    {"slug":"blog","type":"blog","show_in_nav":true,"placeholder_title":"Blog"},
    {"slug":"values","type":"nip23","show_in_nav":true,"placeholder_title":"Values"},
    {"slug":"contact","type":"contact","show_in_nav":true,"placeholder_title":"Contact"},
    {"slug":"projects","type":"public-ranking","show_in_nav":true,"placeholder_title":"Projects"},
    {"slug":"overworld","type":"overworld","show_in_nav":true,"placeholder_title":"Overworld"}
  ]
}'

blog_nostr_page_save_draft_state_json oeuvre list '{
  "title":"Oeuvre",
  "description":"Grouped work",
  "group_by":"year",
  "show_markers":true,
  "elements":[
    {"type":"entry","markdown":"Oeuvre Entry","date":"2026","marker":"published"},
    {"type":"entry","markdown":"Another Work","date":"2025","marker":"draft"}
  ]
}'

blog_nostr_page_save_draft_state_json reading-list list '{
  "title":"Reading List",
  "description":"Public submissions",
  "group_by":"year",
  "allow_signed_in_submissions":true,
  "allow_signed_in_votes":true,
  "elements":[]
}'
public_entries_path=$(blog_list_public_entries_path reading-list)
mkdir -p "$(dirname "$public_entries_path")"
jq -cn '{
  id: "public-fixture-entry",
  markdown: "*Public Reading Fixture* by Example Author",
  description: "Submitted by a reader",
  marker: "book",
  date: "2026",
  submitter: "nostr-fixture",
  created_at: 1779344399
}' > "$public_entries_path"
jq -cn '{
  entry_id: "public-fixture-entry",
  voter: "nostr-voter",
  value: 1,
  created_at: 1779344400
}' > "$(blog_list_public_votes_path reading-list)"

blog_nostr_page_save_draft_state_json software icon-gallery '{
  "title":"Software",
  "description":"Image-backed software",
  "view_mode":"tile",
  "elements":[
    {"type":"entry","markdown":"Tiny App","description":"A compact fixture app","image_url":"/static/fixtures/tiny-app.png","post_url":"/tiny-app"}
  ]
}'

blog_nostr_page_save_draft_state_json values nip23 '{
  "title":"Values",
  "content":"Values body\n\nWith a second paragraph.",
  "extras_after":"After values"
}'

blog_nostr_page_save_draft_state_json contact contact '{
  "title":"Contact",
  "description":"Public contact rows",
  "rows":[
    {"transport":"email","qualifier":"preferred","value":"hello@example.com"},
    {"transport":"email","qualifier":"archive","value":"old@example.com"}
  ]
}'

write_event "$KEY_A" 30040 "$ROOT_ID" 100 "[[\"d\",\"projects\"],[\"t\",\"public-ranking\"],[\"title\",\"Projects\"],[\"summary\",\"Ranked public work\"],[\"a\",\"30041:$KEY_A:project-alpha\"]]" 'Project intro'
write_event "$KEY_A" 30041 "$NODE_ID" 200 '[["d","project-alpha"],["title","Project Alpha"],["summary","Ranked project row"],["status","approved"]]' '{}'
blog_nostr_page_save_draft_state_json projects public-ranking "$(jq -cn --arg coord "30041:$KEY_A:project-alpha" '{
  title: "Projects",
  description: "Ranked public work",
  content: "Project intro",
  root_refs: [$coord]
}')"

mkdir -p "$blog_posts_store_dir"
cat > "$blog_posts_store_dir/fixture-post.md" <<'EOFPOST'
---
title: "Fixture Blog Post"
published_at: "2026-05-24T12:00:00Z"
tags: ["essay"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

This post should be present in prerendered blog HTML.
EOFPOST

BLOG_NOSTR_PAGE_PRERENDER_TIMEOUT_SECONDS=10 "$ROOT_DIR/cgi/pre-build" >/dev/null 2>&1

for page in oeuvre reading-list software blog values contact projects overworld; do
  assert_file_contains "$SITE_ROOT/site/pages/$page.md" 'data-prerender-painted="true"' "$page page is marked as prerendered"
  assert_file_not_contains "$SITE_ROOT/site/pages/$page.md" 'Loading page content' "$page page does not ship page-loading copy"
  assert_file_not_contains "$SITE_ROOT/site/pages/$page.md" 'Loading posts' "$page page does not ship post-loading copy"
  assert_file_not_contains "$SITE_ROOT/site/pages/$page.md" 'data-page-initial-placeholder' "$page page does not ship legacy placeholder markers"
  assert_file_contains "$SITE_ROOT/site/static/nostr-page-bootstrap/$page.js" 'prerender_signature' "$page bootstrap carries the prerender signature"
  assert_file_not_contains "$SITE_ROOT/site/static/nostr-page-bootstrap/$page.js" 'paintFirstFrame' "$page bootstrap does not run client first-frame painting"
  assert_file_not_contains "$SITE_ROOT/site/static/nostr-page-bootstrap/$page.js" 'hasOnlyInitialPlaceholder' "$page bootstrap does not inspect legacy placeholders"
done

assert_file_contains "$SITE_ROOT/site/pages/oeuvre.md" 'Oeuvre Entry' 'list prerender includes grouped list entry'
assert_file_contains "$SITE_ROOT/site/pages/oeuvre.md" 'list-year-group' 'list prerender includes grouped section markup'
assert_file_contains "$SITE_ROOT/site/pages/reading-list.md" 'Public Reading Fixture' 'list prerender includes public submitted list entries'
assert_file_contains "$SITE_ROOT/site/pages/reading-list.md" 'data-list-entry-id="public-fixture-entry"' 'list prerender keeps public entry identity for hydration'
assert_file_contains "$SITE_ROOT/site/static/nostr-page-bootstrap/reading-list.js" 'public-fixture-entry' 'list bootstrap includes public submitted list entries'
assert_file_contains "$SITE_ROOT/site/pages/software.md" 'Tiny App' 'icon-gallery prerender includes tile label'
assert_file_contains "$SITE_ROOT/site/pages/software.md" 'list-tile-image' 'icon-gallery prerender includes image markup'
assert_file_contains "$SITE_ROOT/site/pages/blog.md" 'Fixture Blog Post' 'blog prerender includes public post card'
assert_file_contains "$SITE_ROOT/site/pages/values.md" 'Values body' 'NIP-23 prerender includes content body'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'hello@example.com' 'contact prerender includes public contact row'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'secure-chat-panel' 'contact prerender includes secure chat panel'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'contact-widget-video-chat' 'contact prerender includes video chat shell when the plugin is enabled'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'Calling unavailable' 'contact prerender includes a visible fallback while the video call widget loads'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'contact-archived-group' 'contact prerender includes archived contact rows'
assert_file_contains "$SITE_ROOT/site/pages/projects.md" 'Project Alpha' 'public ranking prerender includes ranking node row'
assert_file_contains "$SITE_ROOT/site/pages/overworld.md" 'overworld-godot-frame-wrap' 'Overworld prerender includes stable play surface'
assert_file_contains "$SITE_ROOT/site/pages/overworld.md" 'Download (6.8 MB)' 'Overworld prerender includes splash controls'

printf 'PASS: %s\n' "$PASS_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s\n' "$FAIL_COUNT" >&2
  exit 1
fi
