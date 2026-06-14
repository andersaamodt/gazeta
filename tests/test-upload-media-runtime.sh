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
printf '%s\n' "$json" | jq -e '.url | startswith("/cgi/blog-file/")' >/dev/null
file_id=$(printf '%s\n' "$json" | jq -r '.file_id')
record="$SITE_DATA/.files/records/$file_id.conf"
test -f "$record"
grep -q '^mime_type=text/plain$' "$record"
stored_name=$(printf '%s\n' "$json" | jq -r '.filename')
test -f "$SITE_DATA/files/$stored_name"
grep -q '^Hello$' "$SITE_DATA/files/$stored_name"
config-set "$record" explicit_public true
config-set "$record" public_path "hello public.txt"

pretty_url=$(
  . "$ROOT_DIR/cgi/blog-lib.sh"
  blog_init
  blog_file_public_url_encoded "$file_id" "$stored_name"
)
test "$pretty_url" = "/hello%20public.txt"

pretty_ids=$(
  . "$ROOT_DIR/cgi/blog-lib.sh"
  blog_init
  blog_file_ids_from_text '[hello](https://example.test/hello%20public.txt)'
)
test "$pretty_ids" = "$file_id"

(
  . "$ROOT_DIR/cgi/blog-lib.sh"
  blog_init
  blog_file_sync_public_aliases
)
test -f "$SITE_ROOT/build/hello public.txt"
grep -q '^Hello$' "$SITE_ROOT/build/hello public.txt"

serve_query="fileid=$file_id&session_token=$token&csrf_token=$csrf"
serve_output=$(
  REQUEST_METHOD=GET \
  QUERY_STRING="$serve_query" \
  REQUEST_URI="/cgi/blog-file?$serve_query" \
  /bin/sh "$ROOT_DIR/cgi/blog-file"
)
serve_headers=$(printf '%s\n' "$serve_output" | tr -d '\r')
printf '%s\n' "$serve_headers" | grep -q '^Status: 200 OK$'
printf '%s\n' "$serve_headers" | grep -q '^Content-Type: text/plain$'
printf '%s\n' "$serve_headers" | grep -q '^X-Accel-Redirect: /__site-files/hello.txt$'

printf '%s\n' 'gazeta upload media runtime tests passed'
