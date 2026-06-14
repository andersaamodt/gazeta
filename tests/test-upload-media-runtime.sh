#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-upload-media.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export WIZARDRY_SITE_NAME="example.test"
SITE_ROOT="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
SITE_DATA="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"

mkdir -p \
  "$SITE_ROOT/site/pages" \
  "$SITE_DATA/ssh-auth/sessions" \
  "$SITE_DATA/ssh-auth/users/admin"

token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
csrf=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
expires_at=$(( $(date +%s) + 3600 ))
body="session_token=$token&csrf_token=$csrf&filename=hello.txt&mime_type=text%2Fplain&data_base64=SGVsbG8%3D"

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

output=$(
  printf '%s' "$body" |
    GAZETA_THEURGY_ALLOW_CARGO=1 \
    REQUEST_METHOD=POST \
    CONTENT_TYPE=application/x-www-form-urlencoded \
    CONTENT_LENGTH=${#body} \
    /bin/sh "$ROOT_DIR/cgi/blog-upload-media"
)
json=$(printf '%s\n' "$output" | sed -n '/^{/,$p')
printf '%s\n' "$json" | jq -e '.success == true and .filename == "hello.txt"' >/dev/null
file_id=$(printf '%s\n' "$json" | jq -r '.file_id')
record="$SITE_DATA/.files/records/$file_id.conf"
test -f "$record"
grep -q '^mime_type=text/plain$' "$record"
stored_name=$(printf '%s\n' "$json" | jq -r '.filename')
test -f "$SITE_DATA/files/$stored_name"
grep -q '^Hello$' "$SITE_DATA/files/$stored_name"

printf '%s\n' 'gazeta upload media runtime tests passed'
