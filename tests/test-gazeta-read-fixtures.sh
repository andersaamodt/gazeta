#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
THEURGY_REPLAY=${THEURGY_REPLAY:-$HOME/git/theurgy/spells/replay-theurgy-cgi-fixture}
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-read-fixtures.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

[ -x "$THEURGY_REPLAY" ] || {
  printf '%s\n' "FAIL: replay spell is not executable: $THEURGY_REPLAY" >&2
  exit 1
}

export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export HOME="$TMP_ROOT/home"
export XDG_STATE_HOME="$TMP_ROOT/xdg-state"
export WIZARDRY_SITES_DIR="$HOME/git/sites"
export WIZARDRY_SITE_NAME="example.test"

SITE_ROOT="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
SITE_DATA="$XDG_STATE_HOME/gazeta/sites-data/$WIZARDRY_SITE_NAME"
GENERATED_ROOT="$XDG_STATE_HOME/gazeta/generated/$WIZARDRY_SITE_NAME"
POSTS_STORE="$SITE_DATA/content/posts"

mkdir -p "$SITE_ROOT/site/pages" "$SITE_ROOT/site/static" "$POSTS_STORE"
ln -s "$POSTS_STORE" "$SITE_ROOT/site/pages/posts"

cat > "$POSTS_STORE/replay-post.md" <<'POST'
---
title: "Replay Post"
visibility: "public"
published_at: "2026-06-11T12:00:00Z"
---

Replay body.
POST

/bin/sh "$ROOT_DIR/cgi/blog-maintenance" rebuild-public-posts >/dev/null

fixture="$SCRIPT_DIR/fixtures/theurgy-cgi/list-public-posts"
payload=$(GAZETA_THEURGY_ALLOW_CARGO=1 "$THEURGY_REPLAY" "$fixture" -- /bin/sh "$ROOT_DIR/cgi/blog-list-public-posts")
json_payload=$(printf '%s\n' "$payload" | sed -n '/^{/,$p')

printf '%s\n' "$json_payload" | jq -e '.success == true' >/dev/null
printf '%s\n' "$json_payload" | jq -e '.posts[0].title == "Replay Post"' >/dev/null
[ -f "$SITE_DATA/public-posts-cache.json" ]

mkdir -p "$GENERATED_ROOT/static"

cat > "$GENERATED_ROOT/static/navbar-pages.json" <<'JSON'
{"success":true,"pages":[{"slug":"replay","title":"Replay","path":"/replay","type":"list","kind":30004}]}
JSON

cat > "$SITE_DATA/navbar-pages-cache.json" <<'JSON'
{"success":true,"pages":[{"slug":"stale-cache","title":"Stale Cache","path":"/stale-cache","type":"list","kind":30004}]}
JSON

navbar_fixture="$SCRIPT_DIR/fixtures/theurgy-cgi/list-navbar-pages"
navbar_payload=$(GAZETA_THEURGY_ALLOW_CARGO=1 "$THEURGY_REPLAY" "$navbar_fixture" -- /bin/sh "$ROOT_DIR/cgi/blog-list-navbar-pages")
navbar_json=$(printf '%s\n' "$navbar_payload" | sed -n '/^{/,$p')

printf '%s\n' "$navbar_json" | jq -e '.success == true' >/dev/null
printf '%s\n' "$navbar_json" | jq -e '.pages[0].slug == "replay" and .pages[0].title == "Replay"' >/dev/null

rm -f "$GENERATED_ROOT/static/public-posts.json" "$SITE_DATA/public-posts-cache.json"
missing_posts_payload=$(GAZETA_THEURGY_ALLOW_CARGO=1 "$THEURGY_REPLAY" "$fixture" -- /bin/sh "$ROOT_DIR/cgi/blog-list-public-posts")
missing_posts_json=$(printf '%s\n' "$missing_posts_payload" | sed -n '/^{/,$p')
printf '%s\n' "$missing_posts_json" | jq -e '.success == false and .code == "catalog_missing"' >/dev/null
[ ! -f "$GENERATED_ROOT/static/public-posts.json" ]
[ ! -f "$SITE_DATA/public-posts-cache.json" ]

rm -f "$GENERATED_ROOT/static/search-index.json" "$SITE_DATA/search-index-cache.json"
search_missing_fixture="$SCRIPT_DIR/fixtures/theurgy-cgi/blog-search"
search_missing_payload=$(GAZETA_THEURGY_ALLOW_CARGO=1 "$THEURGY_REPLAY" "$search_missing_fixture" -- env QUERY_STRING='q=fixture' /bin/sh "$ROOT_DIR/cgi/blog-search")
search_missing_json=$(printf '%s\n' "$search_missing_payload" | sed -n '/^{/,$p')
printf '%s\n' "$search_missing_json" | jq -e '.success == false and .code == "search_index_missing"' >/dev/null
[ ! -f "$GENERATED_ROOT/static/search-index.json" ]
[ ! -f "$SITE_DATA/search-index-cache.json" ]

now=$(date +%s)
cat > "$SITE_DATA/btc-usd-rate.json" <<JSON
{"success":true,"btc_usd":64000.25,"currency":"USD","source":"coinbase","stale":false,"fetched_at":$now}
JSON

btc_fixture="$SCRIPT_DIR/fixtures/theurgy-cgi/btc-usd-rate"
btc_payload=$(GAZETA_THEURGY_ALLOW_CARGO=1 "$THEURGY_REPLAY" "$btc_fixture" -- /bin/sh "$ROOT_DIR/cgi/blog-btc-usd-rate")
btc_json=$(printf '%s\n' "$btc_payload" | sed -n '/^{/,$p')

printf '%s\n' "$btc_json" | jq -e '.success == true' >/dev/null
printf '%s\n' "$btc_json" | jq -e '.btc_usd == 64000.25 and .currency == "USD" and .stale == false' >/dev/null

cat > "$GENERATED_ROOT/static/public-posts.json" <<'JSON'
{"success":true,"posts":[{"url":"/posts/replay-post","title":"Replay Post","author":"Replay Author","reading_minutes":2,"published_timestamp":"June 11, 2026 at 12:00 PM UTC","pub_date":"2026-06-11","comment_count":3,"summary":"Read [the replay](https://example.com/replay).","summary_truncated":true,"type":"post","tags":["test","replay"]},{"url":"/posts/link-post","title":"Useful linked page","author":"Link Curator","reading_minutes":1,"published_timestamp":"June 10, 2026 at 9:00 AM UTC","pub_date":"2026-06-10","comment_count":0,"summary":"[Useful linked page](https://links.example.com/articles/2026/06/path?with=query#final-section)","link_url":"https://links.example.com/articles/2026/06/path?with=query#final-section","summary_truncated":false,"type":"link-share","tags":["links"]}]}
JSON

index_fixture="$SCRIPT_DIR/fixtures/theurgy-cgi/blog-index"
index_payload=$(GAZETA_THEURGY_ALLOW_CARGO=1 "$THEURGY_REPLAY" "$index_fixture" -- /bin/sh "$ROOT_DIR/cgi/blog-index")

printf '%s\n' "$index_payload" | grep '<div class="post-list">' >/dev/null
printf '%s\n' "$index_payload" | grep '<span class="post-offsite-link-kind">Off-site link</span><span>Linked by Link Curator</span>' >/dev/null
printf '%s\n' "$index_payload" | grep '<a href="https://links.example.com/articles/2026/06/path?with=query#final-section">Useful linked page</a>' >/dev/null
printf '%s\n' "$index_payload" | grep '>Read more...</a>' >/dev/null

archive_fixture="$SCRIPT_DIR/fixtures/theurgy-cgi/blog-archive"
archive_payload=$(GAZETA_THEURGY_ALLOW_CARGO=1 "$THEURGY_REPLAY" "$archive_fixture" -- /bin/sh "$ROOT_DIR/cgi/blog-archive")

printf '%s\n' "$archive_payload" | grep '<div class="archive-list">' >/dev/null
printf '%s\n' "$archive_payload" | grep '<section class="archive-month" id="archive-2026-06">' >/dev/null
printf '%s\n' "$archive_payload" | grep '<a href="/posts/replay-post">Replay Post</a>' >/dev/null
printf '%s\n' "$archive_payload" | grep '<span class="post-comments-count">(3 comments)</span>' >/dev/null

tags_fixture="$SCRIPT_DIR/fixtures/theurgy-cgi/blog-tags"
tags_payload=$(GAZETA_THEURGY_ALLOW_CARGO=1 "$THEURGY_REPLAY" "$tags_fixture" -- /bin/sh "$ROOT_DIR/cgi/blog-tags")

printf '%s\n' "$tags_payload" | grep '<div class="tag-cloud">' >/dev/null
printf '%s\n' "$tags_payload" | grep 'data-tag="replay"' >/dev/null
printf '%s\n' "$tags_payload" | grep '<li class="tag-result-item" data-post-url="/posts/link-post" data-post-tags="links">' >/dev/null

cat > "$GENERATED_ROOT/static/search-index.json" <<'JSON'
{"success":true,"entries":[{"url":"/posts/replay-post","title":"Replay Post","pub_date":"2026-06-11","summary":"Replay summary","tags":["test","replay"],"comment_count":3,"search_text":"Replay Post\ntest,replay\nReplay summary\nReplay body with fixture keyword"},{"url":"/posts/link-post","title":"Useful linked page","pub_date":"2026-06-10","summary":"Useful link summary","tags":["links"],"comment_count":0,"search_text":"Useful linked page\nlinks\nUseful link summary\nOff-site article"}]}
JSON

search_fixture="$SCRIPT_DIR/fixtures/theurgy-cgi/blog-search"
search_payload=$(GAZETA_THEURGY_ALLOW_CARGO=1 "$THEURGY_REPLAY" "$search_fixture" -- /bin/sh "$ROOT_DIR/cgi/blog-search")

printf '%s\n' "$search_payload" | grep '<div class="search-form">' >/dev/null
printf '%s\n' "$search_payload" | grep 'Found 1 result(s) for <strong>fixture</strong>' >/dev/null
printf '%s\n' "$search_payload" | grep '<h3 class="post-title"><a href="/posts/replay-post">Replay Post</a></h3>' >/dev/null

printf '%s\n' 'gazeta read fixture tests passed'
