#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)

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
assert_file_contains "$ROOT_DIR/cgi/blog-save-nostr-pages" 'blog_nostr_pages_sync_source_pages "$normalized"' 'save-nostr-pages refreshes source mounts'
assert_file_contains "$ROOT_DIR/cgi/blog-save-nostr-pages" 'blog_run_build_async' 'save-nostr-pages triggers rebuild'
assert_file_contains "$ROOT_DIR/cgi/blog-update-nostr-page-nav-title" 'blog_nostr_pages_sync_source_pages "$normalized"' 'nav-title update refreshes source mounts'
assert_file_contains "$ROOT_DIR/cgi/blog-update-nostr-page-nav-title" 'blog_run_build_async' 'nav-title update triggers rebuild'
assert_file_contains "$ROOT_DIR/cgi/blog-list-navbar-pages" 'blog_run_build_async' 'navbar page maintenance triggers rebuild when config normalizes'

# 3) Frontend fetches must opt out of HTTP caches.
assert_file_contains "$ROOT_DIR/static/contact-page.js" "cache: 'no-store'" 'contact api no-store'
assert_file_contains "$ROOT_DIR/static/nip23-page.js" "cache: 'no-store'" 'nip23 api no-store'
assert_file_contains "$ROOT_DIR/static/public-ranking-page.js" "cache: 'no-store'" 'public ranking api no-store'
assert_file_contains "$ROOT_DIR/static/oeuvre.js" "cache: 'no-store'" 'oeuvre api no-store'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "cache: 'no-store'" 'blog page no-store present'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "fetch('/cgi/blog-list-public-posts', { credentials: 'same-origin', cache: 'no-store' })" 'blog posts fetch no-store'
assert_file_contains "$ROOT_DIR/static/admin.js" "Object.assign({ cache: 'no-store' }, options || {})" 'admin fetch default no-store'
assert_file_contains "$ROOT_DIR/static/nav-auth.js" "Object.assign({ cache: 'no-store' }, options || {})" 'nav-auth fetch default no-store'
assert_file_contains "$ROOT_DIR/static/nav-auth.js" "fetch('/cgi/blog-get-nostr-page', {" 'nav-auth prefetch call exists'
assert_file_contains "$ROOT_DIR/static/nav-auth.js" "fetch('/cgi/ssh-auth-check-session?session_token=' + encodeURIComponent(token), { cache: 'no-store' })" 'nav-auth check-session no-store'
assert_file_contains "$ROOT_DIR/static/nav-auth.js" "fetch('/cgi/blog-list-navbar-pages', { cache: 'no-store' })" 'nav-auth navbar no-store'
assert_file_contains "$ROOT_DIR/static/nav-auth.js" "fetch('/cgi/blog-get-config', { cache: 'no-store' })" 'nav-auth config no-store'

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

write_event "$KEY_A" 30004 "$ID_5" 2100 '[["d","oeuvre"],["title","Old Oeuvre"]]' 'old oeuvre'
write_event "$KEY_B" 30004 "$ID_6" 2200 '[["d","oeuvre"],["title","New Oeuvre"]]' 'new oeuvre'
list_latest=$(blog_nostr_list_latest_event_json 'oeuvre')
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
assert_file_contains "$ROOT_DIR/cgi/blog-public-ranking-common.sh" 'blog_nostr_public_ranking_latest_event_json() {' 'public ranking latest selector function exists'
assert_file_contains "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" 'icon-gallery' 'icon-gallery page type plumbing exists'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'image_url' 'list state supports image_url fields'
assert_file_contains "$ROOT_DIR/cgi/blog-list-common.sh" 'description: (flex_description(.))' 'list state supports per-entry tile description fields'
assert_file_contains "$ROOT_DIR/static/oeuvre.js" 'data-inline-field="image_url"' 'oeuvre inline editor supports image_url cell editing'
assert_file_contains "$ROOT_DIR/static/oeuvre.js" 'data-inline-field="description"' 'oeuvre inline editor supports description cell editing'
assert_file_contains "$ROOT_DIR/static/style.css" '.list-tile-description {' 'tile view renders tiny description style'
assert_file_contains "$ROOT_DIR/pages/admin.md" '<option value="icon-gallery">Icon Gallery (kind 30004)</option>' 'admin create-page dialog exposes icon-gallery type'
assert_file_contains "$ROOT_DIR/cgi/blog-autofill-list-macos-icons" 'Auto-fill missing list entry image URLs using local macOS app icons.' 'macOS icon autofill endpoint exists'

# 9) Broader static checks to guard accidental cache regression in targeted fetches.
assert_file_contains "$ROOT_DIR/static/nav-auth.js" "cache: 'no-store'" 'nav-auth has no-store directives'
assert_file_contains "$ROOT_DIR/static/admin.js" "cache: 'no-store'" 'admin has no-store directives'
assert_file_contains "$ROOT_DIR/static/blog-page.js" "cache: 'no-store'" 'blog-page has no-store directives'
assert_file_contains "$ROOT_DIR/static/contact-page.js" "cache: 'no-store'" 'contact-page has no-store directives'
assert_file_contains "$ROOT_DIR/static/nip23-page.js" "cache: 'no-store'" 'nip23-page has no-store directives'
assert_file_contains "$ROOT_DIR/static/public-ranking-page.js" "cache: 'no-store'" 'public-ranking-page has no-store directives'
assert_file_contains "$ROOT_DIR/static/oeuvre.js" "cache: 'no-store'" 'oeuvre has no-store directives'

# 10) Ensure scripts are syntactically valid after changes.
assert_success sh -n "$ROOT_DIR/cgi/blog-lib.sh"
assert_success sh -n "$ROOT_DIR/cgi/blog-nostr-pages-common.sh"
assert_success sh -n "$ROOT_DIR/cgi/blog-public-ranking-common.sh"
assert_success sh -n "$ROOT_DIR/cgi/blog-publish-nostr-page"
assert_success sh -n "$ROOT_DIR/cgi/blog-publish-list-page"
assert_success sh -n "$ROOT_DIR/cgi/blog-autofill-list-macos-icons"
assert_success sh -n "$ROOT_DIR/tests-content-sync-regressions.sh"

# 11) Managed source-page sync invariants (unit layer).
sync_cfg=$(jq -cn '{pages:[
  {slug:"about", type:"nip23", show_in_nav:true},
  {slug:"contact", type:"contact", show_in_nav:true},
  {slug:"oeuvre", type:"list", show_in_nav:true},
  {slug:"assignments", type:"public-ranking", show_in_nav:false}
]}')
blog_nostr_pages_save_json "$sync_cfg"
blog_nostr_pages_sync_source_pages "$sync_cfg"

about_mount=$(blog_nostr_page_mount_path 'about')
contact_mount=$(blog_nostr_page_mount_path 'contact')
oeuvre_mount=$(blog_nostr_page_mount_path 'oeuvre')
ranking_mount=$(blog_nostr_page_mount_path 'assignments')

assert_success test -f "$about_mount"
assert_success test -f "$contact_mount"
assert_success test -f "$oeuvre_mount"
assert_success test -f "$ranking_mount"
assert_file_contains "$about_mount" 'id="nip23-page-title"' 'nip23 mount keeps expected template markers'
assert_file_contains "$contact_mount" 'id="contact-page-title"' 'contact mount keeps expected template markers'
assert_file_contains "$oeuvre_mount" 'id="list-page-title"' 'list mount keeps expected template markers'
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

# 12) Rebuild trigger invariant for navbar page listing (integration layer).
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
assert_contains "$navbar_out" '"success":true' 'navbar listing still returns success when build queueing'
if wait_for_file "$build_marker" 60; then
  pass
else
  fail 'navbar listing triggers async build when mounted html is missing'
fi

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

# 13) UI invariant for Nostr nav icon gutter alignment rule.
assert_file_contains "$ROOT_DIR/pages/admin.md" '[data-admin-nav="nostr-bridge"] .admin-nav-icon-slot' 'nostr nav icon uses dedicated gutter alignment rule'
assert_file_contains "$ROOT_DIR/pages/admin.md" '#admin-panel.sidebar-collapsed .admin-content {' 'collapsed admin keeps a left gutter for reveal icon'
assert_file_contains "$ROOT_DIR/static/admin.js" 'section.hidden = !active;' 'admin section toggling remains direct visibility toggle'
if rg -q 'is-switch-animating|admin-fade-in' "$ROOT_DIR/pages/admin.md" "$ROOT_DIR/static/admin.js"; then
  fail 'admin section switch animation hooks should not exist'
else
  pass
fi
assert_file_contains "$ROOT_DIR/pages/admin.md" '#admin-panel #posts-list > .placeholder.table-empty {' 'posts empty-state placeholder remains centered'

TOTAL=$((PASS_COUNT + FAIL_COUNT))
printf 'Assertions: %s\n' "$TOTAL"
printf 'Passed: %s\n' "$PASS_COUNT"
printf 'Failed: %s\n' "$FAIL_COUNT"

if [ "$FAIL_COUNT" -ne 0 ]; then
  exit 1
fi

printf 'ok\n'
