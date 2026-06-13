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
  "$SITE_DATA/ssh-auth/sessions" \
  "$SITE_DATA/ssh-auth/users/admin" \
  "$SITE_DATA/ssh-auth/users/reader"

token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
csrf=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
reader_token=cccccccccccccccccccccccccccccccccccccccccccccccc
expires_at=$(( $(date +%s) + 3600 ))

cat > "$SITE_DATA/ssh-auth/users/admin/profile.conf" <<EOF
username=admin
is_admin=true
fingerprint=admin-fingerprint
EOF

cat > "$SITE_DATA/ssh-auth/users/reader/profile.conf" <<EOF
username=reader
is_admin=false
fingerprint=reader-fingerprint
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

cat > "$SITE_DATA/nostr-pages.json" <<'JSON'
{"pages":[
  {"slug":"blog","type":"blog"},
  {"slug":"Configured List","type":"list"}
]}
JSON

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

bad_output=$(/bin/sh "$ROOT_DIR/cgi/gazeta-admin-read-runtime-adapter" invalid-action)
printf '%s\n' "$bad_output" | grep '"success":false' >/dev/null
printf '%s\n' "$bad_output" | grep '"code":"bad_action"' >/dev/null

printf '%s\n' 'gazeta admin read adapter tests passed'
