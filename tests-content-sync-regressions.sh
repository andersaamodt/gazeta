#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
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
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    pass
  else
    fail "$label (missing: $needle)"
  fi
}

assert_file_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq "$needle" "$file"; then
    pass
  else
    fail "$label (missing: $needle in $file)"
  fi
}

assert_file_not_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq "$needle" "$file"; then
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
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'blog_nostr_pages_load_json_fast() {' 'fast normalized nostr pages loader exists for read-only paths'
assert_file_not_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" '. "$SCRIPT_DIR/blog-list-common.sh"' 'navbar endpoint avoids unrelated list library parse cost'
assert_file_not_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" '. "$SCRIPT_DIR/blog-public-ranking-common.sh"' 'navbar endpoint avoids unrelated ranking library parse cost'

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
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "data-blog-action=\"toggle-compose\"" 'blog page exposes inline compose toggle action'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "data-compose-action=\"publish\"" 'blog page inline composer exposes publish action'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "'/cgi/blog-save-post'" 'blog inline composer uses canonical blog-save-post endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "return fetchPostsJson('/static/public-posts.json')" 'blog posts prefer static catalog fetch'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "return fetchPostsJson('/cgi/blog-list-public-posts')" 'blog posts fall back to CGI catalog fetch'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "Object.assign({ cache: 'no-store' }, options || {})" 'admin fetch default no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'Bellheim zap target' 'zaps admin names the Bellheim-compatible zap target'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'Nostr Wallet Connect is a separate wallet-control secret' 'zaps admin distinguishes Lightning Address from NWC secret'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-zaps" '"recent_zaps":%s' 'zaps cgi emits a recent zap receipt list'
assert_file_contains "$ROOT_DIR/cgi/blog-manage-zaps" 'sort_by(.received_at, .published_at) | reverse | .[:50]' 'zaps cgi returns received zaps from newest to oldest'
assert_file_contains "$SITE_SOURCE_ROOT/pages/admin.md" 'id="zaps-received-list"' 'zaps admin page includes a received zaps table host'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'function renderReceivedZaps' 'zaps admin renders received zap receipts'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'No signed zaps received yet.' 'zaps admin shows an empty-state for received zaps'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "Object.assign({ cache: 'no-store' }, options || {})" 'nav-auth fetch default no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "fetch('/cgi/blog-get-nostr-page', {" 'nav-auth prefetch call exists'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "fetch('/cgi/ssh-auth-check-session?session_token=' + encodeURIComponent(token), { cache: 'no-store' })" 'nav-auth check-session no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "fetch('/cgi/blog-list-navbar-pages', { cache: 'no-store' })" 'nav-auth navbar no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "fetch('/cgi/blog-get-config', { cache: 'no-store' })" 'nav-auth config no-store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'readBootstrapNavbarPages' 'nav-auth can hydrate navbar from static bootstrap'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'readBootstrapConfig' 'nav-auth can hydrate config from static bootstrap'

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
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'blog_nostr_footer_pages_json() {' 'shared footer json helper exists'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'show_in_footer' 'Nostr page config preserves footer visibility'
assert_file_contains "$ROOT_DIR/cgi/blog-public-ranking-common.sh" 'blog_nostr_public_ranking_latest_event_json() {' 'public ranking latest selector function exists'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_public_posts_catalog_build_json() {' 'shared public post catalog builder exists'
assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'blog_public_posts_catalog_write_artifacts() {' 'shared public post catalog writer exists'
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
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'image_url' 'list state supports image_url fields'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'description: (flex_description(.))' 'list state supports per-entry tile description fields'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'show_marker_filters' 'list state supports show_marker_filters toggle'
assert_file_contains "$ROOT_DIR/cgi/blog-save-nostr-page-draft" 'show_marker_filters=$(blog_param show_marker_filters)' 'save-draft endpoint accepts show_marker_filters setting'
assert_file_not_contains "$ROOT_DIR/cgi/blog-save-nostr-page-draft" 'blog_param extras_after_format' 'save-draft endpoint no longer accepts after-content format selector input'
assert_file_contains "$ROOT_DIR/cgi/blog-save-nostr-page-draft" "extras_after_format='markdown'" 'save-draft endpoint forces after-content format to markdown'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'extras_after_format: "markdown"' 'nip23/contact normalization forces after-content format to markdown'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'extras_after_format: "markdown"' 'list normalization forces after-content format to markdown'
assert_file_contains "$ROOT_DIR/cgi/blog-public-ranking-common.sh" 'extras_after_format: "markdown"' 'public ranking normalization forces after-content format to markdown'
assert_file_contains "$ROOT_DIR/cgi/blog-get-nostr-page" 'extras_after_format: "markdown"' 'page payload projection forces after-content format to markdown'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-inline-field="image_url"' 'list inline editor supports image_url cell editing'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "root && root.id === 'icon-gallery-root'" 'image URL editing gate keys off icon-gallery shell identity'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-inline-field="marker"' 'list inline editor supports marker cell editing'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-show-marker-filters="true"' 'list editor exposes show marker filters checkbox'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'class="list-marker-filter-setting"><span>Show marker filters</span><input type="checkbox" data-list-show-marker-filters="true"' 'list edit toolbar exposes show marker filters checkbox in settings row'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-marker-filter-action="toggle"' 'list read mode renders marker filter pills'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-list-view-mode="tile"' 'product gallery read mode renders tile/list selector pill'
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
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "var defaultMarker = slug === 'list' ? 'list' : '';" 'new list entries default marker only on list page'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'data-inline-field="description"' 'list inline editor supports description cell editing'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" 'markdownText ? escapeHtml(markdownText) : placeholderHtml' 'list edit-mode text column renders plain text without markdown link hover behavior'
assert_file_contains "$SITE_SOURCE_ROOT/static/list-page.js" "target.closest('[data-inline-field], input, textarea, select, [contenteditable=\"\"], [contenteditable=\"true\"]')" 'list inline editor outside-click close ignores active form controls so marker text is selectable'
assert_file_contains "$SITE_SOURCE_ROOT/pages/index.md" 'data-page-slug="index"' 'index shell includes explicit source slug marker for sync'
assert_file_contains "$SITE_SOURCE_ROOT/pages/list.md" 'data-page-type="list"' 'list source page shell marks list type'
assert_file_contains "$SITE_SOURCE_ROOT/pages/list.md" 'data-page-type="list"' 'list source page shell marks list type'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-tile-description {' 'tile view renders tiny description style'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'max-width: min(1820px, calc(100vw - 0.75rem));' 'list page edit-mode body width cap expanded for full table fit'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'width: fit-content;' 'list page shell can grow to fit edit table width'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'max-width: min(1780px, calc(100vw - 1rem));' 'list page shell edit-mode max width expanded'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'margin: 1.25rem auto 2.4rem;' 'list page shell stays centered while edit-mode width animates'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.list-page-shell {' 'list shell block exists for shared inline-grid variable definitions'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'Floating public surfaces: depth replaces thin framing lines.' 'public theme uses floating surface shadows instead of thin island borders'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'nav.site-nav {' 'floating surface override targets navbar'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-bottom: 0 !important;' 'floating navbar removes the thin bottom border'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.nav-search:focus-within' 'floating search box keeps focus visible without a thin outline border'
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
assert_file_contains "$SITE_SOURCE_ROOT/includes/footer.md" 'id="footer-pages"' 'footer includes dynamic page list mount'
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
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-modal-message:not(:empty)' 'Sign-in modal message only appears when it has toast content'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-left-width: 0.34rem;' 'Sign-in modal message is styled as a toast banner'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-modal-message.is-plain' 'Sign-in modal supports plain helper messages'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-left-width: 1px;' 'Plain sign-in helper message avoids thick toast left border'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "setAuthMessage('Browser signer login creates your account automatically on first successful sign-in.', 'plain');" 'Browser signer helper uses plain message styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'justify-self: center;' 'Phone signer QR is centered in the sign-in panel'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '0 18px 38px rgba(15, 23, 42, 0.14)' 'Phone signer QR has a deliberate card treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-primary-btn:disabled' 'Sign-in modal buttons use plain disabled styling'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" '#main-content .auth-primary-btn:hover:not(:disabled)' 'Sign-in modal buttons are not forced into lapis hover styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'insertBefore(node, chooser)' 'Sign-in modal fallback message is inserted above the signer choices'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-platform-grid' 'Sign-in modal uses guided platform choices instead of tabs'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<span class="auth-platform-copy"><strong>Desktop</strong></span>' 'Sign-in modal desktop platform button has no subtitle'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<span class="auth-platform-copy"><strong>Android</strong></span>' 'Sign-in modal Android platform button has no subtitle'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<span class="auth-platform-copy"><strong>iPhone/iPad</strong></span>' 'Sign-in modal iOS platform button has no subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Firefox signer' 'Sign-in modal removes desktop platform subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Amber signer' 'Sign-in modal removes Android platform subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Safari signer' 'Sign-in modal removes iOS platform subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Nostr Connect</span>' 'Sign-in modal removes remote signer platform subtitle'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'For Zaps:' 'Sign-in modal has a dedicated zap onboarding section'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Recommendations Updated April 2026' 'Zap onboarding recommendations show freshness date'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Self-Sovereign' 'Zap onboarding offers a self-sovereign mode'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Quick &amp; Easy' 'Zap onboarding offers a quick easy mode'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function zapOnboardingRecommendation' 'Zap onboarding recommendations update by selected platform'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Amethyst' 'Android zap onboarding recommends Amethyst'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'ZEUS' 'Zap onboarding recommends ZEUS for self-custodial Lightning'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "label: 'F-Droid'" 'Android zap onboarding links F-Droid'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "label: 'Aurora'" 'Android zap onboarding links Aurora Store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "var fDroidStore = { label: 'F-Droid', url: 'https://f-droid.org/' }" 'Zap onboarding F-Droid labels link to the F-Droid store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "var auroraStore = { label: 'Aurora', url: 'https://f-droid.org/packages/com.aurora.store/' }" 'Zap onboarding Aurora labels link to the Aurora Store download'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://github.com/vitorpamplona/amethyst#installation' 'Amethyst app link points to its official installation page'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://github.com/ZeusLN/zeus#app-store-links' 'ZEUS app link points to its official app store links'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://primal.net/downloads' 'Primal app link points to its official downloads page'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "label: 'Play'" 'Android zap onboarding links Play Store as secondary source'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://apps.apple.com/us/app/damus/id1628663131' 'Damus App Store link points to its app listing'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://nostur.com/appstore' 'Nostur App Store link points to its app listing'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'auth-zap-app-link' 'Zap onboarding renders compact linked app chips'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'https://f-droid.org/packages/com.aurora.store/' 'Zap onboarding links Aurora Store'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Wallet of Satoshi' 'Quick easy zap onboarding includes a mainstream custodial wallet option'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Primal' 'Quick easy zap onboarding includes a mainstream Nostr app option'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Nsec.app' 'Quick easy remote signer onboarding includes a concrete remote signer app'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'not maximum sovereignty' 'Quick easy zap onboarding labels the sovereignty tradeoff'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Back up the seed' 'Zap onboarding avoids long wallet setup notes'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-zap-onboarding' 'Zap onboarding section has deliberate modal styling'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-zap-app-icon' 'Zap onboarding app chips include app-style icons'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-zap-mode-btn.is-active' 'Zap onboarding mode buttons show the selected path'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.auth-zap-mode-btn:not(.is-active):hover' 'Zap onboarding mode hover excludes the selected mode'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'cursor: default;' 'Selected zap onboarding mode button uses default cursor'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-phone-reco' 'phone signer recommendations are not repeated below the panel actions'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Continue with browser signer' 'Browser signer action avoids special register wording'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'You can change your username after you log in.' 'Sign-in modal defers username choice until after login'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-register-username' 'Sign-in modal does not ask for a username during first login'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'authRegisterUsername' 'Browser signer login does not read a username hint'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Usernames must be unique.' 'Sign-in modal avoids username uniqueness friction during login'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" '<span class="auth-platform-copy"><strong>Manual</strong></span>' 'Manual challenge fallback platform button has no subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Challenge JSON</span>' 'Sign-in modal removes manual platform subtitle'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Register with browser signer' 'Browser signer path no longer uses special register wording'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Signed challenge</button>' 'Manual fallback avoids cryptic signed challenge tab wording'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function isMobileLikeRuntime()' 'login flow detects mobile-like browsers before choosing a signer path'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "return 'phone';" 'primary login uses phone signer tab when no browser signer is available'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function startPrimaryLogin()' 'nav login button uses a capability-aware primary login flow'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'No desktop signer detected' 'login errors use signer-neutral wording'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'Desktop signer login failed' 'login fallback errors avoid desktop-only wording'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Your account identity is your Nostr public key.' 'Sign-in modal includes concise Nostr identity guidance'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Browser sign-in uses a NIP-07 extension' 'Sign-in modal explains browser signer path'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'Phone sign-in uses NIP-46 pairing via QR/deep link' 'Sign-in modal explains phone signer path'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'nostr-info-modal' 'Learn about Nostr sign-in no longer uses a separate modal'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'showInfoModal' 'Learn about Nostr sign-in no longer opens a separate info modal'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "showAuthModal('register');" 'Learn about Nostr sign-in opens the main sign-in modal'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'nav-auth.js?v=20260430-signin-learn1' 'nav auth script URL is cache-busted after sign-in learn modal integration'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'zap-ui.js?v=20260429-zap-signer1' 'zap UI script URL is cache-busted after phone signer wording fix'
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
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function resetPhonePairingLink()' 'Nostr Connect can generate a fresh phone signer link when a stale app link stops working'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-phone-connect-btn' 'phone signer panel does not show redundant QR connect button'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'navigator.clipboard.writeText(uri)' 'Nostr Connect link can be copied for manual signer import'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'signerPubkey: normalizePubkeyHex(state.nip46.signerPubkey' 'Nostr Connect stores the transport pubkey for later zap signing'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'accountPubkey: normalizePubkeyHex(state.nip46.accountPubkey' 'Nostr Connect stores the account pubkey separately from the transport key'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function getNip46AccountPubkey()' 'shared zap signer asks the phone signer for the actual account pubkey'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "signer.method === 'nip46'" 'shared signer status treats restored phone signer pairing as available without forcing a fresh QR'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-diagnostics' 'phone signer panel shows visible Nostr Connect pairing diagnostics'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-amber-open' 'phone signer panel avoids app-specific fallback links'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-copy' 'phone signer panel includes copy link fallback'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-icon-copy-btn' 'phone signer copy fallback is icon-only'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" '>Copy link<' 'phone signer copy fallback avoids text button chrome'
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-uri-copy' 'phone signer URI box includes one-click copy button'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'auth-nip46-reset' 'phone signer panel omits fresh-link recovery from primary onboarding'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'function copyNip46Uri()' 'phone signer copy controls share one copy helper'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'els.authNip46Open.textContent = uri' 'phone signer open link shows the actual Nostr Connect URI'
assert_file_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" 'Connect a phone signer with the phone signer link' 'zap signer prompt is app-neutral'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/zap-ui.js" 'Connect Amber with the phone signer link' 'zap signer prompt does not make generic phone signer flow Amber-specific'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'id="auth-nip46-open" class="auth-inline-link" href="#" target="_blank"' 'Nostr Connect link avoids target blank so Android can open Amber reliably'
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" 'setNip46Diagnostics' 'phone signer flow reports relay/decrypt/pairing status'
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
assert_file_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'aria-label="User menu">⋮</button>' 'account menu source uses vertical dots'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/nav.md" 'aria-label="User menu">⋯</button>' 'account menu source does not use horizontal dots'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.nav-user-menu > .nav-menu-btn::before' 'account menu renders vertical dots with CSS'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.post-page-menu-trigger::before' 'post overflow menu renders vertical dots with CSS'
assert_file_contains "$SITE_SOURCE_ROOT/static/post-context.js" "document.addEventListener('pointerup'" 'post overflow menu has an explicit mobile pointer activation path'
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
zaps_enabled=false
zap_lud16=
zap_default_amount_sats=1000
EOF_SITE_CONF
printf '%s\n' 'wss://relay.example.com' > "$blog_nostr_relays_file"
blog_get_config_out=$(REQUEST_METHOD=GET CONTENT_LENGTH=0 "$ROOT_DIR/cgi/blog-get-config")
assert_contains "$blog_get_config_out" '"site_title":"Fixture Site"' 'blog-get-config returns parsed site title'
assert_contains "$blog_get_config_out" '"theme":"lapidarist"' 'blog-get-config returns parsed theme'
assert_contains "$blog_get_config_out" '"plugins":{"nostr_support":true,"nostr_login":true,"nostr_bridge":true,"nostr_posts":true,"zaps":true,"btcpay":true,"video_chat":false}' 'blog-get-config returns normalized plugins json'
assert_contains "$blog_get_config_out" '"nostr_relays":["wss://relay.example.com"]' 'blog-get-config returns relay list json'

# 10) Broader static checks to guard accidental cache regression in targeted fetches.
assert_file_contains "$SITE_SOURCE_ROOT/static/nav-auth.js" "cache: 'no-store'" 'nav-auth has no-store directives'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" "cache: 'no-store'" 'admin has no-store directives'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "cache: 'no-store'" 'blog-page has no-store directives'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "data-compose-action=\"delete\"" 'in-blog compose exposes delete-draft trash action'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "apiPost('/cgi/blog-delete-draft'" 'in-blog compose can delete local draft via delete endpoint'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" "class=\"field-row blog-compose-title-row\"" 'in-blog compose puts preview control on title row without separate New post heading'
assert_file_contains "$SITE_SOURCE_ROOT/static/blog-page.js" '(postSummary ? '\''<p class="post-summary">'\'' + markdownInline(postSummary) + '\''</p>'\'' : '\'''\'')' 'blog index renders post summaries as inline markdown'
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
assert_success sh -n "$ROOT_DIR/tests-content-sync-regressions.sh"
assert_success sh -n "$ROOT_DIR/tests-payments-runtime.sh"

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
if rg -q 'is-switch-animating|admin-fade-in' "$SITE_SOURCE_ROOT/pages/admin.md" "$SITE_SOURCE_ROOT/static/admin.js"; then
  fail 'admin section switch animation hooks should not exist'
else
  pass
fi
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
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-relay.conf" 'site=nostr-blog' 'Stonr support file locks the relay to nostr-blog'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-relay.conf" 'relay_domain=andersaamodt.com' 'Stonr support file pins the canonical relay domain'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-relay.conf" 'mode=site_mirror' 'Stonr support file declares conservative site mirror mode'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-relay.conf" 'public_write=false' 'Stonr support file keeps public relay writes disabled'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-relay.conf" 'write_kinds=24133' 'Stonr support file allows only NIP-46 pairing writes for phone signers'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-nostr-blog.yaml" 'name: nostr-blog' 'Stonr app support profile names nostr-blog'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-nostr-blog.yaml" 'ENABLE_LIVE_SUBSCRIPTIONS: true' 'Stonr app support profile enables live Nostr subscriptions'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-nostr-blog.yaml" 'ENABLE_MIRRORING: true' 'Stonr app support profile enables site mirroring'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-nostr-blog.yaml" 'ALLOW_KINDS:' 'Stonr app support profile constrains public write kinds'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-nostr-blog.yaml" '    - 24133' 'Stonr app support profile allows NIP-46 pairing writes'
assert_file_contains "$ROOT_DIR/.headquarters/site-support/stonr-nostr-blog.yaml" 'ENABLE_FILE_API: false' 'Stonr app support profile keeps file APIs disabled'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr.sh" 'b020dc1e1b1799910f329f531b60a5d2b714ea41' 'Stonr installer pins the publish-capable Stonr build'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr.sh" 'headquarters-commit' 'Stonr installer records the installed pinned commit'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr.sh" 'cargo build -j "$CARGO_BUILD_JOBS" -p stonr' 'Stonr installer uses a low-memory build profile for the legacy blog VPS'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'HQ_UPLOADED_TREE_PATH-}/.headquarters/site-support/stonr-relay.conf' 'Stonr provisioner reads the uploaded site support policy'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-stonr-relay.sh" 'HQ_UPLOADED_TREE_PATH-}/.headquarters/site-support/stonr-nostr-blog.yaml' 'Stonr provisioner reads the uploaded app support profile'
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
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" "escapeHtml(open ? 'Close' : 'New entry')" 'public ranking submit toggle uses New entry text instead of symbol-only trigger'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'data-ranking-action="toggle-submit-advanced"' 'public ranking submit composer includes advanced toggle'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'id="public-ranking-submit-type-advanced"' 'public ranking admin advanced panel includes entry type selector'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'id="public-ranking-submit-parent-advanced"' 'public ranking admin advanced panel includes parent selector'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" '<select id="public-ranking-submit-type"' 'public ranking base composer omits entry/group dropdown'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" '<span>Body</span><textarea id="public-ranking-submit-content" rows="4" placeholder="Optional body"></textarea>' 'public ranking submit composer labels body field correctly'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'var canConfigureHierarchy = !!(isAdmin() && state.editMode);' 'public ranking hierarchy controls stay admin edit-only in advanced mode'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.public-ranking-submit-inline .public-ranking-submit-add {' 'public ranking submit add button uses compact size override'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-public-ranking-node" 'submitter_pubkey=${BLOG_SESSION_USER_PUBKEY-}' 'public ranking submission falls back to session pubkey identity'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-public-ranking-node" 'if [ "$is_admin" = "true" ]; then' 'public ranking submission allows admin local fallback when signer key is unavailable'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-public-ranking-node" 'local_event_id="local-' 'public ranking admin fallback creates local unsigned event id'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-public-ranking-node" '{id:$id,pubkey:$pubkey,kind:$kind,created_at:$created_at,tags:$tags,content:$content,sig:""}' 'public ranking admin fallback stores unsigned local node payload'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" 'apiPostFirstAvailable([' 'public ranking submit uses endpoint fallback helper'
assert_file_contains "$SITE_SOURCE_ROOT/static/public-ranking-page.js" "'/cgi/blog-submit-public-ranking'" 'public ranking submit includes compatibility endpoint fallback'
assert_file_contains "$ROOT_DIR/cgi/blog-submit-public-ranking" 'exec "$SCRIPT_DIR/blog-submit-public-ranking-node"' 'public ranking compatibility endpoint delegates to node submit handler'
assert_success test -x "$ROOT_DIR/cgi/blog-submit-public-ranking"
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'data-users-sort="name"' 'users header exposes sortable Name control'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'data-users-sort="created"' 'users header exposes sortable Created control'
assert_file_contains "$SITE_SOURCE_ROOT/static/admin.js" 'data-users-sort="role"' 'users header exposes sortable Role control'
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
