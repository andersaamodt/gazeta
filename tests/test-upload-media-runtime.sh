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

update_body="session_token=$token&csrf_token=$csrf&file_id=$file_id&original_name=Hello%20Display.txt&safe_name=hello-renamed.txt&mime_type=text%2Fmarkdown&public_path=hello-pretty.txt&explicit_public=true"
update_output=$(
  printf '%s' "$update_body" |
    GAZETA_THEURGY_ALLOW_CARGO=1 \
    REQUEST_METHOD=POST \
    CONTENT_TYPE=application/x-www-form-urlencoded \
    CONTENT_LENGTH=${#update_body} \
    /bin/sh "$ROOT_DIR/cgi/blog-update-file"
)
update_json=$(printf '%s\n' "$update_output" | sed -n '/^{/,$p')
printf '%s\n' "$update_json" | jq -e '.success == true and .original_name == "Hello Display.txt" and .safe_name == "hello-renamed.txt" and .mime_type == "text/markdown" and .public_path == "hello-pretty.txt" and .explicit_public == true and .effective_public == true' >/dev/null
grep -q '^original_name=Hello Display.txt$' "$record"
grep -q '^safe_name=hello-renamed.txt$' "$record"
grep -q '^mime_type=text/markdown$' "$record"
grep -q '^public_path=hello-pretty.txt$' "$record"
grep -q '^explicit_public=true$' "$record"

config-set "$record" mime_type text/plain
config-set "$record" safe_name "$stored_name"
config-set "$record" original_name "$stored_name"
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

list_files_output=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-files"
)
list_files_json=$(printf '%s\n' "$list_files_output" | sed -n '/^{/,$p')
printf '%s\n' "$list_files_json" | jq -e '.success == true and (.files | length) == 1 and .files[0].file_id == "'"$file_id"'" and .files[0].url == "/hello%20public.txt"' >/dev/null
printf '%s\n' "$list_files_json" | jq -e '.files[0].share_url == ""' >/dev/null

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

visibility_private_body="session_token=$token&csrf_token=$csrf&file_id=$file_id&make_public=false"
visibility_private_output=$(
  printf '%s' "$visibility_private_body" |
    GAZETA_THEURGY_ALLOW_CARGO=1 \
    REQUEST_METHOD=POST \
    CONTENT_TYPE=application/x-www-form-urlencoded \
    CONTENT_LENGTH=${#visibility_private_body} \
    /bin/sh "$ROOT_DIR/cgi/blog-set-file-visibility"
)
visibility_private_json=$(printf '%s\n' "$visibility_private_output" | sed -n '/^{/,$p')
printf '%s\n' "$visibility_private_json" | jq -e '.success == true and .explicit_public == false and .effective_public == false' >/dev/null
grep -q '^explicit_public=false$' "$record"
test ! -f "$SITE_ROOT/build/hello public.txt"

share_create_body="session_token=$token&csrf_token=$csrf&file_id=$file_id&action=create"
share_create_output=$(
  printf '%s' "$share_create_body" |
    GAZETA_THEURGY_ALLOW_CARGO=1 \
    REQUEST_METHOD=POST \
    CONTENT_TYPE=application/x-www-form-urlencoded \
    CONTENT_LENGTH=${#share_create_body} \
    /bin/sh "$ROOT_DIR/cgi/blog-share-file"
)
share_create_json=$(printf '%s\n' "$share_create_output" | sed -n '/^{/,$p')
share_url=$(printf '%s\n' "$share_create_json" | jq -r '.share_url')
share_token=$(printf '%s\n' "$share_url" | sed -n 's/.*[?]share=//p')
test -n "$share_token"
grep -q "^share_token=$share_token$" "$record"

share_query="fileid=$file_id&share=$share_token"
share_serve_output=$(
  REQUEST_METHOD=GET \
  QUERY_STRING="$share_query" \
  REQUEST_URI="/cgi/blog-file?$share_query" \
  /bin/sh "$ROOT_DIR/cgi/blog-file"
)
printf '%s\n' "$share_serve_output" | tr -d '\r' | grep -q '^Status: 200 OK$'
printf '%s\n' "$share_serve_output" | tr -d '\r' | grep -q '^Cache-Control: private, no-store$'

share_revoke_body="session_token=$token&csrf_token=$csrf&file_id=$file_id&action=revoke"
share_revoke_output=$(
  printf '%s' "$share_revoke_body" |
    GAZETA_THEURGY_ALLOW_CARGO=1 \
    REQUEST_METHOD=POST \
    CONTENT_TYPE=application/x-www-form-urlencoded \
    CONTENT_LENGTH=${#share_revoke_body} \
    /bin/sh "$ROOT_DIR/cgi/blog-share-file"
)
share_revoke_json=$(printf '%s\n' "$share_revoke_output" | sed -n '/^{/,$p')
printf '%s\n' "$share_revoke_json" | jq -e '.success == true and .share_url == ""' >/dev/null
revoked_serve_output=$(
  REQUEST_METHOD=GET \
  QUERY_STRING="$share_query" \
  REQUEST_URI="/cgi/blog-file?$share_query" \
  /bin/sh "$ROOT_DIR/cgi/blog-file"
)
printf '%s\n' "$revoked_serve_output" | tr -d '\r' | grep -q '^Status: 403 Forbidden$'

visibility_public_body="session_token=$token&csrf_token=$csrf&file_id=$file_id&make_public=true"
visibility_public_output=$(
  printf '%s' "$visibility_public_body" |
    GAZETA_THEURGY_ALLOW_CARGO=1 \
    REQUEST_METHOD=POST \
    CONTENT_TYPE=application/x-www-form-urlencoded \
    CONTENT_LENGTH=${#visibility_public_body} \
    /bin/sh "$ROOT_DIR/cgi/blog-set-file-visibility"
)
visibility_public_json=$(printf '%s\n' "$visibility_public_output" | sed -n '/^{/,$p')
printf '%s\n' "$visibility_public_json" | jq -e '.success == true and .explicit_public == true and .effective_public == true and .url == "/hello%20public.txt"' >/dev/null
grep -q '^explicit_public=true$' "$record"
test -f "$SITE_ROOT/build/hello public.txt"
grep -q '^Hello$' "$SITE_ROOT/build/hello public.txt"

delete_body="session_token=$token&csrf_token=$csrf&file_id=$file_id"
delete_output=$(
  printf '%s' "$delete_body" |
    GAZETA_THEURGY_ALLOW_CARGO=1 \
    REQUEST_METHOD=POST \
    CONTENT_TYPE=application/x-www-form-urlencoded \
    CONTENT_LENGTH=${#delete_body} \
    /bin/sh "$ROOT_DIR/cgi/blog-delete-file"
)
delete_json=$(printf '%s\n' "$delete_output" | sed -n '/^{/,$p')
printf '%s\n' "$delete_json" | jq -e '.success == true and .file_id == "'"$file_id"'"' >/dev/null
test ! -f "$record"
test ! -f "$SITE_DATA/files/$stored_name"
test ! -f "$SITE_ROOT/build/hello public.txt"

list_files_after_delete=$(
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=GET \
  QUERY_STRING="session_token=$token&csrf_token=$csrf" \
  /bin/sh "$ROOT_DIR/cgi/blog-list-files"
)
printf '%s\n' "$list_files_after_delete" | sed -n '/^{/,$p' | jq -e '.success == true and (.files | length) == 0' >/dev/null

printf '%s\n' 'gazeta upload media runtime tests passed'
