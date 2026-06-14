#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-admin-runtime-adapter.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export WIZARDRY_SITE_NAME="example.test"
SITE_ROOT="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
SITE_DATA="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"
POSTS_STORE="$SITE_DATA/content/posts"

mkdir -p \
  "$SITE_ROOT/site/pages" \
  "$SITE_DATA/ssh-auth/sessions" \
  "$SITE_DATA/ssh-auth/users/admin" \
  "$POSTS_STORE"
ln -s "$POSTS_STORE" "$SITE_ROOT/site/pages/posts"

token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
csrf=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
expires_at=$(( $(date +%s) + 3600 ))

cat > "$SITE_DATA/ssh-auth/users/admin/profile.conf" <<EOF
username=admin
is_admin=true
fingerprint=admin-fingerprint
EOF

cat > "$SITE_DATA/ssh-auth/sessions/$token.conf" <<EOF
username=admin
csrf_token=$csrf
expires_at=$expires_at
is_admin=true
EOF

cat > "$POSTS_STORE/example-post.md" <<'EOF'
---
title: "Example"
visibility: "public"
---

Body.
EOF

extract_json() {
  sed -n '/^{/,$p'
}

bad_output=$(/bin/sh "$ROOT_DIR/cgi/gazeta-admin-runtime-adapter" invalid-action)
printf '%s\n' "$bad_output" | grep '"success":false' >/dev/null
printf '%s\n' "$bad_output" | grep '"code":"bad_action"' >/dev/null

ok=$(
  body="action=delete&post_path=posts%2Fexample-post&session_token=$token&csrf_token=$csrf"
  printf '%s' "$body" |
    GAZETA_THEURGY_ALLOW_CARGO=1 \
    REQUEST_METHOD=POST \
    CONTENT_TYPE=application/x-www-form-urlencoded \
    CONTENT_LENGTH=${#body} \
    /bin/sh "$ROOT_DIR/cgi/blog-manage-post" | extract_json
)
printf '%s\n' "$ok" | jq -e '.success == true and .post_path == "posts/example-post.md"' >/dev/null
test ! -f "$POSTS_STORE/example-post.md"

printf '%s\n' 'gazeta admin runtime adapter tests passed'
