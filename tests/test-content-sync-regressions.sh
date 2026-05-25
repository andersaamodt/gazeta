#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
SITE_SOURCE_ROOT="$ROOT_DIR/site"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

assert_eq() {
  expected=$1
  actual=$2
  label=$3
  if [ "$actual" = "$expected" ]; then
    pass
  else
    fail "$label (expected: $expected, actual: $actual)"
  fi
}

assert_nonempty() {
  actual=$1
  label=$2
  if [ -n "$actual" ]; then
    pass
  else
    fail "$label (value empty)"
  fi
}

assert_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s' "$haystack" | grep -Fq -- "$needle"; then
    pass
  else
    fail "$label (missing: $needle)"
  fi
}

assert_not_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s' "$haystack" | grep -Fq -- "$needle"; then
    fail "$label (unexpected: $needle)"
  else
    pass
  fi
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

assert_file_missing() {
  file=$1
  label=$2
  if [ ! -e "$file" ]; then
    pass
  else
    fail "$label (unexpected file: $file)"
  fi
}

assert_file_exists() {
  file=$1
  label=$2
  if [ -e "$file" ]; then
    pass
  else
    fail "$label (missing file: $file)"
  fi
}

assert_success() {
  if "$@" >/dev/null 2>&1; then
    pass
  else
    fail "command failed: $*"
  fi
}

wait_for_file() {
  file=$1
  attempts=${2-40}
  i=0
  while [ "$i" -lt "$attempts" ]; do
    if [ -e "$file" ]; then
      return 0
    fi
    sleep 0.05
    i=$((i + 1))
  done
  return 1
}

assert_fails() {
  if "$@" >/dev/null 2>&1; then
    fail "command unexpectedly succeeded: $*"
  else
    pass
  fi
}

assert_list_vote_cooldown_merge() {
  vote_path=$(blog_list_public_votes_path "probe-votes")
  mkdir -p "$(dirname "$vote_path")"
  now_epoch=$(blog_now_epoch)
  old_vote_at=$((now_epoch - 72000))
  recent_vote_at=$((now_epoch - 43200))
  latest_vote_at=$((recent_vote_at + 1))
  cat > "$vote_path" <<EOF_VOTES
{"entry_id":"entry-0","voter":"alice","value":1,"created_at":$old_vote_at}
{"entry_id":"entry-0","voter":"alice","value":1,"created_at":$recent_vote_at}
{"entry_id":"entry-0","voter":"bob","value":-1,"created_at":$latest_vote_at}
EOF_VOTES
  state='{"slug":"probe-votes","elements":[{"type":"entry","markdown":"One"}]}'
  validation='{"elements":[{"type":"entry","markdown":"One"}],"entries":[],"errors":[],"warnings":[],"can_publish":true}'
  expected_next_vote_at=$((recent_vote_at + 64800))
  if blog_list_merge_public_activity_json "$state" "$validation" "alice" | jq -e --argjson expected_next "$expected_next_vote_at" --argjson expected_latest "$latest_vote_at" '.elements[0].list_score == 1 and .elements[0].list_latest_vote == -1 and .elements[0].list_latest_vote_created_at == $expected_latest and .elements[0].viewer_vote == 1 and .elements[0].viewer_vote_total == 2 and .elements[0].viewer_can_vote_now == false and .elements[0].viewer_next_vote_at == $expected_next and .elements[0].vote_cooldown_seconds == 64800' >/dev/null 2>&1; then
    pass
  else
    fail "list vote merge counts every vote and exposes latest action plus viewer cooldown metadata"
  fi
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/nostr-sync-regression.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=testsite
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
SITE_DATA="$SITES_DIR/.sitedata/$SITE_NAME"
BIN_DIR="$TMP_ROOT/bin"

mkdir -p "$SITE_ROOT/site/pages" "$SITE_DATA" "$BIN_DIR"

cat > "$BIN_DIR/http-status" <<'EOS'
#!/bin/sh
printf 'STATUS:%s\n' "$*"
EOS
chmod +x "$BIN_DIR/http-status"

cat > "$BIN_DIR/http-header" <<'EOS'
#!/bin/sh
printf 'HEADER:%s=%s\n' "$1" "$2"
EOS
chmod +x "$BIN_DIR/http-header"

cat > "$BIN_DIR/http-end-headers" <<'EOS'
#!/bin/sh
printf 'END-HEADERS\n'
EOS
chmod +x "$BIN_DIR/http-end-headers"

cat > "$BIN_DIR/http-ok-html" <<'EOS'
#!/bin/sh
printf 'OK-HTML\n'
EOS
chmod +x "$BIN_DIR/http-ok-html"

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

cat > "$BIN_DIR/config-set" <<'EOS'
#!/bin/sh
set -eu
file=${1-}
key=${2-}
val=${3-}
mkdir -p "$(dirname "$file")"
if [ -f "$file" ]; then
  grep -v -E "^${key}=" "$file" > "$file.tmp" || true
else
  : > "$file.tmp"
fi
printf '%s=%s\n' "$key" "$val" >> "$file.tmp"
mv "$file.tmp" "$file"
EOS
chmod +x "$BIN_DIR/config-set"

cat > "$BIN_DIR/nostril" <<'EOS'
#!/bin/sh
set -eu
if [ "${MOCK_NOSTRIL_FAIL-0}" = "1" ]; then
  exit 1
fi
pub=${MOCK_NOSTRIL_PUBKEY-}
if [ -z "$pub" ]; then
  pub=1111111111111111111111111111111111111111111111111111111111111111
fi
printf '{"pubkey":"%s"}\n' "$pub"
EOS
chmod +x "$BIN_DIR/nostril"

export PATH="$BIN_DIR:$PATH"
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-list-common.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-public-ranking-common.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-nostr-pages-common.sh"

blog_init

unicode_form_encoded='Kelly%E2%80%94Pillzy%E2%80%99s%20%E2%80%9Cquote%E2%80%9D'
unicode_form_expected=$(printf 'Kelly\342\200\224Pillzy\342\200\231s \342\200\234quote\342\200\235')
assert_eq "$unicode_form_expected" "$(blog_param_decode_component "$unicode_form_encoded")" 'form decoder preserves utf-8 punctuation'
BLOG_REQUEST_BODY="content=$unicode_form_encoded"
assert_eq "$unicode_form_expected" "$(blog_param content)" 'request param decoder preserves utf-8 punctuation'
unset BLOG_REQUEST_BODY

KEY_A=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
KEY_B=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
KEY_C=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
KEY_D=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
ID_1=1111111111111111111111111111111111111111111111111111111111111111
ID_2=2222222222222222222222222222222222222222222222222222222222222222
ID_3=3333333333333333333333333333333333333333333333333333333333333333
ID_4=4444444444444444444444444444444444444444444444444444444444444444
ID_5=5555555555555555555555555555555555555555555555555555555555555555
ID_6=6666666666666666666666666666666666666666666666666666666666666666
ID_7=7777777777777777777777777777777777777777777777777777777777777777
ID_8=8888888888888888888888888888888888888888888888888888888888888888

mkdir -p "$blog_users_dir/anders"
cat > "$blog_users_dir/anders/profile.conf" <<EOF_AUTHOR_PROFILE
username=anders
publish_name=Anders
nostr_pubkey=$KEY_A
EOF_AUTHOR_PROFILE

nostr_projected_post="$blog_posts_dir/projected-author.md"
mkdir -p "$(dirname "$nostr_projected_post")"
cat > "$nostr_projected_post" <<EOF_PROJECTED_AUTHOR
---
title: "Projected Author"
author: "$(printf '%s' "$KEY_A" | cut -c1-16)"
nostr_projection: "true"
nostr_pubkey: "$KEY_A"
---

Body
EOF_PROJECTED_AUTHOR
assert_eq 'Anders' "$(blog_post_author_display_for_file "$nostr_projected_post")" 'projected post byline resolves matching Nostr pubkey to publish name'

unmatched_projected_post="$blog_posts_dir/projected-author-unmatched.md"
cat > "$unmatched_projected_post" <<EOF_PROJECTED_UNMATCHED
---
title: "Projected Author"
author: "$(printf '%s' "$KEY_B" | cut -c1-16)"
nostr_projection: "true"
nostr_pubkey: "$KEY_B"
---

Body
EOF_PROJECTED_UNMATCHED
assert_eq 'Nostr Author' "$(blog_post_author_display_for_file "$unmatched_projected_post")" 'projected post byline avoids exposing raw Nostr pubkey fallback'

front_matter_escape_fixture="$TMP_ROOT/front-matter-escape.md"
cat > "$front_matter_escape_fixture" <<'EOF_FRONT_MATTER_ESCAPE'
---
summary: "Quoted \"people\" should render without YAML escape slashes"
---

Body
EOF_FRONT_MATTER_ESCAPE
assert_eq 'Quoted "people" should render without YAML escape slashes' "$(blog_read_front_matter_value "$front_matter_escape_fixture" summary)" 'front matter reader unescapes quoted YAML strings'

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

conflicting_link_state=$(jq -cn '{group_by:"", elements:[{type:"entry", event_id:"event-1", post_url:"/posts/example", markdown:"[Example](/other)"}]}')
conflicting_link_validation=$(blog_list_validate_and_enrich_state_json "$conflicting_link_state" true)
assert_contains "$conflicting_link_validation" 'has both POST_URL and EVENT_ID; use one link source' 'list validation rejects entries with both explicit post_url and event_id'

# 1) Dynamic response headers must disable caches.
headers_out=$(blog_send_json_headers)
assert_contains "$headers_out" 'STATUS:200 OK' 'json headers status ok'
assert_contains "$headers_out" 'HEADER:Content-Type=application/json' 'json headers content type'
assert_contains "$headers_out" 'HEADER:Cache-Control=no-store, no-cache, must-revalidate, max-age=0' 'json headers cache-control'
assert_contains "$headers_out" 'HEADER:Pragma=no-cache' 'json headers pragma'
assert_contains "$headers_out" 'HEADER:Expires=0' 'json headers expires'
assert_contains "$headers_out" 'END-HEADERS' 'json headers terminator'

# 2) Publish endpoints must trigger sync and rebuild.
assert_file_contains "$ROOT_DIR/cgi/blog-publish-nostr-page" 'blog_nostr_pages_sync_source_pages >/dev/null 2>&1 || true' 'publish nostr page sync hook present'
assert_file_contains "$ROOT_DIR/cgi/blog-publish-nostr-page" 'blog_run_build_async >/dev/null 2>&1 || true' 'publish nostr page build hook present'
assert_file_contains "$ROOT_DIR/cgi/blog-publish-list-page" '. "$SCRIPT_DIR/blog-nostr-pages-common.sh"' 'publish list imports nostr pages common'
assert_file_contains "$ROOT_DIR/cgi/blog-publish-list-page" 'blog_nostr_pages_sync_source_pages >/dev/null 2>&1 || true' 'publish list sync hook present'
assert_file_contains "$ROOT_DIR/cgi/blog-publish-list-page" 'blog_run_build_async >/dev/null 2>&1 || true' 'publish list build hook present'
assert_file_contains "$ROOT_DIR/cgi/pre-build" 'blog_nostr_pages_sync_source_pages "$pages_json"' 'pre-build syncs source mounts from configured pages'
assert_file_contains "$ROOT_DIR/cgi/pre-build" 'site-bootstrap.js' 'pre-build writes static site bootstrap asset'
assert_file_contains "$ROOT_DIR/cgi/pre-build" 'footer-pages.json' 'pre-build writes static footer page list asset'
assert_file_contains "$ROOT_DIR/cgi/pre-build" 'footer_pages:' 'pre-build includes footer pages in site bootstrap'
assert_file_contains "$ROOT_DIR/cgi/pre-build" 'cp -R "$site_bootstrap_dir/nostr-page-bootstrap" "$build_bootstrap_dir/nostr-page-bootstrap"' 'pre-build copies prerendered page bootstraps into served build output'
assert_file_contains "$ROOT_DIR/cgi/pre-build" 'blog_public_posts_catalog_write_artifacts' 'pre-build writes static public post catalog'
assert_file_contains "$ROOT_DIR/cgi/pre-build" 'wizardry_blog_theme_v1' 'pre-build seeds cached theme bootstrap state'
assert_file_contains "$ROOT_DIR/cgi/blog-save-nostr-pages" 'blog_nostr_pages_sync_source_pages "$normalized"' 'save-nostr-pages refreshes source mounts'
assert_file_contains "$ROOT_DIR/cgi/blog-save-nostr-pages" 'blog_run_build_async' 'save-nostr-pages triggers rebuild'
assert_file_contains "$ROOT_DIR/cgi/blog-save-nostr-pages" 'blog_require_session true;' 'save-nostr-pages allows delegated admin sessions without interactive signer requirement'
assert_file_contains "$ROOT_DIR/cgi/blog-update-nostr-page-nav-title" 'blog_nostr_pages_sync_source_pages "$normalized"' 'nav-title update refreshes source mounts'
assert_file_contains "$ROOT_DIR/cgi/blog-update-nostr-page-nav-title" 'blog_run_build_async' 'nav-title update triggers rebuild'
assert_file_contains "$ROOT_DIR/cgi/blog-update-config" 'blog_run_build_async >/dev/null 2>&1 || true' 'config update queues rebuild for static bootstrap refresh'
assert_file_contains "$ROOT_DIR/cgi/blog-get-config" 'load_site_conf_values "$blog_site_conf"' 'blog-get-config parses site.conf in one pass'
assert_file_not_contains "$ROOT_DIR/cgi/blog-get-config" 'config-get "$blog_site_conf"' 'blog-get-config avoids repeated config-get subprocesses'
assert_file_contains "$ROOT_DIR/cgi/blog-list-public-posts" 'blog_public_posts_catalog_static_path' 'public posts endpoint reads prebuilt catalog first'
assert_file_contains "$ROOT_DIR/cgi/blog-index" 'blog_public_posts_catalog_static_path' 'blog index reads prebuilt catalog first'
assert_file_not_contains "$ROOT_DIR/cgi/blog-index" 'blog_collect_public_posts "$posts_tmp"' 'blog index no longer rescans posts on each request'
assert_file_contains "$ROOT_DIR/cgi/blog-get-nostr-page" 'elements: ($state.elements // [])' 'list page reads use state elements without synchronous Nostr enrichment'
assert_file_not_contains "$ROOT_DIR/cgi/blog-get-nostr-page" 'blog_list_validate_and_enrich_state_json "$view_state_json" false' 'list page reads do not block on per-entry post resolution'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'blog_nostr_pages_load_json_fast() {' 'fast normalized nostr pages loader exists for read-only paths'
assert_file_not_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" '. "$SCRIPT_DIR/blog-list-common.sh"' 'navbar endpoint avoids unrelated list library parse cost'
assert_file_not_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" '. "$SCRIPT_DIR/blog-public-ranking-common.sh"' 'navbar endpoint avoids unrelated ranking library parse cost'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'blog_nostr_page_write_prerendered_source() {' 'managed Nostr pages have a shared static HTML prerender writer'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'data-prerender-painted="true"' 'managed Nostr prerendered HTML marks stable static content'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'blog_nostr_pages_prune_clean_url_build_dirs() {' 'managed Nostr pages prune stale clean-url build copies before rebuild'
assert_file_contains "$ROOT_DIR/cgi/pre-build" 'blog_nostr_pages_prune_clean_url_build_dirs "$pages_json"' 'pre-build removes stale clean-url build copies for managed pages'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'blog_nostr_prerender_contact_video_chat_html() {' 'contact prerender reserves the public video chat shell when enabled'
assert_file_contains "$ROOT_DIR/cgi/blog-prerender-nostr-page-bootstraps" 'blog_nostr_page_write_prerendered_source "$slug" "$page_type" "$payload_json"' 'bootstrap prerender writes static source pages from the hydration payload'
assert_file_not_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'Loading page content...' 'managed templates do not ship generic page loading copy'
assert_file_not_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'Loading posts...' 'managed templates do not ship generic post loading copy'
assert_file_not_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'data-page-initial-placeholder' 'managed templates do not ship legacy placeholder markers'
assert_file_not_contains "$ROOT_DIR/cgi/blog-prerender-nostr-page-bootstraps" 'paintContactFirstFrame' 'bootstrap JS no longer paints the first contact frame on the client'
assert_file_not_contains "$ROOT_DIR/cgi/blog-prerender-nostr-page-bootstraps" 'paintListFirstFrame' 'bootstrap JS no longer paints the first list frame on the client'
assert_file_not_contains "$ROOT_DIR/cgi/blog-prerender-nostr-page-bootstraps" 'hasOnlyInitialPlaceholder' 'bootstrap JS no longer searches for legacy loading placeholders'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'hasMatchingStaticPrerender' 'list hydration preserves matching static prerendered DOM'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" 'hasMatchingStaticPrerender' 'blog hydration preserves matching static prerendered DOM'
assert_file_contains "$SITE_SOURCE_ROOT/static/overworld-game.js" 'existingShell' 'Overworld runtime reuses the prerendered game shell'

# 3) Frontend fetches must opt out of HTTP caches.
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "cache: 'no-store'" 'contact api no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" "cache: 'no-store'" 'nip23 api no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" "cache: 'no-store'" 'public ranking api no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "cache: 'no-store'" 'list api no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "cache: 'no-store'" 'blog page no-store present'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "renderLoadFallback(err, 'Page content is still loading." 'contact page suppresses transient raw load errors'
assert_file_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" "renderLoadFallback(err, 'Page content is still loading." 'nip23 page suppresses transient raw load errors'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" "renderLoadFallback(err, 'Page content is still loading." 'public ranking page suppresses transient raw load errors'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "renderLoadFallback(lastErr, 'Page content is still loading." 'list page suppresses transient raw load errors'
assert_file_contains "$SITE_SOURCE_ROOT/static/search-page.js" 'renderSearchLoadFallback(err);' 'search page suppresses transient raw load errors'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '<p class="placeholder">Error: ' 'contact page does not render raw fetch errors as content'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" '<p class="placeholder">Error: ' 'nip23 page does not render raw fetch errors as content'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" '<p class="placeholder">Error: ' 'public ranking page does not render raw fetch errors as content'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" '<p class="placeholder">Error: ' 'list page does not render raw fetch errors as content'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/search-page.js" '<p class="placeholder">Error: ' 'search page does not render raw fetch errors as content'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'BOOTSTRAP_CACHE_MAX_AGE_MS = 15000' 'list bootstrap cache has freshness window'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'BOOTSTRAP_CACHE_MAX_AGE_MS = 15000' 'public ranking bootstrap cache has freshness window'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'BOOTSTRAP_CACHE_MAX_AGE_MS = 15000' 'contact bootstrap cache has freshness window'
assert_file_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" 'BOOTSTRAP_CACHE_MAX_AGE_MS = 15000' 'nip23 bootstrap cache has freshness window'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" 'POSTS_CACHE_MAX_AGE_MS = 15000' 'blog posts cache has freshness window'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" 'data-inline-filter-group' 'blog post year and type pills can open and select filters'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" "blog_nostr_blog_page_js_version='20260524-inline-chip-active1'" 'blog page script cache buster tracks inline active filter chips'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'button.blog-type-pill,' 'blog listing type pill color does not require main-content wrapper'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'button.blog-year-pill,' 'blog listing year pill color does not require main-content wrapper'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-inline-tag {' 'blog list inline tags have a dedicated style hook'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'flex: 0 0 auto;' 'blog list inline tags keep intrinsic width'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "blog-inline-tag' + (isActive ? ' is-active' : '')" 'blog list inline tags expose active filter state'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "aria-pressed=\"' + (isActive ? 'true' : 'false')" 'blog list inline filters expose pressed state'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.post-card-meta-tags > button.tag.is-active' 'blog list inline active filter chips get a visible active style'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '.post-card-meta-tags > button.tag.is-active' 'Lapidarist inline active filter chips preserve a visible active style'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "data-blog-action=\"toggle-compose\"" 'blog page exposes inline compose toggle action'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "data-compose-action=\"publish\"" 'blog page inline composer exposes publish action'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "'/cgi/blog-save-post'" 'blog inline composer uses canonical blog-save-post endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "return fetchPostsJson('/static/public-posts.json')" 'blog posts prefer static catalog fetch'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "return fetchPostsJson('/cgi/blog-list-public-posts')" 'blog posts fall back to CGI catalog fetch'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'grid-template-columns: minmax(0, 1fr) auto;' 'blog layout reserves the right column for the filter button'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-filter-column {' 'blog layout defines a dedicated filter column'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'grid-column: 2;' 'blog filter button sits in the right grid column'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'grid-template-columns: minmax(0, 1fr);' 'mobile blog layout removes the filter gutter'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'position: absolute;' 'mobile blog filter button overlays without reserving a gutter'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "controls.appendChild(els.toggle);" 'blog admin title actions place Filter before Edit'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#blog-page-title .list-page-title-actions' 'blog title actions stay fit-to-content on mobile'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#blog-page-title .blog-title-action-bar' 'blog Filter and Edit share one title action row'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: 1.72rem;' 'draft notice close button is compact'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#main-content .blog-draft-notice .blog-draft-notice-close' 'draft notice close button beats generic content button chrome'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '#main-content .blog-draft-notice .blog-draft-notice-close' 'Lapidarist draft notice close button beats theme button chrome'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" ':not(.blog-draft-notice-close):not([role="menuitem"])' 'Lapidarist generic button chrome excludes draft notice close'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" ':not([role="menuitem"]))' 'Lapidarist button selector remains syntactically balanced after draft close exclusion'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background: rgba(15, 23, 42, 0.10);' 'draft notice close button only shows a translucent grey hover fill'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<a id="nav-site-signature" class="nav-site-signature" href="/">Site</a>' 'site title is a link by default'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'data-page="index">Writing</a>' 'static navbar starts with Writing to match hydrated navbar order'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'data-page="blog">Blog</a>' 'static navbar includes Blog after Writing before hydration'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "Object.assign({ cache: 'no-store' }, options || {})" 'admin fetch default no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'Bellheim zap target' 'zaps admin names the Bellheim-compatible zap target'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'Nostr Wallet Connect is a separate wallet-control secret' 'zaps admin distinguishes Lightning Address from NWC secret'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-zaps" '"recent_zaps":%s' 'zaps cgi emits a recent zap receipt list'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-zaps" 'sort_by(.received_at, .published_at) | reverse | .[:50]' 'zaps cgi returns received zaps from newest to oldest'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'id="zaps-received-list"' 'zaps admin page includes a received zaps table host'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'function renderReceivedZaps' 'zaps admin renders received zap receipts'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'No signed zaps received yet.' 'zaps admin shows an empty-state for received zaps'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'if (zapsEnabled && canReceive)' 'zaps nav badge trusts backend receive readiness'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/admin.js" 'zapsEnabled && signerReady && activeAddress && endpointReady && canReceive' 'zaps nav badge is not stricter than receive readiness'
admin_preload_body=$(awk '/function preloadAdminFirstPaint/{flag=1} flag{print} /^  function initSectionNavigation/{flag=0}' "$SITE_SOURCE_ROOT/static/admin.js")
noster_loader_body=$(awk '/async function loadNosterRuntime/{flag=1} flag{print} /^  async function runNosterAction/{flag=0}' "$SITE_SOURCE_ROOT/static/admin.js")
assert_not_contains "$noster_loader_body" 'setNosterButtonsBusy(true)' 'nostr status refresh does not disable controls'
assert_not_contains "$noster_loader_body" 'setNosterButtonsBusy(false)' 'nostr status refresh does not re-toggle controls'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'loadNosterRuntime({ background: true })' 'nostr background refresh runs without interrupting controls'
assert_contains "$admin_preload_body" 'loadZapsRuntime()' 'admin startup preloads zap status badge'
assert_not_contains "$admin_preload_body" 'loadPosts()' 'admin startup does not preload posts section'
assert_not_contains "$admin_preload_body" 'loadDrafts()' 'admin startup does not preload drafts section'
assert_not_contains "$admin_preload_body" 'loadFiles()' 'admin startup does not preload files section'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "Object.assign({ cache: 'no-store' }, options || {})" 'nav-auth fetch default no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "fetch('/cgi/blog-get-nostr-page', {" 'nav-auth prefetch call exists'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "fetch('/cgi/ssh-auth-check-session?session_token=' + encodeURIComponent(token), { cache: 'no-store' })" 'nav-auth check-session no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "fetch('/cgi/blog-list-navbar-pages', { cache: 'no-store' })" 'nav-auth navbar no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "fetch('/cgi/blog-get-config', { cache: 'no-store' })" 'nav-auth config no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'readBootstrapNavbarPages' 'nav-auth can hydrate navbar from static bootstrap'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'readBootstrapConfig' 'nav-auth can hydrate config from static bootstrap'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'syncNavSiteSignatureDestination' 'nav-auth keeps the site title linked to the first navbar page'

# Seed author allowlist for deterministic canonical selection tests.
printf '%s\n' "$KEY_A" "$KEY_B" > "$blog_nostr_authors_file"

# 4) Contact canonical selection tests.
write_event "$KEY_A" 0 "$ID_1" 100 '[]' '{"name":"old-a"}'
write_event "$KEY_B" 0 "$ID_2" 200 '[]' '{"name":"new-b"}'
contact_json=$(blog_nostr_contact_latest_event_json)
assert_nonempty "$contact_json" 'contact latest returns json'
assert_eq "$ID_2" "$(printf '%s' "$contact_json" | jq -r '.id')" 'contact latest picks newest created_at among authors'
assert_eq "$KEY_B" "$(printf '%s' "$contact_json" | jq -r '.pubkey')" 'contact latest pubkey matches newest author'

# Tie-break by id when created_at equals.
write_event "$KEY_A" 0 "$ID_3" 300 '[]' '{"name":"tie-a"}'
write_event "$KEY_B" 0 "$ID_4" 300 '[]' '{"name":"tie-b"}'
contact_tie=$(blog_nostr_contact_latest_event_json)
assert_eq "$ID_4" "$(printf '%s' "$contact_tie" | jq -r '.id')" 'contact tie-breaker uses id ordering'

# Allowlist filter should exclude non-author events.
write_event "$KEY_C" 0 "$ID_5" 999 '[]' '{"name":"not-allowed"}'
contact_filtered=$(blog_nostr_contact_latest_event_json)
assert_eq "$ID_4" "$(printf '%s' "$contact_filtered" | jq -r '.id')" 'contact ignores non-allowlisted author'

# Empty allowlist should consider all authors.
: > "$blog_nostr_authors_file"
contact_all=$(blog_nostr_contact_latest_event_json)
assert_eq "$ID_5" "$(printf '%s' "$contact_all" | jq -r '.id')" 'contact with empty allowlist considers all authors'

# Restore allowlist.
printf '%s\n' "$KEY_A" "$KEY_B" > "$blog_nostr_authors_file"

# 5) NIP23 canonical selection tests.
write_event "$KEY_A" 30023 "$ID_6" 500 '[["d","about"],["title","About Old"]]' 'old about'
write_event "$KEY_B" 30023 "$ID_7" 700 '[["d","about"],["title","About New"]]' 'new about'
write_event "$KEY_B" 30023 "$ID_8" 800 '[["d","blog"],["title","Blog Page"]]' 'blog page'
about_json=$(blog_nostr_nip23_latest_event_json 'about')
assert_eq "$ID_7" "$(printf '%s' "$about_json" | jq -r '.id')" 'nip23 picks latest matching slug'
assert_eq 'about' "$(printf '%s' "$about_json" | jq -r '([.tags[] | select(.[0]=="d") | .[1]] | first)')" 'nip23 returns requested d tag'

# Slug mismatch should not leak.
blog_slug_json=$(blog_nostr_nip23_latest_event_json 'blog')
assert_eq "$ID_8" "$(printf '%s' "$blog_slug_json" | jq -r '.id')" 'nip23 blog slug isolated from about slug'

# Non-allowlisted newer event should be ignored.
write_event "$KEY_C" 30023 "$ID_1" 999 '[["d","about"],["title","Wrong Author"]]' 'wrong author'
about_filtered=$(blog_nostr_nip23_latest_event_json 'about')
assert_eq "$ID_7" "$(printf '%s' "$about_filtered" | jq -r '.id')" 'nip23 ignores non-allowlisted author'

# Empty allowlist uses all authors.
: > "$blog_nostr_authors_file"
about_all=$(blog_nostr_nip23_latest_event_json 'about')
assert_eq "$ID_1" "$(printf '%s' "$about_all" | jq -r '.id')" 'nip23 with empty allowlist accepts newest from any author'

# Tie break on id with same timestamp and slug.
printf '%s\n' "$KEY_A" "$KEY_B" > "$blog_nostr_authors_file"
write_event "$KEY_A" 30023 "$ID_2" 1200 '[["d","contact"],["title","Contact A"]]' 'contact a'
write_event "$KEY_B" 30023 "$ID_3" 1200 '[["d","contact"],["title","Contact B"]]' 'contact b'
contact_page_json=$(blog_nostr_nip23_latest_event_json 'contact')
assert_eq "$ID_3" "$(printf '%s' "$contact_page_json" | jq -r '.id')" 'nip23 tie-breaker by id works'

# Unknown slug should fail cleanly.
assert_fails blog_nostr_nip23_latest_event_json 'does-not-exist'

# Helper selectors: kind/list/addressable should return newest matching canonical event.
kind_latest=$(blog_nostr_kind_latest_event_json 30023)
assert_eq "$ID_3" "$(printf '%s' "$kind_latest" | jq -r '.id')" 'kind selector returns newest event across kind'
kind_latest_for_pubkey=$(blog_nostr_kind_latest_event_json 30023 "$KEY_A")
assert_eq "$ID_2" "$(printf '%s' "$kind_latest_for_pubkey" | jq -r '.id')" 'kind selector supports pubkey filter'

write_event "$KEY_A" 30004 "$ID_5" 2100 '[["d","list"],["title","Old List"]]' 'old list'
write_event "$KEY_B" 30004 "$ID_6" 2200 '[["d","list"],["title","New List"]]' 'new list'
list_latest=$(blog_nostr_list_latest_event_json 'list')
assert_eq "$ID_6" "$(printf '%s' "$list_latest" | jq -r '.id')" 'list selector returns newest event for requested slug'

write_event "$KEY_A" 30042 "$ID_7" 2300 '[["d","node-a"],["t","public-ranking-node"]]' '{}'
write_event "$KEY_A" 30042 "$ID_8" 2400 '[["d","node-a"],["t","public-ranking-node"]]' '{}'
addressable_latest=$(blog_nostr_addressable_latest_event_json 30042 "$KEY_A" 'node-a')
assert_eq "$ID_8" "$(printf '%s' "$addressable_latest" | jq -r '.id')" 'addressable selector returns newest event for pubkey+kind+d'
assert_fails blog_nostr_addressable_latest_event_json 30042 "$KEY_B" 'missing-node'

# 6) Public ranking canonical selection tests.
write_event "$KEY_A" 30040 "$ID_4" 1500 '[["d","assignments"],["t","public-ranking"],["title","Assignments Old"]]' '{"v":1}'
write_event "$KEY_B" 30040 "$ID_5" 1600 '[["d","assignments"],["t","public-ranking"],["title","Assignments New"]]' '{"v":2}'
write_event "$KEY_B" 30040 "$ID_6" 1700 '[["d","assignments"],["t","other-topic"],["title","Wrong Topic"]]' '{"v":3}'
ranking_json=$(blog_nostr_public_ranking_latest_event_json 'assignments')
assert_eq "$ID_5" "$(printf '%s' "$ranking_json" | jq -r '.id')" 'public ranking requires public-ranking topic'
assert_eq 'assignments' "$(printf '%s' "$ranking_json" | jq -r '([.tags[] | select(.[0]=="d") | .[1]] | first)')" 'public ranking keeps requested d tag'

# Non-allowlisted newer valid event ignored.
write_event "$KEY_C" 30040 "$ID_7" 1800 '[["d","assignments"],["t","public-ranking"],["title","Not Allowed"]]' '{"v":4}'
ranking_filtered=$(blog_nostr_public_ranking_latest_event_json 'assignments')
assert_eq "$ID_5" "$(printf '%s' "$ranking_filtered" | jq -r '.id')" 'public ranking ignores non-allowlisted author'

# Empty allowlist accepts newest valid event.
: > "$blog_nostr_authors_file"
ranking_all=$(blog_nostr_public_ranking_latest_event_json 'assignments')
assert_eq "$ID_7" "$(printf '%s' "$ranking_all" | jq -r '.id')" 'public ranking with empty allowlist accepts all authors'

# Tie-break by id with same created_at.
printf '%s\n' "$KEY_A" "$KEY_B" > "$blog_nostr_authors_file"
write_event "$KEY_A" 30040 "$ID_1" 1900 '[["d","roadmap"],["t","public-ranking"]]' '{}'
write_event "$KEY_B" 30040 "$ID_2" 1900 '[["d","roadmap"],["t","public-ranking"]]' '{}'
roadmap_json=$(blog_nostr_public_ranking_latest_event_json 'roadmap')
assert_eq "$ID_2" "$(printf '%s' "$roadmap_json" | jq -r '.id')" 'public ranking tie-breaker by id works'

# Unknown ranking slug should fail.
assert_fails blog_nostr_public_ranking_latest_event_json 'ghost-ranking'

# 7) Site pubkey cache refresh tests.
old_cached=9999999999999999999999999999999999999999999999999999999999999999
new_pub=abababababababababababababababababababababababababababababababab
printf '%s\n' "$old_cached" > "$blog_nostr_state_dir/site_pubkey"
printf '%s\n' 'deadbeef' > "$blog_nostr_secret_key_file"
export MOCK_NOSTRIL_PUBKEY="$new_pub"
unset MOCK_NOSTRIL_FAIL || true
resolved=$(blog_nostr_site_pubkey)
assert_eq "$new_pub" "$resolved" 'site pubkey resolves from current secret via nostril'
assert_eq "$new_pub" "$(cat "$blog_nostr_state_dir/site_pubkey")" 'site pubkey cache is refreshed when secret changes'

# If nostril unavailable/fails, fallback to cache.
export MOCK_NOSTRIL_FAIL=1
fallback=$(blog_nostr_site_pubkey)
assert_eq "$new_pub" "$fallback" 'site pubkey falls back to cache when nostril fails'

# If neither derivation nor cache works, fail.
rm -f "$blog_nostr_state_dir/site_pubkey"
assert_fails blog_nostr_site_pubkey
unset MOCK_NOSTRIL_FAIL || true

# 8) Additional anti-regression checks for cache directives in key files.
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'http-header "Cache-Control" "no-store, no-cache, must-revalidate, max-age=0"' 'cgi no-store cache control persists'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'http-header "Pragma" "no-cache"' 'cgi pragma no-cache persists'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'http-header "Expires" "0"' 'cgi expires no-cache persists'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'blog_nostr_contact_latest_event_json() {' 'contact latest selector function exists'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'blog_nostr_nip23_latest_event_json() {' 'nip23 latest selector function exists'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'blog_nostr_navbar_pages_json() {' 'shared navbar json helper exists'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'def blog_visible_tags: map(select((. | ascii_downcase) != "blog") | blog_canonical_visible_tag);' 'nostr projections keep blog tag out of visible post tags'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'if (key == "ai-shitpost" || key == "ai-quickpost") return "AI quickpost";' 'legacy AI-shitpost tag normalizes to AI quickpost'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'posts_canonical_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-posts-canonical.XXXXXX")' 'derived Nostr posts index canonicalizes legacy visible tags after rebuild'
assert_file_contains "$ROOT_DIR/site/static/post-context.js" 'data-post-inline-field="tags-input"' 'inline post tag editor uses stable text input'
assert_file_contains "$ROOT_DIR/site/static/post-context.js" 'data-post-inline-tag-remove=' 'inline post tag chips expose explicit remove buttons'
assert_file_not_contains "$ROOT_DIR/site/static/post-context.js" 'contenteditable="true" role="textbox" aria-label="Post tags"' 'inline post tag editor avoids contenteditable rerender glitches'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.blog-compose-card .tag-token-editor:focus-within' 'tag editor focus ring follows real input focus'
assert_file_contains "$ROOT_DIR/site/static/style.css" '.blog-compose-card .tag-token-editor-input' 'tag editor input styling exists'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'blog_nostr_footer_pages_json() {' 'shared footer json helper exists'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'show_in_footer' 'Nostr page config preserves footer visibility'
assert_file_contains "$ROOT_DIR/cgi/blog-public-ranking-common.sh" 'blog_nostr_public_ranking_latest_event_json() {' 'public ranking latest selector function exists'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_public_posts_catalog_build_json() {' 'shared public post catalog builder exists'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'summary_truncated: $summary_truncated,' 'public post catalog exposes condensed preview truncation'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_public_posts_catalog_write_artifacts() {' 'shared public post catalog writer exists'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'body:has(#blog-page-root)' 'blog page body has route-specific canvas guard'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background: transparent !important;' 'blog page body avoids a separate title background panel'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-post-item .post-card-footer .post-card-meta-tags > .tag' 'blog card tag strips remove legacy tag margins before flex centering'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'body:has(#blog-page-root)' 'lapidarist theme keeps blog body transparent over html canvas'
preview_fixture=$(printf 'Alpha beta\n\nGamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty\n')
expected_preview=$(printf 'Alpha beta\n\nGamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour...')
actual_preview=$(sh -c '. "$1/cgi/blog-lib.sh"; blog_condensed_preview_from_content "$2"' sh "$ROOT_DIR" "$preview_fixture")
assert_eq "$expected_preview" "$actual_preview" 'condensed blog previews preserve paragraph whitespace while truncating'
actual_preview_truncated=$(sh -c '. "$1/cgi/blog-lib.sh"; blog_condensed_preview_truncated "$2"' sh "$ROOT_DIR" "$preview_fixture")
assert_eq 'true' "$actual_preview_truncated" 'condensed blog previews expose truncation state'
link_preview_words=''
link_preview_i=1
while [ "$link_preview_i" -le 47 ]; do
  if [ -n "$link_preview_words" ]; then
    link_preview_words="$link_preview_words "
  fi
  link_preview_words="${link_preview_words}word$link_preview_i"
  link_preview_i=$((link_preview_i + 1))
done
link_preview_fixture=$(printf '%s [read the guide](https://example.com/really/long/path) tail words keep going\n' "$link_preview_words")
expected_link_preview=$(printf '%s [read the guide](https://example.com/really/long/path)...' "$link_preview_words")
actual_link_preview=$(sh -c '. "$1/cgi/blog-lib.sh"; blog_condensed_preview_from_content "$2"' sh "$ROOT_DIR" "$link_preview_fixture")
assert_eq "$expected_link_preview" "$actual_link_preview" 'condensed blog previews keep markdown links whole when truncating'
actual_link_preview_truncated=$(sh -c '. "$1/cgi/blog-lib.sh"; blog_condensed_preview_truncated "$2"' sh "$ROOT_DIR" "$link_preview_fixture")
assert_eq 'true' "$actual_link_preview_truncated" 'condensed blog previews mark truncation after a whole markdown link'
whole_link_preview_fixture=$(printf '%s [read the guide](https://example.com/really/long/path)\n' "$link_preview_words")
actual_whole_link_preview_truncated=$(sh -c '. "$1/cgi/blog-lib.sh"; blog_condensed_preview_truncated "$2"' sh "$ROOT_DIR" "$whole_link_preview_fixture")
assert_eq 'false' "$actual_whole_link_preview_truncated" 'condensed blog previews do not mark whole-link previews truncated when no text remains'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" '*/releases/*' 'blog lib detects managed releases path when resolving shared site data'
assert_file_not_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" 'blog_nostr_page_ensure_source_page "$slug" "$page_type"' 'navbar endpoint avoids source sync in hot path'
assert_file_not_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" 'blog_nostr_page_canonical_title' 'navbar endpoint avoids event scans for title lookup'
assert_file_not_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" 'blog_run_build_async' 'navbar endpoint no longer triggers builds from public traffic'
assert_file_not_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" 'navbar-build-trigger.epoch' 'navbar endpoint no longer manages rebuild throttle state'
assert_file_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" 'navbar-pages-cache.json' 'navbar endpoint uses short-lived response cache'
assert_file_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" 'site/static/navbar-pages.json' 'navbar endpoint serves prebuilt static navbar payload first'
assert_file_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" 'cache_ttl_seconds=600' 'navbar endpoint uses longer cache ttl after moving rebuilds out of hot path'
assert_file_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" 'exit 0' 'navbar endpoint exits immediately on fresh cache'
cfg_line=$(grep -n 'cfg=$(blog_nostr_pages_load_json_fast)' "$ROOT_DIR/cgi/blog-list-navbar-pages" | head -n 1 | cut -d: -f1 || printf '0')
cache_cat_line=$(grep -n 'cat "$cache_file"' "$ROOT_DIR/cgi/blog-list-navbar-pages" | head -n 1 | cut -d: -f1 || printf '0')
if [ "${cfg_line:-0}" -gt 0 ] && [ "${cache_cat_line:-0}" -gt 0 ] && [ "${cache_cat_line:-0}" -lt "${cfg_line:-0}" ]; then
  pass
else
  fail 'navbar cache response must happen before config load on fresh-cache hits'
fi
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" '/static/site-bootstrap.js' 'document head loads static site bootstrap before app code'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/head.html" '/cgi/blog-theme.css' 'document head no longer depends on CGI theme css for startup'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'document.write(markup);' 'document head emits theme stylesheet during parsing to avoid unthemed first paint'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0"' 'document head sets no-store cache control meta'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" "var ROUTE_REFRESH_PARAM = '__route_refresh';" 'document head defines stale route refresh sentinel'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'function slugsEquivalent(expected, root)' 'document head normalizes index/blog slug equivalence for route checks'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" "if (expectedSlug && rootSlug && !slugsEquivalent(expectedSlug, rootSlug))" 'document head detects route/root slug mismatch with slug-equivalence guard'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'showRouteLoadFailure();' 'document head shows explicit route load failure after retry mismatch'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'scheduleRouteLoadFailure();' 'document head defers route failure panel to avoid transient flash during hydration'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" "window.addEventListener('blog-page-initial-content-ready'" 'document head cancels route failure fallback once initial content paints'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'Page is still loading.' 'document head exposes clear mismatch fallback copy'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.route-load-failure {' 'route load failure panel style exists'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/head.html" "document.documentElement.classList.add('app-hydrating')" 'route transitions do not force global app-hydrating blank state'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'html.app-hydrating nav.site-nav,' 'hydration gate hides navbar until page is ready'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'icon-gallery' 'icon-gallery page type plumbing exists'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'data-page-type="list"' 'list mount template marks list page type explicitly'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" "blog_nostr_list_page_js_version='20260524-vote-tie-sort1'" 'list page script cache buster tracks vote tie sorting UI'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'image_url' 'list state supports image_url fields'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'description: (flex_description(.))' 'list state supports per-entry tile description fields'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'show_marker_filters' 'list state supports show_marker_filters toggle'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'dd bs="$cl" count=1' 'request body reader avoids byte-at-a-time reads for large editor saves'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'application/json|application/json\;*|text/plain|text/plain\;*)' 'request params support JSON-like POST bodies for large editor saves'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'case "$BLOG_REQUEST_BODY" in' 'request params detect raw JSON body shape regardless of allowed content type'
assert_file_contains "$ROOT_DIR/cgi/blog-save-nostr-page-draft" 'show_marker_filters=$(blog_param show_marker_filters)' 'save-draft endpoint accepts show_marker_filters setting'
assert_file_not_contains "$ROOT_DIR/cgi/blog-save-nostr-page-draft" 'blog_param extras_after_format' 'save-draft endpoint no longer accepts after-content format selector input'
assert_file_contains "$ROOT_DIR/cgi/blog-save-nostr-page-draft" "extras_after_format='markdown'" 'save-draft endpoint forces after-content format to markdown'
assert_file_contains "$ROOT_DIR/cgi/blog-save-nostr-page-draft" "validation_json='{\"errors\":[],\"warnings\":[],\"can_publish\":true}'" 'list draft save returns immediately without expensive validation'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "state.saveStatus = 'saving';" 'queued list autosaves immediately show saving state'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'var savedPayload = await apiPostJson' 'list draft saves keep returned server state'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'writeBootstrapCache(state.payload);' 'list draft saves refresh bootstrap cache for reload'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'closeActiveInlineEditor({ forceAutosave: true, skipAutosave: true });' 'row Done closes inline editor without delayed autosave'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'persistDraft({ alertOnError: true });' 'row Done saves immediately instead of waiting for autosave timer'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'extras_after_format: "markdown"' 'nip23/contact normalization forces after-content format to markdown'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'extras_after_format: "markdown"' 'list normalization forces after-content format to markdown'
assert_file_contains "$ROOT_DIR/cgi/blog-public-ranking-common.sh" 'extras_after_format: "markdown"' 'public ranking normalization forces after-content format to markdown'
assert_file_contains "$ROOT_DIR/cgi/blog-get-nostr-page" 'extras_after_format: "markdown"' 'page payload projection forces after-content format to markdown'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'function renderMarkdownWithWidgetIncludes' 'contact page local markdown supports explicit widget includes'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'function normalizeWidgetIncludeName' 'contact page parses exact widget names from include tokens'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'data-video-chat-token-endpoint="/cgi/blog-video-chat-token"' 'video chat widget include uses the token endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'data-video-chat-call-room-id="call-me"' 'video chat widget include exposes one-click owner call room'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'data-video-chat-call-label="Call"' 'video chat widget owner call button uses the contact-type action label'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'data-video-chat-call-label="Call"' 'contact prerender uses the contact-type action label'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'Call Anders' 'contact video widget avoids site-owner-specific call labels'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'data-video-chat-owner-call-private="true"' 'video chat widget owner calls request private rooms by default'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'data-video-chat-public-rooms="' 'video chat widget include passes public room policy'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "textHasWidgetInclude(extrasAfter, 'secure-chat')" 'secure chat widget can be placed explicitly through local includes'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'data-admin-section="video-calling"' 'Admin includes a Video Calling section for widget setup'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '<code>{{video-chat}}</code>' 'Video Calling admin explains the page include syntax'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'video_chat_participant_limit' 'Admin saves the video calling participant limit'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'video_chat_public_rooms' 'Admin saves the video calling public room toggle'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'video-chat-operator-status' 'Video Calling admin exposes the operator console'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'account-video-chat-allow-admin-calls' 'Account settings expose background admin-call opt-in'
assert_file_contains "$ROOT_DIR/cgi/blog-video-chat-control" 'admin_call_user' 'Video call control endpoint can start admin-initiated calls'
assert_file_contains "$ROOT_DIR/cgi/blog-video-chat-token" 'owner_call' 'Video call token endpoint can create public owner-call requests'
assert_file_contains "$ROOT_DIR/cgi/blog-video-chat-token" 'room_password_required' 'Video call token endpoint enforces private room passwords'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'loadVideoChatOperatorStatus' 'Admin polls video call presence for the operator console'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'startVideoChatOperatorRoom' 'Admin can join video call rooms in the operator console'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'data-video-chat-join-room' 'Admin operator console exposes room join controls'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'data-video-chat-cancel-call' 'Admin operator console exposes call cancellation controls'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'video-chat-operator-call-panel' 'Admin operator console includes an in-place call widget panel'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'video-call-notification' 'Logged-in pages render incoming video call notifications'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "'&auto_start=1&mode=video'" 'Incoming call answer opens the contact call room and auto-starts the widget'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "'video-calling': !!plugins.video_chat" 'Video Calling admin section is controlled by the plugin toggle'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'self.options.maxParticipants = Math.max(self.options.maxParticipants' 'video chat widget display capacity follows token participant limits'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'vcw-call-owner-btn' 'video chat widget exposes a one-click call button'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'vcw-room-list' 'video chat widget can render public room choices'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'bootstrap' 'video chat widget refreshes active scheduled rooms from the token endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" "host + '/janus-ws'" 'video chat widget defaults blank Janus config to the same-origin Janus endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'vcw-shell-themed' 'video chat widget gives themed rooms a frosted glass call surface'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'data-video-chat-room-theme-images' 'contact page passes room theme images into the video widget'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'vcw-voice-call-owner-btn' 'video chat widget exposes a voice call button'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'vcw-video-call-owner-btn' 'video chat widget exposes a video call button'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'aria-label="Voice ' 'voice owner call button keeps a mode-specific accessible name'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'aria-label="Video ' 'video owner call button keeps a mode-specific accessible name'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" "title=\"Voice ' + escapeAttr(ownerLabel)" 'voice owner call button keeps a mode-specific tooltip'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" "title=\"Video ' + escapeAttr(ownerLabel)" 'video owner call button keeps a mode-specific tooltip'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" '.vcw-call-owner-btn{width:42px;height:42px;justify-content:center;padding:0;}' 'owner call buttons are compact icon-only controls'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'voiceIconHtml + escapeHtml(ownerLabel)' 'voice owner call button does not render visible call text'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'videoIconHtml + escapeHtml(ownerLabel)' 'video owner call button does not render visible call text'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'renderContentWithRowFlip(beforeLiveMove)' 'contact editor drag reorders rows live with FLIP during dragover'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" '!state.dragDropped && state.dragMoved && Array.isArray(state.dragStartRows)' 'contact editor canceled drags roll live reorders back'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" '.contact-profile-row.is-drag-over-before' 'contact editor drag no longer shows a before insertion line'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" '.contact-profile-row.is-drag-over-after' 'contact editor drag no longer shows an after insertion line'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'vcw-invite-toggle-btn" aria-expanded="' 'video chat widget hides invite link form behind an expanding toggle'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" '>Invite Link...</button>' 'video chat widget labels the invite toggle'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" '.vcw-invite-panel.is-open' 'video chat widget animates the invite link panel open state'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "renderContactSectionHeading('Secure Chat', 'secure-chat-title')" 'contact page renders Secure Chat as an external section heading'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "return renderContactSectionHeading('Secure Chat', 'secure-chat-title') + sharedRenderer.renderPanel" 'contact page places Secure Chat heading before the shared renderer panel'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "renderContactSectionHeading('Call', 'contact-call-title')" 'contact page renders Call as an external section heading'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'data-qualifier=\"' 'contact page prerendered qualifier pills include color hook'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'elif $q == "preferred" then "Preferred"' 'contact page prerendered qualifier pills match hydrated label capitalization'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'data-video-chat-show-heading="false"' 'contact page hides the video widget internal heading'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'data-video-chat-center-precall="true"' 'contact page asks the video widget to center the initial call controls'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'hideHeading: true' 'contact page tells the shared Secure Chat renderer to omit its internal heading'
assert_file_contains "$SITE_SOURCE_ROOT/static/simplex-web-default-chat.js" 'if (!state.hideHeading)' 'shared Secure Chat renderer can omit the internal panel heading'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" '.contact-section-heading::after' 'contact page section headings do not add a second midline rule'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.contact-section-heading span' 'contact page section headings scope the underline to heading text'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-bottom: 1px solid var(--accent, var(--border));' 'contact page section heading underlines stay optically light after hydration'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-image: none !important;' 'contact page section headings suppress theme-level h2 underline images'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-image-source: linear-gradient(90deg, var(--accent' 'contact page section heading text underline uses the blue accent gradient'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.secure-chat-panel:not(.is-chat-started)' 'secure chat login/start island centers its initial content'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'data-video-chat-owner-call-private' 'video chat widget supports private owner calls'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'room_password' 'video chat widget carries private room passwords in invite/join flows'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'Media access starts only after you click a call button.' 'video chat widget omits the redundant media access note'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'normalizeMediaCaptureError' 'video chat widget normalizes raw browser media capture errors'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'Camera unavailable; joining with microphone only.' 'video chat widget degrades video calls to microphone-only when camera capture is unavailable'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'No browser-accessible microphone was found.' 'video chat widget explains missing microphone errors'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'autoStart' 'video chat widget can auto-start when answering a call'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'window.__wizardryVideoChatRoomId = self.state.roomId' 'video chat widget reports current room for operator presence'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" 'var(--secure-chat-paper-surface' 'video chat widget uses the Secure Chat paper surface'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'bootstrapConfig.plugins.video_chat === true' 'contact page can render video chat from initial site bootstrap plugin config'
assert_file_contains "$ROOT_DIR/wizardry-server-requirements.conf" 'video_chat_backend=optional' 'Video chat backend is exposed as an optional Headquarters requirement'
assert_file_contains "$ROOT_DIR/.headquarters/software/video-chat-backend.conf" 'install_script=.headquarters/scripts/ensure-site-video-chat-backend.sh' 'Headquarters software catalog can provision video chat backend'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-site-video-chat-backend.sh" 'apt-get install -y janus' 'Video chat backend provisioning installs Janus repeatably'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-site-video-chat-backend.sh" 'video_chat_janus_wss' 'Video chat backend provisioning writes Janus WSS config into site.conf'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-site-video-chat-backend.sh" 'proxy_pass http://127.0.0.1:$janus_ws_port/;' 'Video chat backend nginx hook strips the public Janus path before proxying'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" "new WebSocket(self.url, 'janus-protocol')" 'video chat widget uses the Janus WebSocket subprotocol'
assert_file_contains "$ROOT_DIR/cgi/blog-video-chat-schedule-common.sh" 'rec.startswith("monthly")' 'video chat scheduled room parser supports monthly recurrence'
assert_file_contains "$ROOT_DIR/cgi/blog-video-chat-schedule-common.sh" 'clean_image_url' 'video chat scheduled room parser sanitizes room background images'
assert_file_contains "$ROOT_DIR/cgi/blog-video-chat-token" 'public_room_not_active' 'video chat token endpoint rejects inactive scheduled room joins'
assert_file_contains "$ROOT_DIR/cgi/blog-video-chat-token" 'room_theme_images' 'video chat token endpoint exposes public room theme images'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'Scheduled Rooms' 'admin video calling settings expose Scheduled Rooms'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'Name | image URL' 'admin video calling settings document themed room images'
assert_file_contains "$SITE_SOURCE_ROOT/static/video-chat-widget.js" "WIDGET_BUILD_VERSION = '20260524-janus-default1'" 'video chat widget publishes the Janus fallback build version'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "videoChatWidgetBuildVersion = '20260524-janus-default1'" 'contact page loads the Janus fallback video widget build'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '<script src="/static/video-chat-widget.js?v=20260524-janus-default1" data-video-chat-widget="1"></script>' 'contact page HTML loads the video widget before contact-page hydration'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" "blog_nostr_contact_page_js_version='20260524-contact-pill-prerender1'" 'contact page cache buster tracks contact qualifier prerendering'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" "blog_nostr_simplex_web_default_chat_js_version='20260523-login-note1'" 'shared Secure Chat renderer cache buster tracks login prompt rendering'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-inline-field="image_url"' 'list inline editor supports image_url cell editing'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-inline-field="post_url"' 'list inline editor supports post_url cell editing'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "state.draft.elements[idx].event_id = '';" 'editing post_url clears event_id so link source is exclusive'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "state.draft.elements[eventIdx].post_url = '';" 'editing event_id clears post_url so link source is exclusive'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'renderLinkedInlineText(line, postUrl, '\''list-entry-markdown'\''' 'list read mode uses post_url as the title link instead of a second arrow link'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'has both POST_URL and EVENT_ID; use one link source' 'strict list validation rejects ambiguous link sources'
assert_file_contains "$ROOT_DIR/cgi/blog-add-post-to-list" 'post_url: $post_url' 'add-post-to-list uses post_url rather than duplicating local post links as event_id links'
assert_file_not_contains "$ROOT_DIR/cgi/blog-add-post-to-list" 'blog_read_front_matter_value "$file" nostr_event_id' 'add-post-to-list does not create rows with both post_url and event_id'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'document.querySelector('\''[data-page-type="list"], [data-page-type="icon-gallery"]'\'')' 'list page bootstrap finds Nostr list surfaces by page type before legacy root ids'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'function currentPageType()' 'list page feature gates read the Nostr page type'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'return currentPageType() === '\''icon-gallery'\'';' 'image URL editing gate keys off icon-gallery page type'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-inline-field="marker"' 'list inline editor supports marker cell editing'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-show-marker-filters="true"' 'list editor exposes show marker filters checkbox'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'class="list-marker-filter-setting"><span>Show marker filters</span><input type="checkbox" data-list-show-marker-filters="true"' 'list edit toolbar exposes show marker filters checkbox in settings row'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'function requestExitEditModeWithSave()' 'list editor Done uses explicit save-before-close path'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'requestExitEditModeWithSave();' 'list editor Done action flushes draft save before exiting edit mode'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'if (state.pendingToggleEditOff) {' 'list editor waits for queued autosave before closing edit mode'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'function renderReadModeInlineEntry(entry)' 'read-mode row menu edit renders only one inline row editor'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'class="list-entry-read-inline-input" data-inline-field="markdown"' 'read-mode row edit shows the main markdown field'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'return renderElementInline(entry)' 'read-mode row edit does not reuse the full table renderer'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'await persistDraft({ alertOnError: true });' 'read-mode row Done waits for the draft save before finishing'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-entry-read-inline-meta {' 'read-mode row edit lays out detail fields below the main markdown field'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "state.readInlineEditUid = readUid;" 'read-mode row menu edit does not enter global edit mode'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'state.activeEntryUid = readUid;' 'read-mode row menu edit no longer opens full page edit mode'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" '<div class="list-inline-row-menu" role="menu"' 'read-mode row menu stays anchored in the positioned trigger wrapper'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'list-entry-row-menu-panel' 'read-mode row menu no longer pushes adjacent content down'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-entry-row-menu-panel .list-inline-row-menu' 'read-mode row menu does not override the absolute menu layout'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#main-content .list-entry-vote-btn' 'reading list vote arrows override global button chrome'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-entry-vote-btn.is-upvote.is-stale' 'reading list vote arrows show stale upvotes in a dull theme color'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-entry-vote-btn.is-downvote.is-stale' 'reading list vote arrows show stale downvotes in a dull theme color'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'var(--list-vote-up-color) 34%' 'reading list stale upvotes are visibly lighter than active upvotes'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'var(--list-vote-down-color) 34%' 'reading list stale downvotes are visibly lighter than active downvotes'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#d8bcbc' 'high-specificity stale upvote override stays pale'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#aebdd3' 'high-specificity stale downvote override stays pale'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'cursor: default;' 'reading list score text keeps a default cursor'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'user-select: none;' 'reading list score text avoids text-selection affordance'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'sortEntriesForReadOnlyVotes(filteredEntries)' 'vote-enabled read lists sort by live score'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'sortEntriesForReadOnlyVotes(bucket)' 'vote-enabled grouped read lists sort each section by vote state'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" '.list-entry-line[data-list-entry-id]' 'read-mode list rows are keyed for score-change animation'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'function applyOptimisticListVote(entryId, value)' 'list votes update the interface optimistically'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'entry.list_latest_vote = voteValue;' 'optimistic list votes update latest action tie-break metadata'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'refreshListPayloadFromResponse(data);' 'confirmed list votes do not replay the optimistic reorder animation'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'voteActionRank(bLatestVote) - voteActionRank(aLatestVote)' 'same-score list vote sorting uses latest up/down action'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'list_latest_vote: latest_vote_value_for($id)' 'server list vote merge returns latest vote action'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'restoreListVoteSnapshot(rollbackPayload, beforeRects);' 'list vote failures roll back optimistic state'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'showVoteErrorToast(err && err.message ? err.message : '\''Could not vote'\'');' 'list vote failures surface a red toast'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'className = '\''nav-top-toast is-error list-vote-error-toast'\''' 'list vote failure toast uses error styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'copyTextToClipboard(text)' 'list vote failure toast has a copy action'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "return 'Sign in to vote.';" 'signed-out vote tooltip does not describe viewer vote history'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'disabled aria-disabled="true"' 'signed-out vote buttons render disabled'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'signedIn && viewerVote > 0' 'signed-out vote buttons ignore viewer-specific active state'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'list-vote-up-color:' 'list vote up color is themeable'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'color: var(--list-vote-up-color' 'list upvote arrows use the theme up color'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'color: var(--list-vote-down-color' 'list downvote arrows use the theme down color'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'transition: none !important;' 'list vote arrow hover color changes without animation'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#main-content .list-entry-vote-btn:hover:not(:disabled)' 'list vote hover reset covers the high-specificity content button layer'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-entry-vote-btn.is-upvote:hover:not(:disabled)' 'signed-out upvote buttons have no hover color effect'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-entry-vote-btn.is-downvote:hover:not(:disabled)' 'signed-out downvote buttons have no hover color effect'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'list-vote-up-color: var(--malachite' 'Lapidarist upvotes use the compose-adjacent green theme color'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'list-vote-down-color: var(--lapis' 'Lapidarist downvotes use a separate theme color'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'var(--list-vote-up-color) 32%' 'Lapidarist stale upvotes are lighter than active upvotes'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'var(--list-vote-down-color) 32%' 'Lapidarist stale downvotes are lighter than active downvotes'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" ':not(.list-entry-vote-btn)' 'lapidarist theme excludes vote arrows from button chrome'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'blog_list_vote_cooldown_seconds()' 'list votes define a shared cooldown helper'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" "printf '64800" 'list votes use an 18-hour cooldown'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-list-vote" 'code: "vote_cooldown"' 'list vote endpoint rejects repeat votes during cooldown'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'function voteTooltipText(entry, signedIn)' 'list vote controls render a native tooltip string'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'Your opinion on this: ' 'list vote tooltip summarizes the viewer opinion as a signed score'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'formatSignedVoteOpinion(opinion)' 'list vote tooltip formats positive viewer opinion with a plus sign'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" "You've " 'list vote tooltip does not use repeated upvoted/downvoted count copy'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'aria-label="Upvote" title="' 'upvote button does not duplicate the wrapper tooltip'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'aria-label="Downvote" title="' 'downvote button does not duplicate the wrapper tooltip'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'class="list-entry-score" title="' 'score text does not duplicate the wrapper tooltip'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'title="' 'list vote controls use native delayed browser tooltips'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-entry-vote-controls:hover .list-entry-vote-tooltip' 'list vote tooltip is not an instant CSS hover panel'
assert_list_vote_cooldown_merge
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'function apiPostJson(path, payload)' 'list editor supports JSON POST saves for large drafts'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }" 'list editor sends raw JSON saves with the live-server-compatible content type'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "await apiPostJson('/cgi/blog-save-nostr-page-draft'" 'list editor saves large drafts without form-urlencoding the payload'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-allow-submissions' 'list page settings expose signed-in submission toggle'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-allow-votes' 'list page settings expose signed-in vote toggle'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "'/cgi/blog-submit-list-entry'" 'list page public add form uses list-specific endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-public-action="expand-submit"' 'list page public add form starts behind a compact add button'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'focusPublicSubmitInput();' 'list page public add form focuses the textbox after expanding or adding'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-public-submit-reveal' 'list page public add form uses an animated reveal shell'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'grid-template-columns 220ms ease' 'list page public add form expands inline with animation'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "'/cgi/blog-submit-list-vote'" 'list page vote buttons use list-specific endpoint'
assert_success sh -n "$ROOT_DIR/cgi/blog-submit-list-entry"
assert_success sh -n "$ROOT_DIR/cgi/blog-submit-list-vote"
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'state_json: {' 'list editor saves large drafts through a single state_json object'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-marker-filter-action="toggle"' 'list read mode renders marker filter pills'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-view-mode="tile"' 'product gallery read mode renders tile/list selector pill'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-entry-href' 'product gallery/list read items expose whole-item click targets'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'openListEntryHref(linkedEntry.getAttribute' 'product gallery/list read items navigate from the whole item'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '.list-tile:hover' 'Lapidarist product tiles do not add hover surface effects'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-inline-action="create-product"' 'product gallery edit rows expose create-product action'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "'/cgi/blog-create-product-page'" 'product gallery create-product action calls dedicated CGI endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-add-product-slug' 'product gallery read mode exposes add-to-cart controls'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'event.ctrlKey' 'list marker filters support ctrl-click exclusion mode'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'event.metaKey || event.shiftKey' 'list marker filters support cmd/shift multi-select include mode'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'function datePillForEntryInSection(entry, groupBy, sectionLabel)' 'list read renderer computes section-aware date-pill visibility'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'list-entry-date-pill' 'list read renderer outputs right-aligned date pill for more-specific dates'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-outro-format' 'list editor no longer exposes markdown/html format dropdown for local after-content'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-intro="true"' 'list editor no longer exposes redundant before-content textarea'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'html += renderAfterContentEditor();' 'list editor renders after-content editor at end of edit content'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "target.closest('[data-inline-field], input, textarea, select, [contenteditable=\"\"], [contenteditable=\"true\"]')" 'list inline dragstart ignores form controls so text selection works'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "var defaultMarker = isPlainListPage() ? 'list' : '';" 'new list entries default marker by list page type, not by slug'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/list-page.js" "slug === 'list'" 'list runtime avoids site-specific slug feature gates'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-inline-field="description"' 'list inline editor supports description cell editing'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'markdownText ? escapeHtml(markdownText) : placeholderHtml' 'list edit-mode text column renders plain text without markdown link hover behavior'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "target.closest('[data-inline-field], input, textarea, select, [contenteditable=\"\"], [contenteditable=\"true\"]')" 'list inline editor outside-click close ignores active form controls so marker text is selectable'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" 'data-draft-banner-action="dismiss"' 'draft notice exposes an explicit dismiss button'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" 'function closeIconSvg()' 'draft notice close control uses an SVG icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-draft-notice-close' 'draft notice close control has dedicated sizing and dark icon styling'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'data-blog-slug="$slug"' 'blog mount template includes explicit slug marker for sync'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'data-page-type="list"' 'list mount template marks list type'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-tile-description {' 'tile view renders tiny description style'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'max-width: min(1820px, calc(100vw - 0.75rem));' 'list page edit-mode body width cap expanded for full table fit'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: fit-content;' 'list page shell can grow to fit edit table width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'max-width: min(1780px, calc(100vw - 1rem));' 'list page shell edit-mode max width expanded'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'margin: 1.25rem auto 2.4rem;' 'list page shell stays centered while edit-mode width animates'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-page-shell {' 'list shell block exists for shared inline-grid variable definitions'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'Public surface depth replaces thin framing lines.' 'public theme uses surface shadows instead of thin island borders'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'nav.site-nav {' 'surface override targets navbar'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: min(900px, calc(100vw - 1rem));' 'legacy desktop navbar cap remains before the final content-width override'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'Keep the navbar aligned to the same content column as the page below it.' 'final navbar rule documents content-column alignment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: min(100%, var(--site-content-width)) !important;' 'final navbar rule stays centered on the shared content width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '--site-content-width: 46rem;' 'site defines one shared default public content width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'max-width: var(--site-content-width);' 'base body uses the shared public content width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'body:not(.blog-post-resize-enabled):not(.list-page-wide):not(:has(.post-single-item)) #main-content' 'ordinary public pages keep main content on the shared width lane'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: min(100%, var(--site-content-width));' 'blog layout uses the shared public content width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: min(100%, var(--site-content-width)) !important;' 'navbar uses the shared public content width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'max-width: min(100%, 760px, calc(100vw - 3rem));' 'navbar link row stays inside the navbar content box'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'nav.site-nav .nav-site-signature' 'site title has a navbar-specific font rule'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '"Palatino Linotype", "Book Antiqua", Palatino, "Times New Roman", serif' 'site title keeps the original serif font stack'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'position: static !important;' 'navbar stays in page flow instead of pinning to the viewport'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'top: auto !important;' 'navbar has no viewport top offset'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-bottom: 0 !important;' 'navbar removes the thin bottom border'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'Firefox shows antialiased rounded-fill edges here; keep title actions text-only.' 'title action admin buttons have a Firefox edge reset'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background-clip: padding-box !important;' 'title action buttons do not expose a hidden border-box layer'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '-webkit-appearance: none !important;' 'title action buttons suppress WebKit native button chrome'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background-image: none !important;' 'title action buttons suppress textured button background artifacts'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.nav-search:focus-within' 'floating search box keeps focus visible without a thin outline border'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'top: 0.08rem;' 'navbar overflow badge sits below the top edge of the sub-toolbar'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'right: -0.18rem;' 'navbar overflow badge stays inset from the link rail edge'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'box-shadow: 0 0 0 2px var(--button-secondary-bg, var(--nav-button-bg, var(--light-bg)));' 'navbar overflow badge masks the icon underneath with an opaque halo'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'z-index: 3;' 'navbar overflow badge renders above the menu icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'pointer-events: none;' 'navbar overflow badge does not intercept menu clicks'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.nav-menu-btn.nav-overflow-btn:hover .nav-overflow-count' 'navbar overflow badge joins the button hover highlight'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.10);' 'navbar overflow badge halo matches the hover surface'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'nav.site-nav > .nav-right .nav-search button {' 'navbar search button has explicit final button styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'nav-search-button-size: 26px;' 'navbar search button is slightly larger'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'stroke-width="1.9"' 'navbar search icon uses a slightly thicker single-color stroke'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background: transparent !important;' 'navbar search button is transparent until hover'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background-image: none !important;' 'navbar search button avoids faceted or parchment backgrounds'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'color: var(--amethyst, var(--theme_accent, #6a4fa3)) !important;' 'navbar search icon uses one amethyst theme color'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'right: var(--nav-search-button-size) !important;' 'expanded navbar search input attaches to the compact search button'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'height: var(--nav-search-button-size) !important;' 'expanded navbar search input matches compact button height'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'max-width: var(--nav-search-button-size) !important;' 'collapsed navbar search wrapper matches compact button width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'nav.site-nav > .nav-right .nav-search.is-search-expanded' 'expanded navbar search wrapper keeps compact button width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '@media (min-width: 480px)' 'navbar title centering applies at compact tablet widths'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important;' 'desktop navbar centers the site title between equal side lanes'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: fit-content !important;' 'centered navbar title fits its text instead of stretching across a grid lane'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: 100% !important;' 'tablet navbar link rail is constrained to the nav content width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'transition: transform 240ms cubic-bezier(0.2, 0.9, 0.2, 1) !important;' 'desktop navbar title moves smoothly when search expands'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'nav.site-nav:has(> .nav-right .nav-search.is-search-expanded) > .nav-site-signature' 'desktop navbar title responds to expanded search state'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" "nav.classList.toggle('has-expanded-search', nextExpanded);" 'navbar search script mirrors expanded search state onto the nav shell'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'nav.site-nav.has-expanded-search > .nav-site-signature' 'navbar title can shift using the script-managed expanded search state'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'opacity: 1 !important;' 'expanded navbar search input stays visible after its opening animation'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'transform: translateX(-7rem) translateY(1px) !important;' 'desktop navbar title shifts left to clear the expanded search box'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'color: var(--amethyst, #6a4fa3) !important;' 'Lapidarist navbar search icon uses amethyst'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'nav-search-button-size: 26px;' 'Lapidarist navbar search button is slightly larger'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'nav.site-nav .nav-menu-btn:hover' 'navbar overflow/user menu button has stable hover styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'translate: none !important;' 'navbar overflow/user menu button does not move on hover'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'padding: 0.18rem 0.9rem 0.18rem 0.36rem;' 'navbar link rail reserves right padding for the overflow badge'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'min-width: 1.12rem;' 'navbar overflow badge fits two digits'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-compose-card .compose-post-type-pill' 'compose post type bar has explicit separator styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-right: 1px solid color-mix(in srgb, var(--amethyst' 'compose post type buttons use a 1px theme-color separator'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'background: transparent !important;' 'Lapidarist navbar search button has no resting fill'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'conic-gradient(from 145deg at 50% 52%' 'Lapidarist navbar search button is not a multicolor gem'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'nav-username-color: var(--lapis, #3b70d0);' 'Lapidarist logged-in username uses the lighter lapis token instead of red plum green or muted gold'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '--lapis: #3b70d0;' 'Lapidarist lapis token is a lighter vivid blue'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#5b8fe8 0%' 'active navbar lapis gradient starts with a brighter polished highlight'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#244d99 100%' 'active navbar lapis gradient keeps a saturated deep edge'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'color: var(--nav-username-hover);' 'Lapidarist logged-in username hover uses the username theme color'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'Firefox shows antialiased rounded-fill edges here; keep title actions text-only.' 'Lapidarist title action admin buttons have a Firefox edge reset'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '-webkit-appearance: none !important;' 'Lapidarist title action buttons suppress WebKit native button chrome'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'clip-path: none !important;' 'Lapidarist title action buttons do not create clipped-corner artifacts'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'background-image: none !important;' 'Lapidarist title action buttons suppress textured button background artifacts'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '.btn-login {' 'Lapidarist login buttons own the decorative primary overlay'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '.list-page-admin-bar .list-admin-primary-btn:active {' 'Lapidarist admin primary buttons use a separate flat style'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'html body nav.site-nav > .nav-right form.nav-search button[type="submit"]' 'Lapidarist navbar search button beats generic button shadows'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'button[type="submit"]:not(.unobtrusive-icon-button):not(.nav-menu-btn)' 'Lapidarist navbar search button matches generic button specificity'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'Button hover stability: hover/focus may change color, border, or shadow, but not position.' 'site CSS documents stable button hover behavior'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.btn-login):hover:not(:disabled)' 'login button is covered by the stable hover guard'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'transform: translateY(-1px) !important;' 'Lapidarist button hover does not move controls'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'list-inline-grid-columns:' 'list inline table uses shared grid template variable'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'grid-template-columns: var(--list-inline-grid-columns);' 'list headers and rows both read same grid template variable'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-entry-date-pill {' 'list read rows include a dedicated date-pill style'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-view-mode-pill {' 'product gallery tile/list selector uses a compact pill shell'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-inline-actions button[data-list-inline-action="create-product"] {' 'product gallery create-product action uses fit-to-content button styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.nav-center {' 'nav center lane styling exists'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'overflow-x: auto;' 'navbar center lane scrolls within its own column instead of overlapping right controls'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'min-width: max-content;' 'navbar right lane preserves intrinsic width so search/actions do not intrude into center links'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'overflow: visible !important;' 'navbar shell keeps absolute login and account menus usable above content'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'z-index: 1200;' 'navbar shell stays stacked above page content'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'nav.site-nav .nav-login-menu' 'login menu gets explicit navbar stacking protection'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'max-width: calc(100vw - 1rem);' 'mobile login menu stays inside the phone viewport'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'overflow: hidden !important;' 'Lapidarist mobile navbar does not clip login menus'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<div class="nav-right">' 'navbar has a dedicated right controls lane'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<div class="nav-overflow-menu" id="nav-overflow-menu" hidden>' 'navbar overflow button starts in the page links row'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" "var overflowMenu = document.getElementById('nav-overflow-menu');" 'inline navbar bootstrap preserves overflow button when hydrating cached page links'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'placeNavOverflowMenuWithPageLinks' 'runtime keeps navbar overflow button with page links'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'navCenter.appendChild(els.navOverflowMenu);' 'navbar overflow button is placed after page links'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'placeNavOverflowMenuWithPageLinks();' 'navbar renderer restores overflow button after rebuilding page links'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'navRight.insertBefore(els.navOverflowMenu' 'navbar overflow button is not inserted into the action controls lane'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'order: 99;' 'navbar overflow button is ordered after visible page links'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'highlightCurrentNavNow();' 'navbar applies cached active selection during inline bootstrap'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" "link.setAttribute('aria-current', 'page');" 'inline navbar bootstrap marks active page accessibly'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'var selected = null;' 'inline navbar bootstrap tracks one selected page'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" "var active = !selected && normalizeNavPath(link.getAttribute('href') || '') === current;" 'inline navbar bootstrap activates only the first matching page'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'function collapseOverflowingNavLinksNow()' 'inline navbar bootstrap hides overflowing mobile links before nav-auth loads'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" "hide.classList.add('is-nav-overflow-hidden');" 'inline navbar bootstrap uses the shared overflow-hidden class'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function applyInitialHighlightInSyncWithContent() {' 'runtime navbar highlight entrypoint exists'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'highlightCurrentPage();' 'runtime navbar selection is applied immediately'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'var selectedMatch = matches.length ? matches[0] : null;' 'runtime navbar selects at most one matching page'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "setAttribute('data-temp-nav-current'" 'runtime navbar no longer creates temporary active page links'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "setAttribute('data-page', 'temp-current')" 'runtime navbar no longer creates temporary active page entries'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "window.addEventListener('blog-page-initial-content-ready', function () {" 'runtime navbar selection no longer waits for page content readiness'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'text-align: left;' 'blog preview summary text stays left aligned'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'margin: 0.35rem 0 0;' 'blog preview read-more link follows left-aligned summary text'
assert_file_contains "$SITE_SOURCE_ROOT/includes/footer.md" 'id="footer-pages"' 'footer includes dynamic page list mount'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.site-footer {' 'footer shell has dedicated layout styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'flex-wrap: wrap;' 'footer keeps dynamic pages and feed links on one wrapping row'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'gap: 0.45rem 1rem;' 'footer row has shared page/feed spacing'
assert_file_contains "$SITE_SOURCE_ROOT/static/footer-pages.js" 'cached_footer_pages_v1' 'footer page list uses cached bootstrap state'
assert_file_contains "$SITE_SOURCE_ROOT/static/footer-pages.js" "fetch('/static/footer-pages.json'" 'footer page list refreshes from static JSON'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'Show in Footer' 'Pages admin exposes footer visibility column'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'data-nostr-page-action="toggle-footer"' 'Pages admin can toggle footer visibility'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'dispatchFooterRefresh' 'Pages admin refreshes footer preview after page changes'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.zap-dialog-close {' 'zap modal close button has dedicated styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'place-items: center;' 'zap modal close glyph is centered in the circular button'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.zap-dialog-field input[data-zap-custom-sats]' 'Zap custom sats input has dedicated compact sizing'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: 9.5rem;' 'Zap custom sats input is not forced full width on desktop'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'min-height: 3rem;' 'Zap custom sats input is taller on mobile'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-modal-message.is-visible' 'Sign-in modal message appears through an animated visible state'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'transition:' 'Sign-in modal message animates when appearing and disappearing'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-left-width: 0.34rem;' 'Sign-in modal message avoids thick left-border banner styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-modal-message.is-plain' 'Sign-in modal supports plain helper messages'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" 'body.auth-modal-open {' 'Sign-in modal does not change body overflow or reflow the navbar'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-left-width: 1px;' 'Plain sign-in helper message does not need a left-border override'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function signInHelperMessage' 'Sign-in modal uses one generic account-creation helper across methods'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'First successful sign-in creates your account automatically.' 'Sign-in helper does not make account creation sound browser-only'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'justify-self: center;' 'Phone signer QR is centered in the sign-in panel'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '0 18px 38px rgba(15, 23, 42, 0.14)' 'Phone signer QR has a deliberate card treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-primary-btn:disabled' 'Sign-in modal buttons use plain disabled styling'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" '#main-content .auth-primary-btn:hover:not(:disabled)' 'Sign-in modal buttons are not forced into lapis hover styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'insertBefore(node, platformGrid)' 'Sign-in modal helper message is inserted above the platform choices'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-platform-grid' 'Sign-in modal uses guided platform choices instead of tabs'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<span class="auth-platform-copy"><strong>Desktop</strong></span>' 'Sign-in modal desktop platform button has no subtitle'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<span class="auth-platform-copy"><strong>Android</strong></span>' 'Sign-in modal Android platform button has no subtitle'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<span class="auth-platform-copy"><strong>iPhone</strong></span>' 'Sign-in modal iOS platform button has no subtitle'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<span class="auth-platform-copy"><strong>Remote Signer</strong></span>' 'Sign-in modal remote signer platform button has no subtitle'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function detectedAuthPlatformFlavor' 'Sign-in modal detects OS before choosing the initial platform'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'uaData.mobile === true' 'Sign-in modal uses User-Agent Client Hints mobile detection when available'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "return { tab: 'phone', flavor: flavor };" 'Sign-in modal initially selects detected mobile signer platform'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "return { tab: 'register', flavor: 'desktop' };" 'Sign-in modal initially selects desktop on desktop browsers'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'iPadOS can present itself as desktop Safari' 'Sign-in modal treats desktop-UA iPadOS as iPhone/iPad'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "return 'remote';" 'Sign-in modal selects remote signer instead of Android for ambiguous touch/mobile runtimes'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "flavor = (detected === 'android' || detected === 'ios') ? detected : 'remote';" 'Phone login menu defaults to the detected phone platform or remote signer'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'class="auth-advanced-toggle"' 'Manual sign-in is hidden behind an advanced link'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-advanced-toggle:hover,' 'Advanced auth link has an explicit hover style'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background: transparent !important;' 'Advanced auth link hover does not use a filled background'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'grid-template-columns: repeat(4, minmax(0, 1fr));' 'Sign-in platform cards fit on one row on desktop'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'min-height: 3.25rem;' 'Sign-in platform cards use compact modal sizing'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'flex-direction: row;' 'Sign-in platform cards use compact icon-label layout'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'transform: none !important;' 'Sign-in platform card hover does not shift layout'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-platform-icon svg' 'Sign-in platform cards use real SVG icons'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Firefox signer' 'Sign-in modal removes desktop platform subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Amber signer' 'Sign-in modal removes Android platform subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Safari signer' 'Sign-in modal removes iOS platform subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Nostr Connect</span>' 'Sign-in modal removes remote signer platform subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<span class="auth-platform-copy"><strong>Manual</strong></span>' 'Manual sign-in is not shown as a platform card'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Recommended Apps' 'Sign-in modal combines login and zap recommendations into one app island'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-apps-icon' 'Recommended Apps header uses an app-grid icon'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-login-icon' 'Recommended Apps header no longer uses the lock/login icon'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-login-apps' 'Sign-in modal keeps login recommendation app list'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-zap-apps' 'Sign-in modal keeps zap recommendation app list'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'For Login:' 'Sign-in modal does not split recommendations into a login island'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'For Zaps:' 'Sign-in modal does not split recommendations into a zap island'
auth_tab_frame_line=$(grep -n 'class="auth-tab-frame"' "$SITE_SOURCE_ROOT/includes/nav.md" | head -n 1 | cut -d: -f1)
auth_login_reco_line=$(grep -n 'auth-login-onboarding' "$SITE_SOURCE_ROOT/includes/nav.md" | head -n 1 | cut -d: -f1)
auth_zap_reco_line=$(grep -n 'auth-zap-onboarding' "$SITE_SOURCE_ROOT/includes/nav.md" | head -n 1 | cut -d: -f1)
if [ "$auth_tab_frame_line" -lt "$auth_login_reco_line" ] && [ "$auth_login_reco_line" -lt "$auth_zap_reco_line" ]; then
  pass
else
  fail 'Sign-in modal app recommendations appear after the login flow and keep Login before Zaps'
fi
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Recommendations Updated May 2026' 'Recommended app island shows freshness date'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Self-Sovereign' 'Zap onboarding no longer shows a mode selector'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Quick &amp; Easy' 'Zap onboarding no longer recommends quick custodial options'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function loginOnboardingRecommendation' 'Login recommendations update by selected platform'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function recommendationPlatformLabel' 'Recommendation groups derive a visible platform label from the selected login platform'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "summary: platformLabel + ' login'" 'Login recommendation group includes the selected platform'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Recommended for Android Nostr Connect login.' 'Android login recommendation explains that it is platform-specific'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Recommended for iPhone and iPad Nostr Connect login.' 'iOS login recommendation explains that it is platform-specific'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Recommended for remote Nostr Connect signers.' 'Remote signer login recommendation explains that it is platform-specific'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "purpose: 'Login via Nostr'" 'Login recommendation apps are individually labeled as login apps'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "platform.className = 'auth-reco-platform'" 'Recommendation app rows render a visible platform badge'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-reco-platform' 'Recommendation platform badges have dedicated styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Amber' 'Android login onboarding recommends Amber'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function zapOnboardingRecommendation' 'Zap onboarding recommendations update by selected platform'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "summary: platformLabel + ' zaps'" 'Zap recommendation group includes the selected platform'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Recommended for sending zaps from Android.' 'Android zap recommendation explains that it is platform-specific'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Recommended for sending zaps from iPhone and iPad.' 'iOS zap recommendation explains that it is platform-specific'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Recommended when the signer is remote or the current platform is unknown.' 'Remote zap recommendation explains that it is platform-specific'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "purpose: 'Zaps: Lightning wallet'" 'Zap recommendation apps identify Lightning wallet purpose'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "purpose: 'Zaps: Nostr client'" 'Zap recommendation apps identify Nostr client purpose'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Amethyst' 'Android zap onboarding recommends Amethyst'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'ZEUS' 'Zap onboarding recommends ZEUS for self-custodial Lightning'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "source: 'F-Droid', label: 'Download Amber', url: 'https://f-droid.org/packages/com.greenart7c3.nostrsigner/'" 'Android login onboarding links directly to Amber on F-Droid'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Choose a sign-in method. Your Nostr public key is your account, and the site never asks for a private key.' 'Sign-in modal helper combines opening guidance into the top toast'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Choose where your signer lives.' 'Sign-in modal avoids vague signer-location wording'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "platformGrid.parentNode.insertBefore(node, platformGrid)" 'Sign-in helper toast appears above platform choices'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "els.authMessage.isConnected" 'Sign-in helper toast is repositioned when an existing modal message node is reused'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "return base + ' Connect Nostr with the link or QR. Sign-in continues after pairing.'" 'Android phone signer guidance is combined into the generic helper toast'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-phone-intro' 'Phone signer guidance no longer interrupts the platform buttons and QR'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "Recommended: Amber from F-Droid." 'Android phone signer guidance does not repeat Amber recommendation'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "label: 'Download ZEUS'" 'Zap onboarding uses explicit Download app-name link text'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "stores.appendChild(document.createTextNode(source + ': '));" 'Recommendation download links show their F-Droid or Aurora source separately from the Download link'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://github.com/vitorpamplona/amethyst#installation' 'Amethyst app link points to its official installation page'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://github.com/ZeusLN/zeus#app-store-links' 'ZEUS app link points to its official app store links'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "label: 'Play'" 'Recommendation lists never recommend Play Store'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'play.google.com' 'Recommendation lists never link to Play Store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://apps.apple.com/us/app/damus/id1628663131' 'Damus App Store link points to its app listing'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://nostur.com/appstore' 'Nostur App Store link points to its app listing'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'auth-reco-app-link' 'Login and zap onboarding render compact linked app chips'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'auth-reco-app-purpose' 'Login and zap onboarding render explicit app purpose labels'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-reco-app-purpose' 'Recommendation app purpose labels are styled separately from app names'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://auroraoss.com/downloads/AuroraStore/' 'Zap onboarding links Aurora Store'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Wallet of Satoshi' 'Zap onboarding does not recommend custodial wallets'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Primal' 'Zap onboarding does not recommend quick hosted Nostr apps'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Nsec.app' 'Zap onboarding does not recommend quick remote signer services'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'not maximum sovereignty' 'Zap onboarding no longer labels custodial tradeoffs because those options are removed'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Back up the seed' 'Zap onboarding avoids long wallet setup notes'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-reco-group' 'Recommended app island separates login and zap groups inside one card'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'text-align: center;' 'Recommended app island centers the freshness date'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-reco-app-icon' 'Login and zap onboarding app chips include app-style icons'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-reco-app-img' 'Recommended app icons can render cached real app images'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function recommendationIconAsset' 'Recommended app icons use cached local app assets'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "'/static/icons/apps/amber.svg'" 'Amber recommendation uses cached official icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "'/static/icons/apps/amethyst.png'" 'Amethyst recommendation uses cached official icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "'/static/icons/apps/zeus.png'" 'ZEUS recommendation uses cached official icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "'/static/icons/apps/damus.png'" 'Damus recommendation uses cached official icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "'/static/icons/apps/nostur.png'" 'Nostur recommendation uses cached official icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "'/static/icons/apps/nos2x-fox.svg'" 'nos2x-fox recommendation uses cached official icon'
assert_file_exists "$SITE_SOURCE_ROOT/static/icons/apps/amber.svg" 'Cached Amber icon is present'
assert_file_exists "$SITE_SOURCE_ROOT/static/icons/apps/amethyst.png" 'Cached Amethyst icon is present'
assert_file_exists "$SITE_SOURCE_ROOT/static/icons/apps/zeus.png" 'Cached ZEUS icon is present'
assert_file_exists "$SITE_SOURCE_ROOT/static/icons/apps/damus.png" 'Cached Damus icon is present'
assert_file_exists "$SITE_SOURCE_ROOT/static/icons/apps/nostur.png" 'Cached Nostur icon is present'
assert_file_exists "$SITE_SOURCE_ROOT/static/icons/apps/nos2x-fox.svg" 'Cached nos2x-fox icon is present'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-zap-mode-btn' 'Zap onboarding mode button styles are removed with the mode selector'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-phone-reco' 'phone signer recommendations are not repeated below the panel actions'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Continue with browser signer' 'Browser signer action avoids special register wording'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'You can change your username after you log in.' 'Sign-in modal defers username choice until after login'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-register-username' 'Sign-in modal does not ask for a username during first login'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'authRegisterUsername' 'Browser signer login does not read a username hint'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Usernames must be unique.' 'Sign-in modal avoids username uniqueness friction during login'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '>Advanced...</button>' 'Manual challenge fallback is reachable through the advanced link'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Challenge JSON</span>' 'Sign-in modal removes manual platform subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Register with browser signer' 'Browser signer path no longer uses special register wording'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Signed challenge</button>' 'Manual fallback avoids cryptic signed challenge tab wording'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function isMobileLikeRuntime()' 'login flow detects mobile-like browsers before choosing a signer path'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'return preferredAuthInitialSelection();' 'primary login uses OS autodetection when no browser signer is available'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function startPrimaryLogin()' 'nav login button uses a capability-aware primary login flow'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function waitForDesktopSigner' 'primary login tolerates delayed NIP-07 signer injection'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'return waitForDesktopSigner(1200).then(function (available)' 'primary login waits briefly before falling back to the sign-in modal'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'emitAuthChanged({' 'verified login event carries session details after auth check'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'applyOptimisticAdminFromAuthEvent(event);' 'list pages reveal admin controls from the verified auth event'
assert_file_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" 'applyOptimisticAdminFromAuthEvent(event);' 'post pages reveal admin controls from the verified auth event'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-context.js" 'eventHasVerifiedAdminState(event)' 'single post admin menu uses the verified auth event without a second session wait'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'No desktop signer detected' 'login errors use signer-neutral wording'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Desktop signer login failed' 'login fallback errors avoid desktop-only wording'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Your Nostr public key is your account' 'Sign-in modal includes concise Nostr identity guidance in the top helper'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Browser sign-in uses a NIP-07 extension' 'Sign-in modal explains browser signer path'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Connect Nostr with the link or QR. Sign-in continues after pairing.' 'Sign-in modal explains phone signer path without interrupting the QR'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'nostr-info-modal' 'Learn about Nostr sign-in no longer uses a separate modal'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'showInfoModal' 'Learn about Nostr sign-in no longer opens a separate info modal'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "showAuthModal('register');" 'Learn about Nostr sign-in opens the main sign-in modal'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'nav-auth.js?v=20260524-navbar-toolbar1' 'nav auth script URL is cache-busted after navbar overflow positioning'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'zap-ui.js?v=20260524-zap-panel1' 'zap UI script URL is cache-busted after zap panel polish'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "wss://andersaamodt.com" 'Nostr Connect defaults to the site Stonr relay'
assert_file_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" "wss://andersaamodt.com" 'Zap requests default to the site Stonr relay'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'savedRelaysMatchDefaults' 'Nostr Connect pairing migrates stale relay lists'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "pairSecret = '';" 'Nostr Connect regenerates pairing secret when relays change'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'decryptNip46Content' 'Nostr Connect can decrypt signer responses through the shared helper'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'encryptNip46Content' 'Nostr Connect can encrypt signer requests through the shared helper'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'window.NostrTools.nip44.getConversationKey' 'Nostr Connect prefers current NIP-44 encryption'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'window.NostrTools.nip04.decrypt' 'Nostr Connect keeps NIP-04 fallback for older signers'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "params.set('perms', 'get_public_key,sign_event:22242,sign_event:9734');" 'Nostr Connect link requests login and zap signing permissions'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "params.set('metadata', JSON.stringify(metadata));" 'Nostr Connect link includes app metadata for signer pairing'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'typeof msg.result ===' 'Nostr Connect accepts connect responses that return the secret as result'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'extractConnectSecret(msg) === state.nip46.pairSecret' 'Nostr Connect enables phone signer after current connect response format'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "sendNip46Rpc('get_public_key', [], 30000)" 'phone signer login asks the signer for the account pubkey before creating the challenge'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'allowStoredPubkeyHint: false' 'phone signer login does not reuse stale browser Nostr identity hints'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function saveNip46PairState()' 'Nostr Connect persists phone signer pairing after successful login'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function updateNip46PairingLink()' 'Nostr Connect deep link is refreshed even when pairing state is already active'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function buildAmberIntentUri' 'Nostr Connect no longer exposes an app-specific Android intent fallback'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'package=com.greenart7c3.nostrsigner' 'Nostr Connect no longer targets one Android signer package'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function openNativeDeepLink' 'Nostr Connect opens phone signer links from the direct user gesture'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'window.location.href = href;' 'Nostr Connect explicitly dispatches custom-scheme links for mobile browsers'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function waitForNostrTools' 'phone signer login waits for async nostr-tools instead of failing immediately'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Phone signer setup is still loading.' 'phone signer dependency failures are explicit'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function refreshPhoneSignerListenerAfterReturn' 'phone signer relistens after Android app switching'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "document.addEventListener('visibilitychange'" 'phone signer refreshes when the browser returns to foreground'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "window.addEventListener('focus'" 'phone signer refreshes on focus return'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'ensureNip46Subscription(180' 'phone signer return path replays recent signer responses'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'scheduleDeepLinkFallbackHint' 'phone signer shows a fallback hint when no app handles the deep link'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function resetPhonePairingLink(options)' 'Nostr Connect can generate a fresh phone signer link when a stale app link stops working'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function refreshUnpairedNip46Link' 'Connect Nostr refreshes unpaired NIP-46 state before opening Amber'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function rotateUnpairedNip46StateNow' 'Connect Nostr can rotate unpaired NIP-46 state synchronously from the tap handler'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'var rotateAppKey = opts.rotateAppKey !== false' 'fresh phone signer links rotate the NIP-46 client identity by default'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'resetPhonePairingLink({ rotateAppKey: true })' 'unpaired Connect Nostr clicks use a new client key instead of replacing Amber connections'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'rotateUnpairedNip46StateNow();' 'unpaired Connect Nostr clicks rotate before dispatching the custom scheme link'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Tap Connect Nostr again in a moment.' 'Connect Nostr keeps Android custom-scheme dispatch tied to a user tap when tools are still loading'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "setNip46Diagnostics('Making a fresh signer link.', 'info')" 'unpaired Connect Nostr reports that it is preparing a fresh signer link'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-phone-connect-btn' 'phone signer panel does not show redundant QR connect button'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'navigator.clipboard.writeText(uri)' 'Nostr Connect link can be copied for manual signer import'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'signerPubkey: normalizePubkeyHex(state.nip46.signerPubkey' 'Nostr Connect stores the transport pubkey for later zap signing'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'accountPubkey: normalizePubkeyHex(state.nip46.accountPubkey' 'Nostr Connect stores the account pubkey separately from the transport key'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function getNip46AccountPubkey()' 'shared zap signer asks the phone signer for the actual account pubkey'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "signer.method === 'nip46'" 'shared signer status treats restored phone signer pairing as available without forcing a fresh QR'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-diagnostics' 'phone signer panel shows visible Nostr Connect pairing diagnostics'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "'Waiting for signer'" 'phone signer waiting state uses compact user-facing wording'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Listening on ' 'phone signer waiting state does not expose relay internals'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'signer response to ' 'phone signer waiting state does not expose transient app pubkeys'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-nip46-diagnostics.is-waiting::before' 'phone signer waiting state uses an intuitive status badge'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-amber-open' 'phone signer panel avoids app-specific fallback links'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'id="auth-nip46-copy"' 'phone signer panel avoids redundant copy control above URI box'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-pairing' 'phone signer QR and controls share one side-by-side pairing layout'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Phone signer login steps' 'phone signer panel shows explicit Android-friendly steps'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Return here after approval.' 'phone signer steps explain the Android app-switch return'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-nip46-pairing {' 'phone signer pairing layout keeps controls beside the QR'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'grid-template-columns: max-content max-content;' 'phone signer pairing layout uses two columns on roomy screens'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-nip46-steps {' 'phone signer steps are styled as compact status rows'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '@media (max-width: 480px)' 'phone signer panel stacks on narrow Android viewports'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'order: -1;' 'phone signer controls appear before the QR on narrow Android viewports'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-open" class="auth-secondary-btn auth-nip46-open-link"' 'phone signer panel shows a button-styled Nostr Connect opener'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" '>Copy link<' 'phone signer copy fallback avoids text button chrome'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-uri-copy' 'phone signer URI box includes one-click copy button'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'id="auth-nip46-uri" hidden' 'phone signer hides the raw Nostr Connect URI by default'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '>Connect Nostr<' 'phone signer primary link uses clearer wording'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'hidden>Continue sign-in</button>' 'phone signer continue button starts hidden until a signer is paired'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'linkActions.hidden = paired' 'paired phone signer state hides the Nostr Connect replacement link'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'els.authNip46Qr.hidden = paired' 'paired phone signer state hides the QR that would replace the Amber connection'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-nip46-link-actions[hidden]' 'phone signer link row stays hidden when paired despite flex display styles'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-nip46-pairing .auth-qr[hidden]' 'phone signer QR stays hidden when paired despite QR display styles'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "setNip46Diagnostics('Signer connected. Continue sign-in.', 'ok')" 'paired phone signer state explains that login can continue without reconnecting Amber'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Phone signer is already paired. Continue sign-in and approve the login request in Amber.' 'paired phone signer state gives Amber-specific continuation guidance'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "els.authPhoneBtn.textContent = 'Continue sign-in'" 'paired phone signer state uses login continuation as the primary action'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "openNativeDeepLink(currentNip46Uri(), 'Phone signer link is not ready yet.')" 'paired phone signer login reopens the saved Amber connection without rotating it'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'nav-auth.js?v=20260524-navbar-toolbar1' 'nav auth include is cache-busted for Amber reuse login fix'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.machine-string-copy {' 'machine string copy buttons share one minimal icon style'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'aspect-ratio: 1;' 'Nostr Connect copy icon button stays square'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background: transparent;' 'machine string copy buttons are transparent until hover'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border: 0;' 'machine string copy buttons are borderless until hover'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'box-shadow: none;' 'machine string copy buttons avoid button chrome until hover'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-reset' 'phone signer panel omits fresh-link recovery from primary onboarding'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function copyNip46Uri()' 'phone signer copy controls share one copy helper'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "els.authNip46Open.textContent = 'Connect Nostr'" 'phone signer open link uses clearer wording'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function continuePhoneSignerLogin' 'phone signer pairing continues into login automatically'
assert_file_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" 'Connect a phone signer with the phone signer link' 'zap signer prompt is app-neutral'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" 'Connect Amber with the phone signer link' 'zap signer prompt does not make generic phone signer flow Amber-specific'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'id="auth-nip46-open" class="auth-inline-link" href="#" target="_blank"' 'Nostr Connect link avoids target blank so Android can open Amber reliably'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'setNip46Diagnostics' 'phone signer flow reports relay/decrypt/pairing status'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Relay listener closed. Reopen the phone signer panel to make a fresh link.' 'phone signer relay close does not show persistent alarming diagnostics'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Pair the signer here. Continue unlocks after pairing.' 'phone signer panel does not show redundant top-level pairing alert'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'isPhonePairingPanelActive()' 'phone signer relay close diagnostics are gated to the visible phone panel'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'could not decrypt it' 'phone signer reports unreadable relay responses'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "sendNip46Rpc('sign_event', [JSON.stringify(template)]" 'Nostr Connect sign_event sends stringified events per NIP-46'
assert_file_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" 'promptPhoneSignerForZap' 'Zap UI prompts phone signer instead of silently creating unsigned zap invoices'
assert_file_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" "window.blogAuth.openLoginModal('phone')" 'Zap UI opens phone signer pairing when shared signer is unavailable'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'relay.primal.net' 'Nostr Connect does not depend on Primal relay fallback'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" 'relay.primal.net' 'Zap requests do not depend on Primal relay fallback'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" "'10000'" 'Zap modal preset amounts do not include 10000 sats'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" "'21000'" 'Zap modal preset amounts do not include 21000 sats'
assert_file_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" "return values.slice(0, 4);" 'Zap modal preset ladder is capped to compact low-friction amounts'
assert_file_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" 'placeholder="Write a note"' 'Zap modal note placeholder uses neutral wording'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" 'Say something with the zap' 'Zap modal avoids overly chatty note placeholder wording'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'class="overflow-menu-icon-svg"' 'account menu source uses SVG overflow icon'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'aria-label="User menu">⋯</button>' 'account menu source does not use horizontal dots'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.overflow-menu-icon-svg' 'overflow menu icon uses shared SVG styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" 'overflowMenuIconSvg()' 'blog post cards render SVG overflow icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-context.js" 'overflowMenuIconSvg()' 'post pages normalize to SVG overflow icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.post-page-menu-panel button {' 'post overflow menu item styles are explicit'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'box-shadow: none !important;' 'post overflow menu items stay flat'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '#main-content .post-page-menu-panel button' 'lapidarist theme keeps post menu items flat'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'not(.list-inline-edit-link):not(.list-page-nav-title-edit-link)' 'lapidarist theme keeps page-head edit links flat'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#nip23-page-title .list-page-title-actions .list-admin-primary-btn' 'nip23 page title action buttons use the same no-border reset'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '#public-ranking-title .list-page-title-actions .list-admin-primary-btn' 'public ranking title action buttons use the same no-border reset'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '#nip23-page-root #nip23-page-title .list-page-title-actions .list-admin-primary-btn' 'lapidarist nip23 title buttons do not inherit button depth shadows'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '#public-ranking-root #public-ranking-title .list-page-title-actions .list-admin-primary-btn' 'lapidarist public ranking title buttons do not inherit button depth shadows'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'clip-path: none !important;' 'title action buttons avoid WebKit clipped-corner antialias artifacts'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'clip-path: none !important;' 'lapidarist title action buttons avoid clipped-corner antialias artifacts'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" '20260525-firefox-title-actions' 'auth theme switcher uses current Firefox title action theme cache buster'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'popup-menu-shadow:' 'site defines one shared popup menu shadow token'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background-image: none !important;' 'popup menus suppress theme texture backgrounds'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'box-shadow: var(--popup-menu-shadow, var(--menu-shadow));' 'popup menus use the shared floating style'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" ':where(.nav-menu-panel, .nav-login-menu, .nav-overflow-panel, .post-page-menu-panel, .list-inline-row-menu) :where(a, button, .nav-menu-item, [role="menuitem"])' 'menu items share plain non-card styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-radius: 0 !important;' 'menu items do not render as rounded separated pills'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'Final menu-item flattening: popup rows are not individual button cards.' 'menu item final reset documents the flat row contract'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'appearance: none !important;' 'menu items suppress native button chrome'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background: transparent !important;' 'menu items stay transparent until hover'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" ':not([role="menuitem"]) {' 'content button chrome does not target menu item buttons'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'box-shadow: none !important;' 'lapidarist menu items do not get item shadows'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'background-image: none !important;' 'lapidarist popup menus do not use paper texture'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'border: 0 !important;' 'lapidarist popup menus do not draw border lines'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'Final menu-item flattening: popup rows are not individual button cards.' 'Lapidarist menu items keep the flat row contract'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'background-color: transparent !important;' 'Lapidarist menu rows do not render as separate cards'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" ':not([role="menuitem"]) {' 'Lapidarist control shadow does not target menu item buttons'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'button.contact-value-link,' 'Lapidarist zap contact links stay visually like ordinary links'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-context.js" "document.addEventListener('pointerup'" 'post overflow menu has an explicit mobile pointer activation path'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_post_page_menu_html()' 'single post server uses shared post menu template'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" '<div class="post-page-menu" hidden>' 'single post server menu is hidden until auth and reader actions are resolved'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'data-post-page-admin-action role="menuitem" hidden>Edit post...' 'single post server edit action is hidden until admin auth resolves'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'data-post-page-admin-action role="menuitem" hidden>Add to list...' 'single post server add-to-list action is hidden until admin auth resolves'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'data-post-page-admin-action role="menuitem" hidden>Delete post...' 'single post server delete action is hidden until admin auth resolves'
assert_file_contains "$ROOT_DIR/cgi/blog-open-post" 'post_menu_html=$(blog_post_page_menu_html)' 'single post route uses shared post menu template'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_post_nav_column_html()' 'single post server uses shared post navigation column template'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_post_nav_html()' 'single post server uses shared post navigation wrapper template'
assert_file_contains "$ROOT_DIR/cgi/blog-open-post" 'post_nav_html=$(blog_post_nav_html' 'single post route uses shared post navigation template'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_canonical_post_file_path()' 'single post server canonicalizes managed post paths away from generated mounts'
assert_file_contains "$ROOT_DIR/cgi/blog-open-post" 'blog_post_rel_path_for_file "$md_file"' 'single post server builds static fallback paths from canonical post rel paths'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-context.js" "normalizePostPageMenu(document.querySelector('.post-page-menu'))" 'single post client normalizes legacy menus before interaction'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-context.js" "node.setAttribute('data-post-page-admin-action', '')" 'single post client marks legacy admin actions before auth resolves'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-context.js" 'if (actionNode.hidden)' 'single post client ignores hidden menu actions'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'clampNavOverflowPanelToViewport' 'nav overflow menu clamps inside the viewport on mobile'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.nav-overflow-panel.is-viewport-positioned' 'nav overflow menu uses viewport positioning when open'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'touch-action: manipulation;' 'post overflow menu trigger remains tappable on mobile'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'overflow: visible;' 'mobile nav keeps absolute account and overflow menus visible'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" '/static/post-resize.js' 'blog pages load the shared post resize behavior'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-resize.js" 'EDGE_PX = 14' 'post resize behavior uses edge-only drag detection'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-resize.js" 'delta * 2' 'post resize behavior grows symmetrically from the center'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-resize.js" 'bodyContentWidth' 'post resize behavior clamps saved widths to the centered content column'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'body.blog-post-resize-enabled' 'post resize behavior widens the blog canvas when active'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.post-item.blog-post-resizable' 'post resize behavior keeps cards centered with explicit width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'justify-items: center;' 'blog post list centers cards under the heading column'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'box-sizing: border-box;' 'blog post cards include padding inside centered width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: clamp(30rem, 92vw, 60rem);' 'single post island has extra horizontal room around the fixed prose measure'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.post-single-item.blog-post-resizable' 'single post resizable cards keep the same default width as the reading island'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'body:has(.post-single-item) nav.site-nav' 'single post navbar follows the post reading island width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: var(--blog-post-resizable-width, clamp(30rem, 92vw, 60rem)) !important;' 'single post navbar follows the saved post width when resizing is active'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'padding: 1.75rem 3.25rem 1.55rem;' 'single post island adds desktop padding without changing prose measure'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.post-single-item .post-single-body > hr::before' 'post markdown horizontal rules render as centered separator text'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-entry-markdown > hr::before' 'NIP-23 markdown horizontal rules render as centered separator text'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'content: "***";' 'post markdown horizontal rules display centered asterisks'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-context.js" 'function normalizeMarkdownSeparators(body)' 'post context normalizes literal markdown separator paragraphs'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-context.js" 'function normalizeAllMarkdownSeparators()' 'post context normalizes server-rendered markdown separators at startup'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-context.js" "node.classList.add('markdown-separator');" 'post context marks literal asterisk separator paragraphs for centering'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.post-single-item .post-single-body > .markdown-separator' 'literal markdown separator paragraphs are centered in post bodies'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'box-sizing: border-box;' 'post resize behavior measures and applies the same box width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'Final mobile containment: desktop-width content must never expand the phone viewport.' 'mobile layout has final viewport containment guard'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.post-single-item .post-single-body table {' 'mobile post tables are constrained inside the post body'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'overflow-x: auto;' 'mobile overflowing post content scrolls naturally inside its own box'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'overflow-wrap: anywhere;' 'mobile post links and titles can wrap instead of widening the page'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'calc(100dvw - 0.75rem)' 'mobile modal widths use dynamic viewport units'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'calc(100dvh - 1rem)' 'mobile modals are height-capped to the dynamic viewport'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '<option value="icon-gallery">Product Gallery (kind 30004)</option>' 'admin create-page dialog exposes product-gallery type label'

# 9) blog-get-config runtime output stays correct with direct site.conf parsing.
cat > "$blog_site_conf" <<'EOF_SITE_CONF'
registration_enabled=true
site_title=Fixture Site
theme=lapidarist
drip_interval_hours=4
drip_interval_minutes=240
drip_randomness_minutes=0
feed_full_text=true
feed_items=50
append_site_title_to_page_title=false
nostr_bridge_enabled=true
new_users_are_admins=false
plugin_nostr_support=true
plugin_nostr_login=true
plugin_nostr_bridge=true
plugin_nostr_posts=true
plugin_zaps=true
plugin_btcpay=true
plugin_video_chat=false
video_chat_participant_limit=8
video_chat_token_ttl_seconds=7200
video_chat_janus_wss=wss://janus.example.com/janus
video_chat_signaling_wss=wss://signal.example.com/ws
video_chat_public_rooms=true
video_chat_rooms=Lobby,Office Hours
zaps_enabled=false
zap_lud16=
zap_default_amount_sats=1000
EOF_SITE_CONF
printf '%s\n' 'wss://relay.example.com' > "$blog_nostr_relays_file"
blog_get_config_out=$(REQUEST_METHOD=GET CONTENT_LENGTH=0 "$ROOT_DIR/cgi/blog-get-config")
assert_contains "$blog_get_config_out" '"site_title":"Fixture Site"' 'blog-get-config returns parsed site title'
assert_contains "$blog_get_config_out" '"theme":"lapidarist"' 'blog-get-config returns parsed theme'
assert_contains "$blog_get_config_out" '"plugins":{"nostr_support":true,"nostr_login":true,"nostr_bridge":true,"nostr_posts":true,"zaps":true,"btcpay":true,"video_chat":false,"overworld":false}' 'blog-get-config returns normalized plugins json'
assert_contains "$blog_get_config_out" '"video_chat":{"participant_limit":8,"token_ttl_seconds":7200,"janus_wss":"wss://janus.example.com/janus","signaling_wss":"wss://signal.example.com/ws","public_rooms":true,"rooms":["Lobby","Office Hours"],"active_rooms":["Lobby","Office Hours"],"room_settings":"Lobby\nOffice Hours","scheduled_rooms":"","room_theme_images":{},"include_syntax":"{{video-chat}}"}' 'blog-get-config returns video calling settings and include syntax'
assert_contains "$blog_get_config_out" '"nostr_relays":["wss://relay.example.com"]' 'blog-get-config returns relay list json'
login_begin_empty_out=$(REQUEST_METHOD=POST CONTENT_LENGTH=0 HTTP_HOST=fixture.example "$ROOT_DIR/cgi/nostr-auth-login-begin")
assert_contains "$login_begin_empty_out" '"success":true' 'Nostr login begin returns a challenge for empty POST bodies'
assert_contains "$login_begin_empty_out" '"challenge":"' 'Nostr login begin zero-length POST does not block waiting for stdin'

# 10) Broader static checks to guard accidental cache regression in targeted fetches.
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "cache: 'no-store'" 'nav-auth has no-store directives'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "cache: 'no-store'" 'admin has no-store directives'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "cache: 'no-store'" 'blog-page has no-store directives'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "data-compose-action=\"delete\"" 'in-blog compose exposes delete-draft trash action'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "apiPost('/cgi/blog-delete-draft'" 'in-blog compose can delete local draft via delete endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "class=\"field-row blog-compose-title-row\"" 'in-blog compose puts preview control on title row without separate New post heading'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" 'return '\''<div class="post-summary">'\'' + markdownBlock(text) + readMore + '\''</div>'\'';' 'blog index renders post summaries as block markdown'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" 'function markdownInlineFallback(md)' 'blog index markdown fallback renders summary links when marked is unavailable'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" "cache: 'no-store'" 'contact-page has no-store directives'
assert_file_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" "cache: 'no-store'" 'nip23-page has no-store directives'
assert_file_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" 'id="nip23-price-input"' 'nip23 editor exposes product USD price input'
assert_file_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" 'id="nip23-repo-input"' 'nip23 editor exposes product artifact repo field'
assert_file_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" 'id="nip23-tag-input"' 'nip23 editor exposes product artifact tag field'
assert_file_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" 'data-nip23-action="add-to-cart"' 'nip23 read mode exposes add-to-cart action'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.nip23-product-card {' 'nip23 read mode renders product checkout card styles'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" "cache: 'no-store'" 'public-ranking-page has no-store directives'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "cache: 'no-store'" 'list has no-store directives'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-compose-title-row {' 'in-blog compose title row style exists'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-compose-btn {' 'in-blog compose preview/publish buttons are compact'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-compose-delete {' 'in-blog compose has lower-left trash icon control style'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '@keyframes blog-compose-fade-in {' 'in-blog compose fade-in animation exists'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'if (!hasDynamicPageRoot() || pageReady)' 'hydration timeout fallback always unlocks the page'

prune_hook_count=$(grep -Fc 'blog_nostr_pages_prune_stale_source_pages "$normalized"' "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" || printf '0')
assert_eq "1" "$prune_hook_count" 'nostr page prune hook only runs on save path'

# 11) Ensure scripts are syntactically valid after changes.
assert_success sh -n "$ROOT_DIR/cgi/blog-lib.sh"
assert_success sh -n "$ROOT_DIR/cgi/blog-get-config"
assert_success sh -n "$ROOT_DIR/cgi/blog-nostr-pages-common.sh"
assert_success sh -n "$ROOT_DIR/cgi/blog-public-ranking-common.sh"
assert_success sh -n "$ROOT_DIR/cgi/blog-publish-nostr-page"
assert_success sh -n "$ROOT_DIR/cgi/blog-publish-list-page"
assert_success sh -n "$ROOT_DIR/cgi/blog-submit-public-ranking"
assert_success sh -n "$ROOT_DIR/cgi/blog-payments-common.sh"
assert_success sh -n "$ROOT_DIR/cgi/blog-payments"
assert_success sh -n "$ROOT_DIR/cgi/blog-get-product"
assert_success sh -n "$ROOT_DIR/cgi/blog-purchase"
assert_success sh -n "$ROOT_DIR/cgi/blog-download"
assert_success sh -n "$ROOT_DIR/cgi/blog-delivery"
assert_success sh -n "$ROOT_DIR/cgi/blog-create-product-page"
assert_success sh -n "$ROOT_DIR/tests/test-content-sync-regressions.sh"
assert_success sh -n "$ROOT_DIR/tests/test-payments-runtime.sh"

# 12) Managed source-page sync invariants (unit layer).
sync_cfg=$(jq -cn '{pages:[
  {slug:"about", type:"nip23", show_in_nav:true},
  {slug:"contact", type:"contact", show_in_nav:true},
  {slug:"list", type:"list", show_in_nav:true},
  {slug:"assignments", type:"public-ranking", show_in_nav:false}
]}')
blog_nostr_pages_save_json "$sync_cfg"
blog_nostr_pages_sync_source_pages "$sync_cfg"

about_mount=$(blog_nostr_page_mount_path 'about')
contact_mount=$(blog_nostr_page_mount_path 'contact')
list_mount=$(blog_nostr_page_mount_path 'list')
ranking_mount=$(blog_nostr_page_mount_path 'assignments')

assert_success test -f "$about_mount"
assert_success test -f "$contact_mount"
assert_success test -f "$list_mount"
assert_success test -f "$ranking_mount"
assert_file_contains "$about_mount" 'id="nip23-page-title"' 'nip23 mount keeps expected template markers'
assert_file_contains "$contact_mount" 'id="contact-page-title"' 'contact mount keeps expected template markers'
assert_file_contains "$list_mount" 'id="list-page-title"' 'list mount keeps expected template markers'
assert_file_contains "$ranking_mount" 'id="public-ranking-title"' 'public ranking mount keeps expected template markers'

# Prune stale managed mount when slug disappears from config.
stale_cfg=$(jq -cn '{pages:[{slug:"stale-list", type:"list", show_in_nav:true}]}')
blog_nostr_pages_save_json "$stale_cfg"
blog_nostr_pages_sync_source_pages "$stale_cfg"
stale_mount=$(blog_nostr_page_mount_path 'stale-list')
assert_success test -f "$stale_mount"
blog_nostr_pages_save_json "$(jq -cn '{pages:[]}')"
blog_nostr_pages_sync_source_pages "$(jq -cn '{pages:[]}')"
assert_file_missing "$stale_mount" 'stale managed mount removed when no longer configured'

# Preserve custom mount files (must not overwrite user-authored page files).
custom_slug='custom-safe'
custom_mount=$(blog_nostr_page_mount_path "$custom_slug")
mkdir -p "$(dirname "$custom_mount")"
printf '%s\n' 'custom page body' > "$custom_mount"
blog_nostr_page_sync_mount "$custom_slug" "list" >/dev/null 2>&1 || true
assert_file_contains "$custom_mount" 'custom page body' 'custom mount remains untouched by managed sync'

# 13) Rebuild trigger invariant for navbar page listing (integration layer).
wizardry_dir="$TMP_ROOT/wizardry"
mkdir -p "$wizardry_dir/spells/web"
build_marker="$TMP_ROOT/build-marker"
cat > "$wizardry_dir/spells/web/build" <<'EOBUILD'
#!/bin/sh
set -eu
site_name=${1-}
printf '%s\n' "$site_name" > "${BUILD_MARKER_FILE:?missing marker path}"
EOBUILD
chmod +x "$wizardry_dir/spells/web/build"

navbar_cfg=$(jq -cn '{pages:[{slug:"about", type:"nip23", show_in_nav:true}]}')
blog_nostr_pages_save_json "$navbar_cfg"
rm -f "$blog_site_root/build/pages/about.html" "$build_marker"
set +e
navbar_out=$(WIZARDRY_DIR="$wizardry_dir" BUILD_MARKER_FILE="$build_marker" "$ROOT_DIR/cgi/blog-list-navbar-pages" 2>&1)
navbar_status=$?
set -e
if [ "$navbar_status" -eq 0 ]; then
  pass
else
  fail "navbar listing command failed while testing build queueing (status: $navbar_status, output: $navbar_out)"
fi
assert_contains "$navbar_out" '"success":true' 'navbar listing still returns success without build side effects'
sleep 0.2
assert_file_missing "$build_marker" 'navbar listing does not trigger async build from public request path'

mkdir -p "$blog_site_root/build/pages"
printf '%s\n' '<!doctype html>' > "$blog_site_root/build/pages/about.html"
printf '%s\n' '<!doctype html>' > "$blog_site_root/build/pages/blog.html"
rm -f "$build_marker"
set +e
navbar_out_no_build=$(WIZARDRY_DIR="$wizardry_dir" BUILD_MARKER_FILE="$build_marker" "$ROOT_DIR/cgi/blog-list-navbar-pages" 2>&1)
navbar_no_build_status=$?
set -e
if [ "$navbar_no_build_status" -eq 0 ]; then
  pass
else
  fail "navbar listing command failed while testing no-build path (status: $navbar_no_build_status, output: $navbar_out_no_build)"
fi
assert_contains "$navbar_out_no_build" '"success":true' 'navbar listing returns success when mounted html exists'
sleep 0.2
assert_file_missing "$build_marker" 'navbar listing skips build queue when mounted html already exists'

# 14) Pre-build emits a static bootstrap bundle for first paint.
printf '%s\n' 'site_title=Example Site' > "$blog_site_conf"
printf '%s\n' 'theme=seer' >> "$blog_site_conf"
printf '%s\n' 'append_site_title_to_page_title=true' >> "$blog_site_conf"
blog_nostr_pages_save_json "$(jq -cn '{pages:[{slug:"about", type:"nip23", show_in_nav:true, show_in_footer:true, placeholder_title:"About"}]}')"
assert_success "$ROOT_DIR/cgi/pre-build"
site_bootstrap_file="$blog_site_root/site/static/site-bootstrap.js"
build_bootstrap_file="$blog_site_root/build/static/site-bootstrap.js"
assert_success test -f "$site_bootstrap_file"
assert_success test -f "$build_bootstrap_file"
assert_file_contains "$site_bootstrap_file" 'window.__wizardrySiteBootstrap = bootstrap;' 'pre-build bootstrap publishes global site bootstrap'
assert_file_contains "$site_bootstrap_file" 'Example Site' 'pre-build bootstrap captures site title'
assert_file_contains "$site_bootstrap_file" 'wizardry_blog_theme_v1' 'pre-build bootstrap seeds theme cache'
assert_file_contains "$site_bootstrap_file" '"slug":"about"' 'pre-build bootstrap captures navbar pages'
assert_file_contains "$site_bootstrap_file" 'footer_pages' 'pre-build bootstrap captures footer pages key'
assert_file_contains "$site_bootstrap_file" 'footer_pages: [{"slug":"about"' 'pre-build bootstrap captures footer pages'
assert_file_contains "$build_bootstrap_file" 'footer_pages: [{"slug":"about"' 'pre-build copies site bootstrap to build output'
navbar_json_file="$blog_site_root/site/static/navbar-pages.json"
assert_success test -f "$navbar_json_file"
assert_file_contains "$navbar_json_file" '"success":true' 'pre-build static navbar json is generated'
assert_file_contains "$navbar_json_file" '"slug":"about"' 'pre-build static navbar json captures page list'
footer_json_file="$blog_site_root/site/static/footer-pages.json"
build_footer_json_file="$blog_site_root/build/static/footer-pages.json"
assert_success test -f "$footer_json_file"
assert_success test -f "$build_footer_json_file"
assert_file_contains "$footer_json_file" '"success":true' 'pre-build static footer json is generated'
assert_file_contains "$footer_json_file" '"slug":"about"' 'pre-build static footer json captures page list'
assert_file_contains "$build_footer_json_file" '"slug":"about"' 'pre-build copies footer json to build output'
public_posts_file="$blog_site_root/site/static/public-posts.json"
assert_success test -f "$public_posts_file"
assert_file_contains "$public_posts_file" '"success":true' 'pre-build public post catalog is generated'

# 15) UI invariant for Nostr nav icon gutter alignment rule.
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '[data-admin-nav="nostr-bridge"] .admin-nav-icon-slot' 'nostr nav icon uses dedicated gutter alignment rule'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '#admin-panel.sidebar-collapsed .admin-content {' 'collapsed admin keeps a left gutter for reveal icon'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'section.hidden = !active;' 'admin section toggling remains direct visibility toggle'
assert_file_not_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'is-switch-animating' 'admin section switch animation class should not exist in admin page'
assert_file_not_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'admin-fade-in' 'admin section fade animation class should not exist in admin page'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/admin.js" 'is-switch-animating' 'admin section switch animation class should not exist in admin script'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/admin.js" 'admin-fade-in' 'admin section fade animation class should not exist in admin script'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '#admin-panel #posts-list > .placeholder.table-empty {' 'posts empty-state placeholder remains centered'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '[data-admin-section="zaps"] .runtime-settings-list .field-row > button {' 'zaps runtime shared button layout rule remains fit-to-content aligned'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "zapsRuntimeReady: false" 'zaps runtime tracks first successful load before showing resolved statuses'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'Checking... <span class="loading-spinner"' 'zaps runtime shows checking state while initial status is loading'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "renderZapsRuntime(data.runtime || {}, undefined, undefined);" 'zaps runtime polling preserves inline feedback instead of clearing it on refresh'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/admin.js" 'button[data-zaps-action]' 'zaps runtime no longer exposes in-app install buttons'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'data-admin-nav="btcpay"' 'admin nav includes Lightning section entry'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'id="admin-nav-btcpay-status"' 'admin nav includes Lightning status pill'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'data-admin-section="btcpay"' 'admin includes Lightning section scaffold'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'data-admin-nav="btcpay-checkout"' 'admin nav includes BTCPay checkout section under Lightning'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'data-admin-section="btcpay-checkout"' 'admin includes BTCPay checkout control scaffold'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '[data-admin-section="btcpay"] .runtime-settings-list .field-row > button,' 'lightning runtime action buttons are fit-to-content aligned'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" '/cgi/blog-manage-lightning' 'admin runtime fetches Lightning status endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" '/cgi/blog-manage-btcpay' 'admin runtime fetches BTCPay checkout status endpoint'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/admin.js" 'data-btcpay-action="install_btcpay"' 'admin runtime no longer exposes in-app payment stack install buttons'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "state.activeSection === 'btcpay'" 'lightning polling only runs while the Lightning section is active'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "state.activeSection === 'btcpay-checkout'" 'BTCPay checkout refresh only runs while the BTCPay section is active'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'setAdminSectionLoading(section, true);' 'admin lazy section loader shows section loading feedback before async content resolves'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '.admin-section.is-loading::before' 'admin lazy sections render a visible loading overlay'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-lightning" '"headquarters_managed":true' 'lightning cgi marks the runtime as Headquarters-managed'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-lightning" '"lightning_online"' 'lightning cgi runtime emits node status key'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-lightning" '"public_address"' 'lightning cgi runtime emits the public peer address'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-lightning" '"can_receive_zaps"' 'lightning cgi runtime emits zap receive readiness'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-zaps" '"headquarters_managed":true' 'zaps cgi marks the runtime as Headquarters-managed'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-zaps" 'Provision Bitcoin, Core Lightning, and the Lightning Address endpoint from the dedicated payments host in Headquarters.' 'zaps cgi reports external software management boundary'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-zaps" '"effective_lud16"' 'zaps cgi runtime emits effective Lightning Address'
assert_file_contains "$ROOT_DIR/wizardry-server-requirements.conf" 'bitcoin_node=optional' 'server requirements keep the Bitcoin node off the blog-only VPS by default'
assert_file_contains "$ROOT_DIR/wizardry-server-requirements.conf" 'lightning_node=optional' 'server requirements keep the Lightning node off the blog-only VPS by default'
assert_file_contains "$ROOT_DIR/wizardry-server-requirements.conf" 'zap_endpoint=optional' 'server requirements keep the Lightning Address endpoint off the blog-only VPS by default'
assert_file_contains "$ROOT_DIR/wizardry-server-requirements.conf" 'stonr=required' 'server requirements declare the Stonr binary as required'
assert_file_contains "$ROOT_DIR/wizardry-server-requirements.conf" 'stonr_relay=required' 'server requirements declare the Stonr relay as required'
assert_file_contains "$ROOT_DIR/wizardry-server-requirements.conf" 'watchtower_remote=optional' 'server requirements declare remote watchtower scaffolding as optional'
assert_file_contains "$ROOT_DIR/.headquarters/requirements/zap_endpoint.conf" 'install_script=.headquarters/scripts/ensure-site-zap-endpoint.sh' 'site headquarters config wires direct Lightning Address install script'
assert_file_contains "$ROOT_DIR/.headquarters/requirements/watchtower_remote.conf" 'install_script=.headquarters/scripts/ensure-site-watchtower-remote.sh' 'site headquarters config wires remote watchtower scaffolding'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-relay.conf" 'site=gazeta' 'Stonr support file locks the relay to gazeta'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-relay.conf" 'relay_domain=' 'Stonr support file derives the relay domain from Headquarters context'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-relay.conf" 'mode=site_mirror' 'Stonr support file declares conservative site mirror mode'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-relay.conf" 'public_write=false' 'Stonr support file keeps public relay writes disabled'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-relay.conf" 'write_kinds=24133' 'Stonr support file allows only NIP-46 pairing writes for phone signers'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-gazeta.yaml" 'name: gazeta' 'Stonr app support profile names gazeta'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-gazeta.yaml" 'ENABLE_LIVE_SUBSCRIPTIONS: true' 'Stonr app support profile enables live Nostr subscriptions'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-gazeta.yaml" 'ENABLE_MIRRORING: true' 'Stonr app support profile enables site mirroring'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-gazeta.yaml" 'ALLOW_KINDS:' 'Stonr app support profile constrains public write kinds'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-gazeta.yaml" '    - 24133' 'Stonr app support profile allows NIP-46 pairing writes'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-gazeta.yaml" 'ENABLE_FILE_API: false' 'Stonr app support profile keeps file APIs disabled'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr.sh" 'b020dc1e1b1799910f329f531b60a5d2b714ea41' 'Stonr installer pins the publish-capable Stonr build'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr.sh" 'headquarters-commit' 'Stonr installer records the installed pinned commit'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr.sh" 'cargo build -j "$CARGO_BUILD_JOBS" -p stonr' 'Stonr installer uses a low-memory build profile for the legacy blog VPS'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'HQ_UPLOADED_TREE_PATH-}/.headquarters/site-support/stonr-relay.conf' 'Stonr provisioner reads the uploaded site support policy'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'HQ_UPLOADED_TREE_PATH-}/.headquarters/site-support/stonr-gazeta.yaml' 'Stonr provisioner reads the uploaded app support profile'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'relay.app-support.json' 'Stonr provisioner writes Stonr app support sidecar list'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'print-app-support' 'Stonr provisioner verifies Stonr is reading app support locks'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'domain_hook_file()' 'Stonr provisioner supports canonical domain nginx hooks'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'PUBLIC_RELAY_URL=$(relay_url)' 'Stonr provisioner exports the public relay URL'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'ALLOW_KINDS=$(allow_kinds_value)' 'Stonr provisioner can expose limited relay writes without becoming a general public relay'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'MAX_PUBLISHES_PER_WINDOW=120' 'Stonr provisioner rate-limits limited relay writes'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'systemctl restart "$(service_name)"' 'Stonr provisioner restarts the relay after env policy changes'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'disable_staging_relay_hooks_when_needed' 'Stonr provisioner removes staging relay exposure when canonicalized'
assert_file_contains "$ROOT_DIR/.headquarters/software/bitcoin-node.conf" 'submenu_label=Node Stack' 'site software catalog groups Bitcoin under Payments > Node Stack'
assert_file_contains "$ROOT_DIR/.headquarters/software/lightning-node.conf" 'submenu_label=Node Stack' 'site software catalog groups Lightning under Payments > Node Stack'
assert_file_contains "$ROOT_DIR/.headquarters/software/zap-endpoint.conf" 'submenu_label=Public Endpoint' 'site software catalog groups the zap endpoint under Payments > Public Endpoint'
assert_file_contains "$ROOT_DIR/.headquarters/software/btcpay-checkout.conf" 'submenu_label=Checkout' 'site software catalog groups BTCPay under Payments > Checkout'
assert_file_contains "$ROOT_DIR/.headquarters/software/watchtower.conf" 'submenu_label=Safety' 'site software catalog groups watchtower under Payments > Safety'
assert_success test -x "$ROOT_DIR/cgi/blog-manage-lightning"
assert_success test -x "$ROOT_DIR/cgi/blog-manage-btcpay"
assert_success test -x "$ROOT_DIR/cgi/blog-payments"
assert_success test -x "$ROOT_DIR/cgi/blog-get-product"
assert_success test -x "$ROOT_DIR/cgi/blog-purchase"
assert_success test -x "$ROOT_DIR/cgi/blog-download"
assert_success test -x "$ROOT_DIR/cgi/blog-delivery"
assert_success test -x "$ROOT_DIR/cgi/blog-create-product-page"
assert_file_contains "$ROOT_DIR/cgi/blog-payments" 'create_order' 'payments cgi supports create_order action'
assert_file_contains "$ROOT_DIR/cgi/blog-payments" 'order_status' 'payments cgi supports order_status action'
assert_file_contains "$ROOT_DIR/cgi/blog-payments" 'simulate_paid' 'payments cgi supports simulated paid transition'
assert_file_contains "$ROOT_DIR/cgi/blog-payments" 'webhook' 'payments cgi supports provider webhook action'
assert_file_contains "$ROOT_DIR/cgi/blog-payments" 'blog_btcpay_create_invoice_json' 'payments cgi creates BTCPay invoices through Greenfield API'
assert_file_contains "$ROOT_DIR/cgi/blog-payments" 'refresh_btcpay_order_json' 'payments cgi can refresh pending BTCPay invoice state'
assert_file_contains "$ROOT_DIR/cgi/blog-payments" 'ramp_host_api_key:' 'payments status emits ramp runtime key for checkout embeds'
assert_file_contains "$ROOT_DIR/cgi/blog-payments" 'paybis_partner_id:' 'payments status emits paybis runtime key for checkout embeds'
assert_file_contains "$ROOT_DIR/cgi/blog-payments" 'provider_url: $provider_url' 'payments orders persist provider_url for reload-safe embeds'
assert_file_contains "$ROOT_DIR/cgi/blog-download" 'blog_payments_verify_token "$token" download' 'download cgi verifies signed download token'
assert_file_contains "$ROOT_DIR/cgi/blog-delivery" 'blog_payments_verify_token "$token" delivery' 'delivery cgi verifies durable buyer delivery token'
assert_file_contains "$ROOT_DIR/cgi/blog-delivery" 'blog_payments_issue_download_token "$order_id" "$slug"' 'delivery cgi mints short-lived product download tokens'
assert_file_contains "$ROOT_DIR/cgi/blog-download" 'blog_payments_release_assets_json' 'download cgi resolves release assets from GitHub API'
assert_file_not_contains "$ROOT_DIR/cgi/blog-download" 'Location: %s' 'download cgi avoids exposing direct GitHub asset URLs to clients'
assert_file_contains "$ROOT_DIR/cgi/blog-create-product-page" 'type: "nip23"' 'product-page creator provisions nip23 product pages'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-noster" 'setting_auto_start_from_config()' 'noster runtime reads auto-start from config files'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-noster" '.runtime.auto_start' 'noster auto-start parser checks runtime.auto_start field'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-noster" 'activate_relay_url_flow()' 'noster runtime exposes relay URL setup flow helper'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-noster" 'activate_relay_url' 'noster runtime supports activate_relay_url action'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-noster" '"relay_url"' 'noster runtime emits relay_url in runtime json'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-noster" '"relay_ssl_status"' 'noster runtime emits relay_ssl_status in runtime json'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-noster" 'configured_public_relay_url()' 'noster runtime can derive the configured public relay URL'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-noster" 'relay_health_url()' 'noster runtime checks public relay health when Stonr status is unavailable'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '[data-admin-section="nostr-bridge"] .checkbox-row {' 'nostr checkbox rows use shared two-column grid layout'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '.noster-relay-ssl.is-ok {' 'nostr runtime UI includes relay SSL indicator style'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'data-noster-action="activate_relay_url"' 'nostr runtime UI exposes relay URL setup action button'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" '<strong>Relay URL</strong>' 'nostr runtime UI shows relay URL line item'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'list-page-description-empty">No description.</span> <button type="button" class="list-inline-edit-link" data-list-head-edit="description">Edit...' 'list edit mode shows italic no-description text before edit action'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'list-page-description-empty">No description.</span> <button type="button" class="list-inline-edit-link" data-ranking-head-edit="description">Edit...' 'public ranking edit mode shows italic no-description text before edit action'
assert_file_contains "$SITE_SOURCE_ROOT/static/contact-page.js" 'list-page-description-empty">No description.</span> <button type="button" class="list-inline-edit-link" data-contact-head-edit="description">Edit...' 'contact edit mode shows italic no-description text before edit action'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'Allow signed-in Nostr users to add entries' 'public ranking editor includes friendly open-submission toggle label'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'id="public-ranking-edit-allow-open"' 'public ranking editor uses boolean open-submission checkbox'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'id="public-ranking-edit-show-marker-filters"' 'public ranking editor exposes show marker filters checkbox'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'Vote cooldown (minutes)' 'public ranking editor cooldown input is displayed in minutes'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'Upvotes (unique voters)' 'public ranking default metric dropdown uses plain-language upvotes label'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'Hotness (recent-weighted)' 'public ranking default metric dropdown uses plain-language hotness label'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'data-ranking-outro-format' 'public ranking editor no longer exposes markdown/html format dropdown for local after-content'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nip23-page.js" 'nip23-outro-format' 'nip23 editor no longer exposes markdown/html format dropdown for local after-content'
assert_file_contains "$ROOT_DIR/cgi/blog-public-ranking-common.sh" 'show_marker_filters' 'public ranking state supports show_marker_filters setting'
assert_file_contains "$ROOT_DIR/cgi/blog-public-ranking-common.sh" 'BLOG_SESSION_USER_PUBKEY' 'public ranking root coord resolver falls back to signed-in session pubkey when site pubkey is unavailable'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'if (isAdmin() && !state.editMode) {' 'public ranking submit composer is not hidden in normal admin view mode'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" "var forceInline = normalizeSubmissionMode(renderState.submission_mode) === 'open';" 'public ranking submit composer uses explicit toggle UX'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'data-ranking-action="toggle-submit"' 'public ranking submit composer includes toggle control'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'public-ranking-submit-toggle-icon' 'public ranking submit toggle uses the same plus-to-close icon affordance as lists'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'data-ranking-action="toggle-submit-advanced"' 'public ranking submit composer includes advanced toggle'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'id="public-ranking-submit-type-advanced"' 'public ranking admin advanced panel includes entry type selector'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'id="public-ranking-submit-parent-advanced"' 'public ranking admin advanced panel includes parent selector'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" '<select id="public-ranking-submit-type"' 'public ranking base composer omits entry/group dropdown'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" '<span>Body</span><textarea id="public-ranking-submit-content" rows="4" placeholder="Optional body"></textarea>' 'public ranking submit composer labels body field correctly'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'var canConfigureHierarchy = !!(isAdmin() && state.editMode);' 'public ranking hierarchy controls stay admin edit-only in advanced mode'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.public-ranking-submit-fields .public-ranking-submit-add {' 'public ranking submit add button uses compact size override'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-public-ranking-node" 'submitter_pubkey=${BLOG_SESSION_USER_PUBKEY-}' 'public ranking submission falls back to session pubkey identity'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-public-ranking-node" 'if [ "$is_admin" = "true" ]; then' 'public ranking submission allows admin local fallback when signer key is unavailable'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-public-ranking-node" 'local_event_id="local-' 'public ranking admin fallback creates local unsigned event id'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-public-ranking-node" '{id:$id,pubkey:$pubkey,kind:$kind,created_at:$created_at,tags:$tags,content:$content,sig:""}' 'public ranking admin fallback stores unsigned local node payload'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'apiPostFirstAvailable([' 'public ranking submit uses endpoint fallback helper'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" "'/cgi/blog-submit-public-ranking'" 'public ranking submit includes compatibility endpoint fallback'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-public-ranking" 'exec "$SCRIPT_DIR/blog-submit-public-ranking-node"' 'public ranking compatibility endpoint delegates to node submit handler'
assert_success test -x "$ROOT_DIR/cgi/blog-submit-public-ranking"
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "sortButton('name', 'Name')" 'users header exposes sortable Name control'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "sortButton('created', 'Created')" 'users header exposes sortable Created control'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "sortButton('role', 'Role')" 'users header exposes sortable Role control'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'sortUsersForDisplay(state.users)' 'users list rendering applies client-side sort'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" '.user-card-created .user-card-meta {' 'users created date column aligns via inline metadata wrapper rule'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-compose-fab {' 'blog inline compose uses fixed bottom-right compose button style'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-compose-slot.is-open {' 'blog inline compose uses animated expansion slot'

tree_line=$(grep -n 'html += renderTree(graph, renderState);' "$SITE_SOURCE_ROOT/static/public-ranking-page.js" | head -n 1 | cut -d: -f1 || printf '0')
submit_line=$(grep -n 'html += renderSubmitForm(renderState, graph);' "$SITE_SOURCE_ROOT/static/public-ranking-page.js" | head -n 1 | cut -d: -f1 || printf '0')
if [ "${tree_line:-0}" -gt 0 ] && [ "${submit_line:-0}" -gt "${tree_line:-0}" ]; then
  pass
else
  fail 'public ranking add-entry composer renders after ranking list content'
fi

managed_home="$TMP_ROOT/managed-site"
managed_release_root="$managed_home/releases/20260416000000"
managed_shared_data="$managed_home/.sitedata/site"
mkdir -p "$managed_release_root" "$managed_shared_data"
managed_site_data=$(
  WIZARDRY_SITES_DIR="$managed_home/releases" \
  WIZARDRY_SITE_NAME="20260416000000" \
  sh -c '. "$1/cgi/blog-lib.sh"; printf "%s\n" "$blog_site_data"' sh "$ROOT_DIR"
)
assert_eq "$managed_shared_data" "$managed_site_data" 'managed releases resolve shared site data root'

TOTAL=$((PASS_COUNT + FAIL_COUNT))
printf 'Assertions: %s\n' "$TOTAL"
printf 'Passed: %s\n' "$PASS_COUNT"
printf 'Failed: %s\n' "$FAIL_COUNT"

if [ "$FAIL_COUNT" -ne 0 ]; then
  exit 1
fi

printf 'ok\n'
