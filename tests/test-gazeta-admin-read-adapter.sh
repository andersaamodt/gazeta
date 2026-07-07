#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-admin-read-adapter.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export WIZARDRY_SITE_NAME="example.test"
SITE_ROOT="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
SITE_DATA="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"

mkdir -p \
  "$SITE_ROOT" \
  "$SITE_DATA/lists" \
  "$SITE_DATA/nostr/events/pubkey/30004" \
  "$SITE_DATA/nostr/events/pubkey/30023" \
  "$SITE_DATA/nostr/events/pubkey/30040" \
  "$SITE_DATA/nostr/events/pubkey/30041" \
  "$SITE_DATA/nostr/state" \
  "$SITE_DATA/origin/posts" \
  "$SITE_DATA/origin/state/example-post" \
  "$SITE_DATA/content/drafts" \
  "$SITE_DATA/content/page-states" \
  "$SITE_DATA/content/posts" \
  "$SITE_DATA/ssh-auth/sessions" \
  "$SITE_DATA/ssh-auth/users/admin" \
  "$SITE_DATA/ssh-auth/users/reader"

mkdir -p "$SITE_ROOT/site/pages"
ln -s "$SITE_DATA/content/posts" "$SITE_ROOT/site/pages/posts"

BIN_DIR="$TMP_ROOT/bin"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/config-get" <<'EOF'
#!/bin/sh
set -eu
file=${1-}
key=${2-}
[ -f "$file" ] || exit 1
line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)
[ -n "$line" ] || exit 1
printf '%s\n' "${line#*=}"
EOF
chmod +x "$BIN_DIR/config-get"
PATH="$BIN_DIR:$PATH"
export PATH

token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
csrf=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
reader_token=cccccccccccccccccccccccccccccccccccccccccccccccc
expires_at=$(( $(date +%s) + 3600 ))

cat > "$SITE_DATA/ssh-auth/users/admin/profile.conf" <<EOF
username=admin
player_name=Admin Person
is_admin=true
user_rank=2
nostr_pubkey=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
fingerprint=admin-fingerprint
created_at=2026-07-01T00:00:00Z
EOF

cat > "$SITE_DATA/ssh-auth/users/reader/profile.conf" <<EOF
username=reader
player_name=Reader Person
is_admin=false
user_rank=1
nostr_pubkey=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
fingerprint=reader-fingerprint
created_at=2026-07-02T00:00:00Z
EOF

cat > "$SITE_DATA/ssh-auth/sessions/$token.conf" <<EOF
username=admin
csrf_token=$csrf
expires_at=$expires_at
is_admin=false
EOF

cat > "$SITE_DATA/ssh-auth/sessions/$reader_token.conf" <<EOF
username=reader
csrf_token=$csrf
expires_at=$expires_at
is_admin=false
EOF

cat > "$SITE_DATA/lists/wizard-tools.json" <<'JSON'
{"title":"Wizard Tools"}
JSON

cat > "$SITE_DATA/nostr/events/pubkey/30004/old.json" <<'JSON'
{"id":"old","kind":30004,"created_at":100,"tags":[["d","public-favorites"],["title","Old Favorites"]]}
JSON

cat > "$SITE_DATA/nostr/events/pubkey/30004/new.json" <<'JSON'
{"id":"new","kind":30004,"created_at":200,"tags":[["d","public-favorites"],["title","Public Favorites"]]}
JSON

cat > "$SITE_DATA/nostr/events/pubkey/30023/blog.json" <<'JSON'
{"id":"blog","kind":30023,"pubkey":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","created_at":250,"content":"# Canonical blog","tags":[["d","blog"],["title","Canonical Blog"]]}
JSON

cat > "$SITE_DATA/nostr-pages.json" <<'JSON'
{"pages":[
  {"slug":"blog","type":"blog"},
  {"slug":"Configured List","type":"list"}
]}
JSON

printf '%s\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' > "$SITE_DATA/nostr/state/authors"
printf '%s\n' 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' > "$SITE_DATA/nostr/state/blocklist"

cat > "$SITE_DATA/content/drafts/example-draft.md" <<'EOF'
---
draft_id: "example-draft"
title: "Example Draft"
tags: "wizardry"
summary: "Draft summary"
post_type: "longform"
publish_mode: "draft"
status: "draft"
created_at: "2026-07-06T00:00:00Z"
updated_at: "2026-07-06T00:00:00Z"
origin_platforms: ["telegram"]
---

Draft body.
EOF

cat > "$SITE_DATA/content/drafts/queued-draft.md" <<'EOF'
---
draft_id: "queued-draft"
title: ""
tags: ""
summary: ""
post_type: "shortform"
publish_mode: "drip"
status: "queued"
created_at: "2026-07-05T12:00:00Z"
updated_at: "2026-07-05T12:00:00Z"
---

Queue body for drip publishing.
EOF

cat > "$SITE_ROOT/site.conf" <<'EOF'
origin_enabled_platforms=["bluesky","telegram"]
origin_default_platforms=["telegram"]
drip_interval_hours=2
drip_randomness_minutes=15
EOF

cat > "$SITE_DATA/content/posts/example-post.md" <<'EOF'
---
title: "Example Post"
tags: "writing, essays"
visibility: "public"
published_at: "2026-07-06T00:00:00Z"
publish_mode: "publish_now"
---

Published body.
EOF

cat > "$SITE_DATA/content/page-states/configured-list.md" <<'EOF'
---
title: "Configured Draft"
publish_intro_to_nostr: false
---
Draft list body.
EOF

cat > "$SITE_DATA/origin/posts/example-post.json" <<'EOF'
{"source_path":"posts/example-post.md","platforms":["telegram"],"updated_at":"2026-07-06T00:00:00Z"}
EOF

cat > "$SITE_DATA/origin/state/example-post/telegram.json" <<'EOF'
{"status":"published","remote_url":"https://t.me/example-post"}
EOF

cat > "$SITE_DATA/nostr/events/pubkey/30041/pending.json" <<'EOF'
{"id":"pending","kind":30041,"pubkey":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","created_at":100,"content":"Pending content","tags":[["d","pending-entry"],["ranking","30040:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd:index"],["status","pending"],["title","Pending entry"],["summary","Needs moderation"],["author","Guest"],["t","misc"]]}
EOF

extract_json() {
  sed -n '/^{/,$p'
}

bad_auth=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING= \
  /bin/sh "$ROOT_DIR/cgi/blog-list-pages" | extract_json
)
printf '%s\n' "$bad_auth" | jq -e '.success == false and .code == "auth_required"' >/dev/null

bad_csrf=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$token&csrf_token=wrong" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-pages" | extract_json
)
printf '%s\n' "$bad_csrf" | jq -e '.success == false and .code == "csrf_invalid"' >/dev/null

bad_admin=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$reader_token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-pages" | extract_json
)
printf '%s\n' "$bad_admin" | jq -e '.success == false and .code == "admin_required"' >/dev/null

ok=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-pages" | extract_json
)
printf '%s\n' "$ok" | jq -e '.success == true' >/dev/null
printf '%s\n' "$ok" | jq -e '.lists | length == 3' >/dev/null
printf '%s\n' "$ok" | jq -e '.lists[0].slug == "configured-list" and .lists[0].title == "configured list"' >/dev/null
printf '%s\n' "$ok" | jq -e '.lists[1].slug == "public-favorites" and .lists[1].title == "Public Favorites"' >/dev/null
printf '%s\n' "$ok" | jq -e '.lists[2].slug == "wizard-tools" and .lists[2].title == "Wizard Tools"' >/dev/null
printf '%s\n' "$ok" | jq -e '[.lists[].slug] | index("blog") == null' >/dev/null

draft_ok=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="draft_id=example-draft&session_token=$token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-get-draft" | extract_json
)
printf '%s\n' "$draft_ok" | jq -e '.success == true and .draft.draft_id == "example-draft" and .draft.title == "Example Draft"' >/dev/null
printf '%s\n' "$draft_ok" | jq -e '.draft.post_type == "longform" and .draft.origin_platforms == []' >/dev/null

posts_ok=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-posts" | extract_json
)
printf '%s\n' "$posts_ok" | jq -e '.success == true and (.posts | length) == 1 and .posts[0].path == "posts/example-post.md"' >/dev/null
printf '%s\n' "$posts_ok" | jq -e '.posts[0].crossposting.available == false and .posts[0].crossposting.published_count == 0 and (.posts[0].crossposting.platforms | length) == 0' >/dev/null

drafts_ok=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-drafts" | extract_json
)
printf '%s\n' "$drafts_ok" | jq -e '.success == true and (.drafts | length) == 1 and .drafts[0].draft_id == "example-draft"' >/dev/null
printf '%s\n' "$drafts_ok" | jq -e '.drafts[0].content_excerpt == "Draft body."' >/dev/null

users_ok=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-users" | extract_json
)
printf '%s\n' "$users_ok" | jq -e '.success == true and .actor_username == "admin" and (.users | length) == 2' >/dev/null
printf '%s\n' "$users_ok" | jq -e '.actor_rank == 2 and .users[0].username == "reader" and .users[0].is_blocked == true and .users[1].username == "admin" and .users[1].is_author == true' >/dev/null

queue_ok=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-queue" | extract_json
)
printf '%s\n' "$queue_ok" | jq -e '.success == true and .drip_interval_hours == 2.0 and .drip_interval_minutes == 120 and .drip_randomness_minutes == 15 and (.queue | length) == 1 and .queue[0].draft_id == "queued-draft" and .queue[0].title == "Queue body for drip publishing."' >/dev/null

moderation_ok=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-public-ranking-moderation" | extract_json
)
printf '%s\n' "$moderation_ok" | jq -e '.success == true and (.items | length) == 1 and .items[0].page_slug == "index" and .items[0].item_type == "entry"' >/dev/null

nostr_pages_ok=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-nostr-pages" | extract_json
)
printf '%s\n' "$nostr_pages_ok" | jq -e '.success == true and (.pages | length) == 2 and .pages[0].slug == "blog"' >/dev/null
printf '%s\n' "$nostr_pages_ok" | jq -e '.available_tags == ["essays","writing"] and .pages[0].canonical_exists == true and .pages[0].connected_posts == 1 and .pages[0].title == "Canonical Blog" and .pages[1].slug == "configured-list" and .pages[1].title == "Configured Draft" and .pages[1].draft_differs == true' >/dev/null

bad_output=$(/bin/sh "$ROOT_DIR/cgi/gazeta-admin-read-runtime-adapter" invalid-action)
printf '%s\n' "$bad_output" | grep '"success":false' >/dev/null
printf '%s\n' "$bad_output" | grep '"code":"bad_action"' >/dev/null

printf '%s\n' 'gazeta admin read adapter tests passed'
