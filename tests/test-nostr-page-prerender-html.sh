#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

. "$SCRIPT_DIR/managed-page-test-helpers.sh"

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

normalize_text_fragment() {
  printf '%s' "${1-}" | node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  process.stdout.write(input.trim());
});
'
}

assert_text_equals() {
  actual=$(normalize_text_fragment "${1-}")
  expected=$(normalize_text_fragment "${2-}")
  label=$3
  if [ "$actual" = "$expected" ]; then
    pass
  else
    actual_cksum=$(printf '%s' "$actual" | cksum | awk '{print $1 ":" $2}')
    expected_cksum=$(printf '%s' "$expected" | cksum | awk '{print $1 ":" $2}')
    fail "$label (expected checksum $expected_cksum got $actual_cksum)"
  fi
}

extract_bootstrap_payload_json() {
  bootstrap_file=$1
  slug=$2
  node - "$bootstrap_file" "$slug" <<'EOFNODE'
const fs = require('fs');
const vm = require('vm');

const bootstrapFile = process.argv[2];
const slug = process.argv[3];
const source = fs.readFileSync(bootstrapFile, 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: bootstrapFile });
const payloads = sandbox.window && sandbox.window.__wizardryNostrPageBootstrap;
if (!payloads || typeof payloads !== 'object' || !payloads[slug]) {
  process.exit(1);
}
process.stdout.write(JSON.stringify(payloads[slug]));
EOFNODE
}

extract_element_field() {
  html_file=$1
  element_id=$2
  field=$3
  node - "$html_file" "$element_id" "$field" <<'EOFNODE'
const fs = require('fs');

const htmlFile = process.argv[2];
const elementId = process.argv[3];
const field = process.argv[4];
const html = fs.readFileSync(htmlFile, 'utf8');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isVoidTag(tagName) {
  return /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tagName);
}

const openTagPattern = new RegExp(`<([A-Za-z][A-Za-z0-9:-]*)([^>]*\\bid=["']${escapeRegex(elementId)}["'][^>]*)>`, 'i');
const openMatch = openTagPattern.exec(html);
if (!openMatch) {
  process.exit(1);
}

const tagName = openMatch[1];
const outerStart = openMatch.index;
const contentStart = outerStart + openMatch[0].length;
const tagPattern = /<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s[^<>]*?)?\s*\/?>/g;
tagPattern.lastIndex = outerStart;

let depth = 0;
let closingIndex = -1;
let outerEnd = -1;
let match;
while ((match = tagPattern.exec(html))) {
  if (String(match[1] || '').toLowerCase() !== tagName.toLowerCase()) {
    continue;
  }
  const tagText = match[0];
  const isClosing = tagText[1] === '/';
  const isSelfClosing = /\/>$/.test(tagText) || isVoidTag(tagName);
  if (isClosing) {
    depth -= 1;
    if (depth === 0) {
      closingIndex = match.index;
      outerEnd = tagPattern.lastIndex;
      break;
    }
    continue;
  }
  depth += 1;
  if (isSelfClosing) {
    depth -= 1;
    if (depth === 0) {
      closingIndex = tagPattern.lastIndex;
      outerEnd = tagPattern.lastIndex;
      break;
    }
  }
}

if (outerEnd < 0) {
  process.exit(1);
}

const outerHtml = html.slice(outerStart, outerEnd);
const innerHtml = html.slice(contentStart, closingIndex >= 0 ? closingIndex : outerEnd);
const attrs = openMatch[2] || '';

if (field === 'outer') {
  process.stdout.write(outerHtml);
} else if (field === 'inner') {
  process.stdout.write(innerHtml);
} else if (field === 'attrs') {
  process.stdout.write(attrs);
} else {
  process.exit(2);
}
EOFNODE
}

extract_element_inner_html() {
  extract_element_field "$1" "$2" inner
}

extract_element_attrs() {
  extract_element_field "$1" "$2" attrs
}

extract_class_element_inner_html() {
  html_file=$1
  class_name=$2
  node - "$html_file" "$class_name" <<'EOFNODE'
const fs = require('fs');

const htmlFile = process.argv[2];
const className = process.argv[3];
const html = fs.readFileSync(htmlFile, 'utf8');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const pattern = new RegExp(`<([A-Za-z][A-Za-z0-9:-]*)([^>]*\\bclass=["'][^"']*\\b${escapeRegex(className)}\\b[^"']*["'][^>]*)>([\\s\\S]*?)<\\/\\1>`, 'i');
const match = pattern.exec(html);
if (!match) {
  process.exit(1);
}
process.stdout.write(match[3] || '');
EOFNODE
}

assert_blog_shared_fragment_contract() {
  page_file=$1
  bootstrap_file=$2
  slug=$3
  label_prefix=$4

  payload_json=$(extract_bootstrap_payload_json "$bootstrap_file" "$slug")
  posts_json=$(printf '%s\n' "$payload_json" | jq -c '.bootstrap_posts // []')
  default_tag=$(printf '%s\n' "$payload_json" | jq -r '.state.default_tag // ""')
  expected_list_html=$(blog_post_cards_render_list_html "$posts_json" "$default_tag")
  expected_tags_html=$(blog_post_cards_render_tag_filter_html "$posts_json" "$default_tag")
  expected_years_html=$(blog_post_cards_render_year_filter_html "$posts_json")
  expected_types_html=$(blog_post_cards_render_type_filter_html "$posts_json")
  expected_empty_text=$(blog_post_cards_empty_text "$posts_json")
  expected_empty_attrs=$(blog_post_cards_empty_attrs "$posts_json")
  expected_description_html=$(printf '%s\n' "$payload_json" | jq -r '.prerender.description_html // ""')
  expected_description_attrs=$(printf '%s\n' "$payload_json" | jq -r '.prerender.description_attrs // ""')
  expected_content_html=$(printf '%s\n' "$payload_json" | jq -r '.prerender.content_html // ""')
  expected_content_attrs=$(printf '%s\n' "$payload_json" | jq -r '.prerender.content_attrs // ""')
  payload_tags_html=$(printf '%s\n' "$payload_json" | jq -r '.prerender.filter_tags_html // ""')
  payload_years_html=$(printf '%s\n' "$payload_json" | jq -r '.prerender.filter_years_html // ""')
  payload_types_html=$(printf '%s\n' "$payload_json" | jq -r '.prerender.filter_types_html // ""')

  actual_list_html=$(extract_element_inner_html "$page_file" blog-post-list)
  actual_tags_html=$(extract_element_inner_html "$page_file" blog-filter-tags)
  actual_years_html=$(extract_element_inner_html "$page_file" blog-filter-years)
  actual_types_html=$(extract_element_inner_html "$page_file" blog-filter-types)
  actual_empty_text=$(extract_element_inner_html "$page_file" blog-empty)
  actual_empty_attrs=$(extract_element_attrs "$page_file" blog-empty)
  actual_description_attrs=$(extract_element_attrs "$page_file" blog-page-description)
  actual_description_html=$(extract_class_element_inner_html "$page_file" list-page-description-text)
  actual_content_attrs=$(extract_element_attrs "$page_file" blog-page-content)
  actual_content_html=$(extract_element_inner_html "$page_file" blog-page-content)

  assert_text_equals "$actual_list_html" "$expected_list_html" "$label_prefix prerendered post list exactly matches the shared blog-card renderer"
  assert_text_equals "$payload_tags_html" "$expected_tags_html" "$label_prefix payload tag-filter fragment exactly matches the shared blog filter renderer"
  assert_text_equals "$payload_years_html" "$expected_years_html" "$label_prefix payload year-filter fragment exactly matches the shared blog filter renderer"
  assert_text_equals "$payload_types_html" "$expected_types_html" "$label_prefix payload type-filter fragment exactly matches the shared blog filter renderer"
  assert_text_equals "$actual_tags_html" "$expected_tags_html" "$label_prefix prerendered tag filters exactly match the shared blog filter renderer"
  assert_text_equals "$actual_years_html" "$expected_years_html" "$label_prefix prerendered year filters exactly match the shared blog filter renderer"
  assert_text_equals "$actual_types_html" "$expected_types_html" "$label_prefix prerendered type filters exactly match the shared blog filter renderer"
  assert_text_equals "$actual_empty_text" "$expected_empty_text" "$label_prefix prerendered empty-state text exactly matches the shared blog-card contract"
  assert_text_equals "$actual_description_html" "$expected_description_html" "$label_prefix prerendered description markup exactly matches the payload prerender fragment"
  assert_text_equals "$actual_content_html" "$expected_content_html" "$label_prefix prerendered content markup exactly matches the payload prerender fragment"

  case "$expected_empty_attrs" in
    *hidden*)
      case "$actual_empty_attrs" in
        *hidden*) pass ;;
        *) fail "$label_prefix prerendered empty-state visibility matches the shared blog-card contract" ;;
      esac
      ;;
    *)
      case "$actual_empty_attrs" in
        *hidden*) fail "$label_prefix prerendered empty-state visibility matches the shared blog-card contract" ;;
        *) pass ;;
      esac
      ;;
  esac

  case "$expected_description_attrs" in
    *hidden*)
      case "$actual_description_attrs" in
        *hidden*) pass ;;
        *) fail "$label_prefix prerendered description visibility matches the payload prerender attrs" ;;
      esac
      ;;
    *)
      case "$actual_description_attrs" in
        *hidden*) fail "$label_prefix prerendered description visibility matches the payload prerender attrs" ;;
        *) pass ;;
      esac
      ;;
  esac

  case "$expected_content_attrs" in
    *hidden*)
      case "$actual_content_attrs" in
        *hidden*) pass ;;
        *) fail "$label_prefix prerendered content visibility matches the payload prerender attrs" ;;
      esac
      ;;
    *)
      case "$actual_content_attrs" in
        *hidden*) fail "$label_prefix prerendered content visibility matches the payload prerender attrs" ;;
        *) pass ;;
      esac
      ;;
  esac
}

assert_managed_payload_contract() {
  body=$1
  expected_type=$2
  label=$3
  if printf '%s\n' "$body" | jq -e --arg expected_type "$expected_type" '
    (.success == true) and
    (has("slug") and (.slug | type == "string" and length > 0)) and
    (has("page_type") and (.page_type == $expected_type)) and
    (has("nav_title") and (.nav_title | type == "string")) and
    (has("kind") and (.kind | type == "number")) and
    (has("is_admin") and (.is_admin | type == "boolean")) and
    (has("viewer_authenticated") and (.viewer_authenticated | type == "boolean")) and
    (has("viewer_can_submit") and (.viewer_can_submit | type == "boolean")) and
    (has("view_mode") and (.view_mode | type == "string" and length > 0)) and
    (has("canonical_exists") and (.canonical_exists | type == "boolean")) and
    (has("draft_exists") and (.draft_exists | type == "boolean")) and
    (has("draft_differs") and (.draft_differs | type == "boolean")) and
    (has("sync_status") and (.sync_status | type == "object")) and
    (has("state") and (.state | type == "object")) and
    (has("canonical_state") and (.canonical_state | type == "object")) and
    (has("canonical_event") and ((.canonical_event == null) or (.canonical_event | type == "object"))) and
    (has("zap_config") and (.zap_config | type == "object")) and
    (has("validation") and (.validation | type == "object")) and
    (.validation | has("errors") and (.errors | type == "array")) and
    (.validation | has("warnings") and (.warnings | type == "array")) and
    (.validation | has("can_publish") and (.can_publish | type == "boolean")) and
    (has("prerender") and (.prerender | type == "object")) and
    (has("prerender_signature") and (.prerender_signature | type == "string" and length > 0))
  ' >/dev/null; then
    pass
  else
    fail "$label"
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
cp -R "$ROOT_DIR/site/lodestone" "$SITE_ROOT/site/lodestone"

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
<script defer src="/static/site-bootstrap.js"></script>
EOFHEAD
cat > "$SITE_ROOT/site/includes/nav.md" <<'EOFNAV'
<nav class="site-nav">Fixture Nav</nav>
EOFNAV
cat > "$SITE_ROOT/site/includes/footer.md" <<'EOFFOOT'
<footer>Fixture Footer</footer>
EOFFOOT

cat > "$SITE_ROOT/site/pages/index.md" <<'EOFINDEX'
# Index Local Fixture

This page exists only as a local source fixture.
EOFINDEX

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
    {"slug":"blog","type":"blog","show_in_nav":true,"placeholder_title":"Blog","default_tag":"writing"},
    {"slug":"values","type":"nip23","show_in_nav":true,"placeholder_title":"Values"},
    {"slug":"contact","type":"contact","show_in_nav":true,"placeholder_title":"Contact"},
    {"slug":"projects","type":"public-ranking","show_in_nav":true,"placeholder_title":"Projects"},
    {"slug":"overworld","type":"overworld","show_in_nav":true,"placeholder_title":"Overworld"}
  ]
}'

blog_state_markdown_write_json "$(blog_nostr_page_source_path oeuvre list)" '{
  "title":"Oeuvre",
  "description":"Grouped work",
  "group_by":"year",
  "show_marker_filters":true,
  "show_markers":true,
  "default_markers":"curated",
  "elements":[
    {"type":"entry","markdown":"Oeuvre Entry","date":"2026","marker":"curated"},
    {"type":"entry","markdown":"Post URL Label","post_url":"https://right.example/final","date":"2026","marker":"curated"},
    {"type":"entry","markdown":"[Linked Markdown Plus URL](https://wrong.example/ignored)","post_url":"https://right.example/final","date":"2026","marker":"curated"},
    {"type":"entry","markdown":"[Ultramemes](/oeuvre/ultramemes.mkv)","date":"2026","marker":"curated, video talk"},
    {"type":"entry","markdown":"Essay Work","date":"2025","marker":"essay"},
    {"type":"entry","markdown":"Another Work","date":"2025","marker":"draft"}
  ]
}' content

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
  allow_signed_in_submissions: true,
  root_refs: [$coord]
}')"

assert_file_contains "$blog_page_states_dir/values.md" 'title: "Values"' 'NIP-23 page state saves as YAML front matter'
assert_file_contains "$blog_page_states_dir/values.md" 'Values body' 'NIP-23 page markdown body saves outside front matter'
assert_file_contains "$blog_page_states_dir/software.md" 'elements: [{' 'list/gallery page structured fields save in YAML-compatible flow style'
if [ ! -e "$blog_lists_dir/values.json" ]; then
  pass
else
  fail 'NIP-23 page state no longer writes canonical JSON drafts'
fi

mkdir -p "$blog_lists_dir"
printf '%s\n' '{"title":"Legacy Page","content":"Legacy body","elements":[]}' > "$blog_lists_dir/legacy-json.json"
legacy_json=$(blog_nostr_page_load_draft_state_json legacy-json list)
legacy_title=$(printf '%s\n' "$legacy_json" | jq -r '.title // ""')
if [ "$legacy_title" = "Legacy Page" ]; then
  pass
else
  fail 'legacy JSON page state remains readable as a migration fallback'
fi

mkdir -p "$blog_posts_store_dir"
cat > "$blog_posts_store_dir/fixture-post.md" <<'EOFPOST'
---
title: "Fixture Blog Post"
published_at: "2026-05-24T12:00:00Z"
tags: ["writing","essay"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

This post should be present in prerendered blog HTML.
EOFPOST

cat > "$blog_posts_store_dir/non-writing-post.md" <<'EOFPOST'
---
title: "Filtered Out Post"
published_at: "2026-05-25T12:00:00Z"
tags: ["projects"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

This post should not be present in prerendered blog HTML.
EOFPOST

BLOG_NOSTR_PAGE_PRERENDER_TIMEOUT_SECONDS=30 "$ROOT_DIR/cgi/pre-build" >/dev/null 2>&1

oeuvre_payload=$(env REQUEST_METHOD=GET CONTENT_LENGTH=0 QUERY_STRING=page_slug=oeuvre "$ROOT_DIR/cgi/blog-get-nostr-page")
oeuvre_body=$(printf '%s\n' "$oeuvre_payload" | awk '{ sub(/\r$/, "") } BEGIN { body = 0 } body { print } /^$/ { body = 1 }')
if [ -z "$oeuvre_body" ]; then
  oeuvre_body=$oeuvre_payload
fi
if printf '%s\n' "$oeuvre_body" | jq -e '.view_mode == "local" and (.sync_status.local_has_source == true) and (.sync_status.message | contains("Visitors see the server copy")) and any(.state.elements[]?; .markdown == "Oeuvre Entry")' >/dev/null; then
  pass
else
  fail 'hydrated Nostr page payload keeps the server page-state as the visitor-visible source'
fi
assert_managed_payload_contract "$oeuvre_body" 'list' 'list page payload exposes the canonical managed-page envelope'

if printf '%s\n' "$oeuvre_body" | jq -e '(.prerender_signature // "") | type == "string" and length > 0' >/dev/null; then
  pass
else
  fail 'hydrated Nostr page payload carries a prerender signature for DOM preservation'
fi

if printf '%s\n' "$oeuvre_body" | jq -e '((.prerender.content_html // "") | contains("list-year-group")) and ((.prerender.content_attrs // "") == "")' >/dev/null; then
  pass
else
  fail 'hydrated Nostr page payload carries shared prerender fragments'
fi

index_payload=$(env REQUEST_METHOD=GET CONTENT_LENGTH=0 QUERY_STRING=page_slug=index "$ROOT_DIR/cgi/blog-get-nostr-page")
index_body=$(printf '%s\n' "$index_payload" | awk '{ sub(/\r$/, "") } BEGIN { body = 0 } body { print } /^$/ { body = 1 }')
if [ -z "$index_body" ]; then
  index_body=$index_payload
fi
if printf '%s\n' "$index_body" | jq -e '.success == true and .slug == "index" and .view_mode == "local" and (.sync_status.local_has_source == true)' >/dev/null; then
  pass
else
  fail 'index slug with only a local source stays readable instead of returning unknown_page'
fi

projects_payload=$(env REQUEST_METHOD=GET CONTENT_LENGTH=0 QUERY_STRING=page_slug=projects "$ROOT_DIR/cgi/blog-get-nostr-page")
projects_body=$(printf '%s\n' "$projects_payload" | awk '{ sub(/\r$/, "") } BEGIN { body = 0 } body { print } /^$/ { body = 1 }')
if [ -z "$projects_body" ]; then
  projects_body=$projects_payload
fi
if printf '%s\n' "$projects_body" | jq -e '(.state.root_coord // "") as $root | .success == true and ($root | length > 0) and any(.state.nodes[]?; .title == "Project Alpha") and any(.state.edges[]?; .parent == $root and .child == "30041:'"$KEY_A"':project-alpha")' >/dev/null; then
  pass
else
  fail 'public ranking page payload uses the shared enriched graph instead of falling back to a thin bootstrap-only shape'
fi
assert_managed_payload_contract "$projects_body" 'public-ranking' 'public ranking payload exposes the canonical managed-page envelope'

blog_payload=$(env REQUEST_METHOD=GET CONTENT_LENGTH=0 QUERY_STRING=page_slug=blog "$ROOT_DIR/cgi/blog-get-nostr-page")
blog_body=$(printf '%s\n' "$blog_payload" | awk '{ sub(/\r$/, "") } BEGIN { body = 0 } body { print } /^$/ { body = 1 }')
if [ -z "$blog_body" ]; then
  blog_body=$blog_payload
fi
assert_managed_payload_contract "$blog_body" 'blog' 'blog page payload exposes the canonical managed-page envelope'
if printf '%s\n' "$blog_body" | jq -e '.success == true and .page_type == "blog" and any(.bootstrap_posts[]?; .title == "Fixture Blog Post") and (any(.bootstrap_posts[]?; .title == "Filtered Out Post") | not)' >/dev/null; then
  pass
else
  fail 'blog page runtime payload carries the filtered bootstrap post-card list on the shared managed-page contract'
fi

values_payload=$(env REQUEST_METHOD=GET CONTENT_LENGTH=0 QUERY_STRING=page_slug=values "$ROOT_DIR/cgi/blog-get-nostr-page")
values_body=$(printf '%s\n' "$values_payload" | awk '{ sub(/\r$/, "") } BEGIN { body = 0 } body { print } /^$/ { body = 1 }')
if [ -z "$values_body" ]; then
  values_body=$values_payload
fi
assert_managed_payload_contract "$values_body" 'nip23' 'NIP-23 payload exposes the canonical managed-page envelope'

contact_payload=$(env REQUEST_METHOD=GET CONTENT_LENGTH=0 QUERY_STRING=page_slug=contact "$ROOT_DIR/cgi/blog-get-nostr-page")
contact_body=$(printf '%s\n' "$contact_payload" | awk '{ sub(/\r$/, "") } BEGIN { body = 0 } body { print } /^$/ { body = 1 }')
if [ -z "$contact_body" ]; then
  contact_body=$contact_payload
fi
assert_managed_payload_contract "$contact_body" 'contact' 'contact payload exposes the canonical managed-page envelope'

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
assert_file_contains "$SITE_ROOT/site/pages/oeuvre.md" 'list-marker-filter-pill is-include' 'list prerender includes selected default marker filter pill'
assert_file_contains "$SITE_ROOT/site/pages/oeuvre.md" 'data-marker-filter-action="toggle"' 'list prerender includes marker filter controls'
assert_file_contains "$SITE_ROOT/site/pages/oeuvre.md" '--marker-pill-h:' 'list prerender includes first-paint marker pill colors'
assert_file_contains "$SITE_ROOT/site/pages/oeuvre.md" 'list-entry-line list-depth-0 is-row-highlight' 'list prerender includes final read-only row striping'
assert_file_contains "$SITE_ROOT/site/pages/oeuvre.md" '<a class="list-entry-markdown is-post-url-linked" href="https://right.example/final" title="Open linked post">Post URL Label</a>' 'list prerender uses visitor-visible local source payload post_url links'
assert_file_contains "$SITE_ROOT/site/pages/oeuvre.md" '<span class="list-entry-markdown"><a href="https://wrong.example/ignored">Linked Markdown Plus URL</a></span><a class="list-entry-post-url-link" href="https://right.example/final" title="Open linked post" aria-label="Open linked post">' 'list prerender keeps Markdown links and shows post_url as an external-link action'
assert_file_not_contains "$SITE_ROOT/site/pages/oeuvre.md" '<a class="list-entry-markdown is-post-url-linked" href="https://right.example/final" title="Open linked post">Linked Markdown Plus URL</a>' 'list prerender does not replace Markdown links with post_url when both are present'
assert_file_contains "$SITE_ROOT/site/pages/oeuvre.md" '<a href="/oeuvre/ultramemes.mkv">Ultramemes</a>' 'list prerender preserves file links without extension-specific download attributes'
assert_file_not_contains "$SITE_ROOT/site/pages/oeuvre.md" '<a href="/oeuvre/ultramemes.mkv" download>' 'list prerender does not force MKV links to download HTML fallbacks'
assert_file_contains "$SITE_ROOT/site/pages/oeuvre.md" 'video talk' 'list prerender includes multi-word marker filter labels'
assert_file_not_contains "$SITE_ROOT/site/pages/oeuvre.md" '>curated</span>' 'list prerender hides selected default marker pills like the hydrated renderer'
assert_file_not_contains "$SITE_ROOT/site/pages/oeuvre.md" 'Essay Work' 'list prerender applies curated default marker filters before hydration'
assert_file_not_contains "$SITE_ROOT/site/pages/oeuvre.md" 'Another Work' 'list prerender applies default marker filters before hydration'
assert_file_contains "$SITE_ROOT/site/pages/reading-list.md" 'Public Reading Fixture' 'list prerender includes public submitted list entries'
assert_file_contains "$SITE_ROOT/site/pages/reading-list.md" 'data-list-entry-id="public-fixture-entry"' 'list prerender keeps public entry identity for hydration'
assert_file_contains "$SITE_ROOT/site/pages/reading-list.md" 'list-entry-vote-controls' 'list prerender includes reading-list vote controls'
assert_file_contains "$SITE_ROOT/site/pages/reading-list.md" 'data-list-vote-value="1"' 'list prerender includes upvote buttons'
assert_file_not_contains "$SITE_ROOT/site/pages/reading-list.md" 'data-list-vote-value="-1"' 'list prerender omits reading-list downvote buttons'
assert_file_contains "$SITE_ROOT/site/pages/reading-list.md" 'disabled aria-disabled="true"' 'list prerender renders anonymous vote buttons disabled'
assert_file_contains "$SITE_ROOT/site/static/nostr-page-bootstrap/reading-list.js" 'public-fixture-entry' 'list bootstrap includes public submitted list entries'
assert_file_contains "$SITE_ROOT/site/pages/software.md" 'Tiny App' 'icon-gallery prerender includes tile label'
assert_file_contains "$SITE_ROOT/site/pages/software.md" 'list-tile-image' 'icon-gallery prerender includes image markup'
assert_file_contains "$SITE_ROOT/site/pages/software.md" 'class="list-page-shell icon-gallery-shell"' 'icon-gallery prerender emits a stable shell class'
assert_file_not_contains "$SITE_ROOT/site/pages/software.md" "printf ' icon-gallery-shell" 'icon-gallery prerender does not leak shell fragments into HTML'
assert_file_not_contains "$SITE_ROOT/site/pages/oeuvre.md" 'marked@11.0.0/marked.min.js' 'list prerender does not block hydration on the external Markdown renderer'
assert_file_not_contains "$SITE_ROOT/site/pages/software.md" 'marked@11.0.0/marked.min.js' 'icon-gallery prerender does not block hydration on the external Markdown renderer'
assert_file_contains "$SITE_ROOT/site/pages/blog.md" 'Fixture Blog Post' 'blog prerender includes public post card'
assert_file_contains "$SITE_ROOT/site/pages/blog.md" 'blog-inline-tag' 'blog prerender includes post tag chips'
assert_file_contains "$SITE_ROOT/site/pages/blog.md" 'writing' 'blog prerender includes the default-tag text'
assert_file_not_contains "$SITE_ROOT/site/pages/blog.md" 'data-post-path="posts/fixture-post.md""' 'blog prerender does not emit malformed post-path attributes in post cards'
assert_file_contains "$SITE_ROOT/site/pages/blog.md" 'class="tag blog-inline-tag is-active" data-inline-tag="writing" aria-pressed="true">writing</button>' 'blog prerender keeps the default tag visually active on post cards before hydration'
assert_file_contains "$SITE_ROOT/site/pages/blog.md" 'class="blog-filter-chip is-active" data-filter-group="tags" data-filter-value="writing" aria-pressed="true">writing</button>' 'blog prerender keeps the default tag visually active in the filter panel before hydration'
assert_managed_page_title_shell "$SITE_ROOT/site/pages/blog.md" "blog-page-title" "Blog" "blog-page-title-actions" 'blog prerender includes the hydration-matching shared title shell'
assert_file_not_contains "$SITE_ROOT/site/pages/blog.md" 'Filtered Out Post' 'blog prerender applies default-tag filtering before hydration'
assert_file_not_contains "$SITE_ROOT/site/static/nostr-page-bootstrap/blog.js" 'Filtered Out Post' 'blog bootstrap excludes posts outside the default tag'
assert_file_contains "$SITE_ROOT/site/static/nostr-page-bootstrap/blog.js" 'blog-inline-tag is-active' 'blog bootstrap carries post-card HTML with the default tag active before hydration'
assert_file_contains "$SITE_ROOT/site/static/nostr-page-bootstrap/blog.js" '"prerender"' 'blog bootstrap carries shared prerender fragments'
assert_blog_shared_fragment_contract "$SITE_ROOT/site/pages/blog.md" "$SITE_ROOT/site/static/nostr-page-bootstrap/blog.js" blog 'blog page'
assert_file_contains "$SITE_ROOT/site/pages/values.md" 'Values body' 'NIP-23 prerender includes content body'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'hello@example.com' 'contact prerender includes public contact row'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'secure-chat-panel' 'contact prerender includes secure chat panel'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'secure-chat-login-gate' 'contact prerender includes the final Secure Chat login gate'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'contact-widget-video-chat' 'contact prerender includes video chat shell when the plugin is enabled'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'vcw-shell vcw-shell-no-heading vcw-shell-center-precall' 'contact prerender includes the final call widget shell while the video widget loads'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'vcw-call-owner-btn' 'contact prerender includes final icon call controls while the video widget loads'
assert_file_contains "$SITE_ROOT/site/pages/contact.md" 'contact-archived-group' 'contact prerender includes archived contact rows'
assert_file_contains "$SITE_ROOT/site/pages/projects.md" 'Project Alpha' 'public ranking prerender includes ranking node row'
assert_file_contains "$SITE_ROOT/site/pages/projects.md" 'public-ranking-level depth-0' 'public ranking prerender includes the hierarchical ranking list shell'
assert_file_contains "$SITE_ROOT/site/pages/projects.md" 'public-ranking-metrics' 'public ranking prerender includes metric summary rows'
assert_file_contains "$SITE_ROOT/site/pages/projects.md" 'data-ranking-action="vote"' 'public ranking prerender includes disabled vote controls in the anonymous visitor shell'
assert_file_not_contains "$SITE_ROOT/site/static/nostr-page-bootstrap/projects.js" '"view_mode":"static-fallback"' 'public ranking bootstrap comes from the shared hydrated payload path'
assert_file_contains "$ROOT_DIR/cgi/blog-public-ranking-common.sh" '.allow_signed_in_submissions == true' 'public ranking normalization maps legacy signed-in submissions flag to open mode'
assert_file_contains "$SITE_ROOT/site/pages/overworld.md" 'overworld-godot-frame-wrap' 'Overworld prerender includes stable play surface'
assert_file_contains "$SITE_ROOT/site/pages/overworld.md" 'Download (6.8 MB)' 'Overworld prerender includes splash controls'

file_mtime() {
  mtime_path=${1-}
  stat -f '%m' "$mtime_path" 2>/dev/null || stat -c '%Y' "$mtime_path" 2>/dev/null || printf '0\n'
}

blog_page_checksum_before=$(cksum "$SITE_ROOT/site/pages/blog.md")
blog_page_mtime_before=$(file_mtime "$SITE_ROOT/site/pages/blog.md")
oeuvre_mount_checksum_before=$(cksum "$SITE_ROOT/site/pages/oeuvre.md")
oeuvre_mount_mtime_before=$(file_mtime "$SITE_ROOT/site/pages/oeuvre.md")
sleep 1
BLOG_NOSTR_PAGE_PRERENDER_TIMEOUT_SECONDS=30 "$ROOT_DIR/cgi/pre-build" >/dev/null 2>&1
blog_page_checksum_after=$(cksum "$SITE_ROOT/site/pages/blog.md")
blog_page_mtime_after=$(file_mtime "$SITE_ROOT/site/pages/blog.md")
oeuvre_mount_checksum_after=$(cksum "$SITE_ROOT/site/pages/oeuvre.md")
oeuvre_mount_mtime_after=$(file_mtime "$SITE_ROOT/site/pages/oeuvre.md")
if [ "$blog_page_checksum_before" = "$blog_page_checksum_after" ] && [ "$blog_page_mtime_before" = "$blog_page_mtime_after" ]; then
  pass
else
  fail 'second prerender leaves unchanged blog source bytes and mtime intact'
fi
if [ "$oeuvre_mount_checksum_before" = "$oeuvre_mount_checksum_after" ] && [ "$oeuvre_mount_mtime_before" = "$oeuvre_mount_mtime_after" ]; then
  pass
else
  fail 'second prerender leaves unchanged list mount bytes and mtime intact'
fi

INDEX_SITE_NAME=indexblog
INDEX_SITES_DIR="$TMP_ROOT/index-sites"
INDEX_SITE_ROOT="$INDEX_SITES_DIR/$INDEX_SITE_NAME"
INDEX_SITE_DATA="$INDEX_SITES_DIR/.sitedata/$INDEX_SITE_NAME"

mkdir -p "$INDEX_SITE_ROOT/site/includes" "$INDEX_SITE_ROOT/site/pages" "$INDEX_SITE_ROOT/site/static" "$INDEX_SITE_ROOT/build/static" "$INDEX_SITE_DATA"
cp -R "$ROOT_DIR/site/lodestone" "$INDEX_SITE_ROOT/site/lodestone"

cat > "$INDEX_SITE_ROOT/site.conf" <<'EOFCONF'
template=blog
theme=lapidarist
site_title=Writing Fixture
append_site_title_to_page_title=false
EOFCONF

cat > "$INDEX_SITE_ROOT/site/includes/head.html" <<'EOFHEAD'
<script defer src="/static/site-bootstrap.js"></script>
EOFHEAD
cat > "$INDEX_SITE_ROOT/site/includes/nav.md" <<'EOFNAV'
<nav class="site-nav">Fixture Nav</nav>
EOFNAV
cat > "$INDEX_SITE_ROOT/site/includes/footer.md" <<'EOFFOOT'
<footer>Fixture Footer</footer>
EOFFOOT

export WIZARDRY_SITES_DIR="$INDEX_SITES_DIR"
export WIZARDRY_SITE_NAME="$INDEX_SITE_NAME"

env WIZARDRY_SITES_DIR="$INDEX_SITES_DIR" WIZARDRY_SITE_NAME="$INDEX_SITE_NAME" sh -c '
  set -eu
  ROOT_DIR=$1
  KEY_A=$2
  . "$ROOT_DIR/cgi/blog-lib.sh"
  . "$ROOT_DIR/cgi/blog-list-common.sh"
  . "$ROOT_DIR/cgi/blog-public-ranking-common.sh"
  . "$ROOT_DIR/cgi/blog-nostr-pages-common.sh"
  blog_init
  printf "%s\n" "$KEY_A" > "$blog_nostr_authors_file"
  blog_nostr_pages_save_json '"'"'{
    "pages": [
      {"slug":"index","type":"blog","show_in_nav":true,"placeholder_title":"Writing","default_tag":"writing"},
      {"slug":"blog","type":"blog","show_in_nav":true,"placeholder_title":"Blog"}
    ]
  }'"'"'
  cat > "$blog_posts_store_dir/writing-post.md" <<'"'"'EOFPOST'"'"'
---
title: "Writing Fixture Post"
published_at: "2026-05-24T12:00:00Z"
tags: ["writing","essay"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
summary: "Writing summary"
---

This post should be present in the prerendered Writing page HTML.
EOFPOST
  cat > "$blog_posts_store_dir/non-writing-post.md" <<'"'"'EOFPOST'"'"'
---
title: "Non Writing Fixture Post"
published_at: "2026-05-25T12:00:00Z"
tags: ["projects"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
summary: "Other summary"
---

This post should not be present in the prerendered Writing page HTML.
EOFPOST
  blog_nostr_page_save_draft_state_json index blog '"'"'{
    "title":"Writing",
    "content":"",
    "default_tag":"writing"
  }'"'"'
' sh "$ROOT_DIR" "$KEY_A"

BLOG_NOSTR_PAGE_PRERENDER_TIMEOUT_SECONDS=30 "$ROOT_DIR/cgi/pre-build" >/dev/null 2>&1

writing_payload=$(env REQUEST_METHOD=GET CONTENT_LENGTH=0 QUERY_STRING=page_slug=index "$ROOT_DIR/cgi/blog-get-nostr-page")
writing_body=$(printf '%s\n' "$writing_payload" | awk '{ sub(/\r$/, "") } BEGIN { body = 0 } body { print } /^$/ { body = 1 }')
if [ -z "$writing_body" ]; then
  writing_body=$writing_payload
fi

assert_managed_payload_contract "$writing_body" 'blog' 'index-backed Writing page payload exposes the canonical managed-page envelope'
if printf '%s\n' "$writing_body" | jq -e '.success == true and .slug == "index" and .page_type == "blog" and .nav_title == "Writing" and .state.title == "Writing"' >/dev/null; then
  pass
else
  fail 'index-backed Writing page payload keeps the managed blog identity and Writing title'
fi
if printf '%s\n' "$writing_body" | jq -e 'any(.bootstrap_posts[]?; .title == "Writing Fixture Post") and (any(.bootstrap_posts[]?; .title == "Non Writing Fixture Post") | not)' >/dev/null; then
  pass
else
  fail 'index-backed Writing page payload filters bootstrap posts through the shared default-tag contract'
fi
assert_file_contains "$INDEX_SITE_ROOT/site/pages/index.md" 'data-blog-slug="index" data-page-type="blog"' 'index-backed Writing page prerender keeps the managed blog root identity'
assert_managed_page_title_shell "$INDEX_SITE_ROOT/site/pages/index.md" "blog-page-title" "Writing" "blog-page-title-actions" 'index-backed Writing page prerender includes the hydration-matching shared title shell'
assert_file_contains "$INDEX_SITE_ROOT/site/pages/index.md" 'Writing Fixture Post' 'index-backed Writing page prerender includes the filtered writing post card'
assert_file_not_contains "$INDEX_SITE_ROOT/site/pages/index.md" 'data-post-path="posts/writing-post.md""' 'index-backed Writing page prerender does not emit malformed post-path attributes in post cards'
assert_file_contains "$INDEX_SITE_ROOT/site/pages/index.md" 'class="tag blog-inline-tag is-active" data-inline-tag="writing" aria-pressed="true">writing</button>' 'index-backed Writing page prerender keeps the default tag visually active on post cards before hydration'
assert_file_contains "$INDEX_SITE_ROOT/site/pages/index.md" 'class="blog-filter-chip is-active" data-filter-group="tags" data-filter-value="writing" aria-pressed="true">writing</button>' 'index-backed Writing page prerender keeps the default tag visually active in the filter panel before hydration'
assert_file_not_contains "$INDEX_SITE_ROOT/site/pages/index.md" 'Non Writing Fixture Post' 'index-backed Writing page prerender excludes posts outside the default tag'
assert_file_contains "$INDEX_SITE_ROOT/site/static/nostr-page-bootstrap/index.js" '"page_type":"blog"' 'index-backed Writing bootstrap keeps the managed blog page type'
assert_file_contains "$INDEX_SITE_ROOT/site/static/nostr-page-bootstrap/index.js" '"Writing Fixture Post"' 'index-backed Writing bootstrap carries the filtered writing post card'
assert_file_contains "$INDEX_SITE_ROOT/site/static/nostr-page-bootstrap/index.js" 'blog-inline-tag is-active' 'index-backed Writing bootstrap carries post-card HTML with the default tag active before hydration'
assert_file_not_contains "$INDEX_SITE_ROOT/site/static/nostr-page-bootstrap/index.js" 'Non Writing Fixture Post' 'index-backed Writing bootstrap excludes posts outside the default tag'
assert_blog_shared_fragment_contract "$INDEX_SITE_ROOT/site/pages/index.md" "$INDEX_SITE_ROOT/site/static/nostr-page-bootstrap/index.js" index 'index-backed Writing page'

printf 'PASS: %s\n' "$PASS_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s\n' "$FAIL_COUNT" >&2
  exit 1
fi
