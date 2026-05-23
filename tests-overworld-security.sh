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

assert_jq() {
  json=$1
  filter=$2
  label=$3
  if printf '%s\n' "$json" | jq -e "$filter" >/dev/null 2>&1; then
    pass
  else
    fail "$label"
    printf '%s\n' "$json" >&2
  fi
}

assert_not_contains() {
  haystack=$1
  needle=$2
  label=$3
  case "$haystack" in
    *"$needle"*) fail "$label" ;;
    *) pass ;;
  esac
}

assert_contains() {
  haystack=$1
  needle=$2
  label=$3
  case "$haystack" in
    *"$needle"*) pass ;;
    *)
      fail "$label"
      printf '%s\n' "$haystack" >&2
      ;;
  esac
}

strip_cgi_headers() {
  awk '
    BEGIN { body = 0 }
    {
      sub(/\r$/, "")
      if (body) {
        print
        next
      }
      if ($0 == "") {
        body = 1
      }
    }
  '
}

urlencode() {
  jq -nr --arg value "$1" '$value|@uri'
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/overworld-security.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=demo
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
SITE_DATA="$SITES_DIR/.sitedata/$SITE_NAME"
mkdir -p "$SITE_ROOT/site/pages" "$SITE_ROOT/site/static" "$SITE_DATA"
printf 'plugin_overworld=true\nplugin_nostr_posts=true\nsite_title=Demo\n' > "$SITE_ROOT/site.conf"

bad_site_user_output=$(
  HQ_SITE_USER='aa/../evil' "$ROOT_DIR/.headquarters/scripts/ensure-site-overworld-server-accounts.sh" --check 2>&1 || true
)
assert_contains "$bad_site_user_output" 'HQ_SITE_USER is not a safe system username.' 'server-account provisioning rejects path-shaped site users before privileged paths'
assert_not_contains "$bad_site_user_output" 'sudo:' 'server-account provisioning rejects bad site users before sudo'

bad_site_user_output=$(
  HQ_SITE_USER='aa/../evil' "$ROOT_DIR/.headquarters/scripts/ensure-site-overworld-static-compression.sh" --check 2>&1 || true
)
assert_contains "$bad_site_user_output" 'HQ_SITE_USER is not a safe system username.' 'static-compression provisioning rejects path-shaped site users before nginx paths'
assert_not_contains "$bad_site_user_output" 'sudo:' 'static-compression provisioning rejects bad site users before sudo'

AUTH_DIR="$SITE_DATA/ssh-auth"
NOW=$(date +%s)
EXPIRES=$((NOW + 3600))
mkdir -p "$AUTH_DIR/users/forged" "$AUTH_DIR/sessions"
forged_profile="$AUTH_DIR/users/forged/profile.conf"
cat > "$forged_profile" <<EOF
username=forged
fingerprint=test
csrf_token=forged-csrf
created_at=$NOW
expires_at=$EXPIRES
is_admin=false
auth_method=nostr
force_interactive=false
EOF

forged_session_json=$(REQUEST_METHOD=GET QUERY_STRING='action=state&session_token=../users/forged/profile&csrf_token=forged-csrf' WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/blog-overworld-game" | strip_cgi_headers)
assert_jq "$forged_session_json" '.success == true and .authenticated == false and .username == ""' 'path-shaped session tokens cannot authenticate through profile traversal'

logout_json=$(REQUEST_METHOD=GET QUERY_STRING='session_token=../users/forged/profile' WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/ssh-auth-logout" | strip_cgi_headers)
assert_jq "$logout_json" '.success == true and .logged_out == true' 'logout ignores path-shaped session tokens'
if [ -f "$forged_profile" ]; then
  pass
else
  fail 'logout does not delete files through path-shaped session tokens'
fi

(
  WIZARDRY_SITES_DIR="$SITES_DIR"
  WIZARDRY_SITE_NAME="$SITE_NAME"
  SCRIPT_DIR="$ROOT_DIR/cgi"
  export WIZARDRY_SITES_DIR WIZARDRY_SITE_NAME SCRIPT_DIR
  . "$ROOT_DIR/cgi/blog-lib.sh"
  . "$ROOT_DIR/cgi/ssh-auth-lib.sh"
  blog_init
  if blog_get_nostr_login_request "../users/forged/profile" >/dev/null 2>&1; then
    exit 10
  fi
  blog_clear_nostr_login_request "../users/forged/profile"
  [ -f "$forged_profile" ] || exit 11
  if ssh_auth_get_login_request_challenge "../users/forged/profile" >/dev/null 2>&1; then
    exit 12
  fi
  ssh_auth_clear_login_request "../users/forged/profile"
  [ -f "$forged_profile" ] || exit 13
)
case $? in
  0) pass ;;
  10) fail 'path-shaped Nostr login request ids cannot read profile files' ;;
  11) fail 'path-shaped Nostr login request ids cannot delete profile files' ;;
  12) fail 'path-shaped WebAuthn request ids cannot read profile files' ;;
  13) fail 'path-shaped WebAuthn request ids cannot delete profile files' ;;
  *) fail 'request-id path hardening subshell failed unexpectedly' ;;
esac

(
  WIZARDRY_SITES_DIR="$SITES_DIR"
  WIZARDRY_SITE_NAME="$SITE_NAME"
  export WIZARDRY_SITES_DIR WIZARDRY_SITE_NAME
  . "$ROOT_DIR/cgi/blog-lib.sh"
  blog_init
  profile=$(blog_user_profile delegateuser)
  config-set "$profile" username delegateuser
  config-set "$profile" fingerprint test-fingerprint
  session_parts=$(blog_create_session delegateuser test-fingerprint)
  printf '%s\n' "$session_parts"
) > "$TMP_ROOT/delegate-session"
delegate_session_parts=$(cat "$TMP_ROOT/delegate-session")
delegate_session_token=${delegate_session_parts%%;*}
delegate_rest=${delegate_session_parts#*;}
delegate_csrf=${delegate_rest%%;*}
delegate_profile="$AUTH_DIR/users/delegateuser/profile.conf"
delegate_revoke_json=$(REQUEST_METHOD=GET QUERY_STRING="delegate_id=../profile&session_token=$delegate_session_token&csrf_token=$delegate_csrf" WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/ssh-auth-revoke-delegate" | strip_cgi_headers)
assert_jq "$delegate_revoke_json" '.success == false and .code == "invalid_request"' 'path-shaped delegate ids are rejected before revoke'
if [ -f "$delegate_profile" ]; then
  pass
else
  fail 'delegate revoke cannot delete profile files through delegate_id traversal'
fi

state_json=$(REQUEST_METHOD=GET QUERY_STRING='action=state' WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/blog-overworld-game" | strip_cgi_headers)
assert_jq "$state_json" '.success == true and .authenticated == false and .room.parent_path == ""' 'anonymous starting room does not expose a parent exit'
assert_jq "$state_json" '.start_path == "/overworld/start" and .current_path == "/overworld/start" and .room.path == "/overworld/start"' 'anonymous response redacts absolute room paths'
assert_not_contains "$state_json" "$SITE_ROOT" 'anonymous response does not leak the site root path'
assert_not_contains "$state_json" "$SITE_DATA" 'anonymous response does not leak the site data path'
assert_jq "$state_json" 'all(.room.entries[]?; (.path // "" | startswith("/") | not))' 'anonymous entries do not expose absolute target paths'

guest_id=$(printf '%s\n' "$state_json" | jq -r '.guest_id')
real_start_path="$SITE_DATA/overworld/sandbox"
guest_file="$SITE_DATA/overworld/guests/$guest_id.conf"
config-set "$guest_file" current_path /
reset_guest_json=$(REQUEST_METHOD=GET QUERY_STRING="action=state&guest_id=$(urlencode "$guest_id")" WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/blog-overworld-game" | strip_cgi_headers)
reset_success=$(printf '%s\n' "$reset_guest_json" | jq -r '.success')
reset_current_path=$(printf '%s\n' "$reset_guest_json" | jq -r '.current_path')
if [ "$reset_success" = "true" ] && [ "$reset_current_path" = "/overworld/start" ]; then
  pass
else
  fail 'anonymous guest current_path import is forced back to the starting room'
  printf '%s\n' "$reset_guest_json" >&2
fi

bad_path="/tmp/overworld
escape"
bad_path_json=$(REQUEST_METHOD=GET QUERY_STRING="action=enter&path=$(urlencode "$bad_path")" WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/blog-overworld-game" | strip_cgi_headers)
assert_jq "$bad_path_json" '.success == false and .code == "bad_path"' 'newline-bearing room paths are rejected before permission checks'

(
  WIZARDRY_SITES_DIR="$SITES_DIR"
  WIZARDRY_SITE_NAME="$SITE_NAME"
  export WIZARDRY_SITES_DIR WIZARDRY_SITE_NAME
  . "$ROOT_DIR/cgi/blog-lib.sh"
  blog_init
  profile=$(blog_user_profile lockeduser)
  config-set "$profile" username lockeduser
  config-set "$profile" fingerprint test-fingerprint
  session_parts=$(blog_create_session lockeduser test-fingerprint)
  printf '%s\n' "$session_parts"
) > "$TMP_ROOT/locked-session"
locked_session_parts=$(cat "$TMP_ROOT/locked-session")
locked_session_token=${locked_session_parts%%;*}
locked_rest=${locked_session_parts#*;}
locked_csrf=${locked_rest%%;*}
locked_secret_dir="$TMP_ROOT/web-readable-auth-secret"
mkdir -p "$locked_secret_dir"
printf 'logged-in no-account users should not see this\n' > "$locked_secret_dir/no-account-secret.txt"
locked_escape_json=$(REQUEST_METHOD=GET QUERY_STRING="action=enter&path=$(urlencode "$locked_secret_dir")&session_token=$locked_session_token&csrf_token=$locked_csrf" WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/blog-overworld-game" | strip_cgi_headers)
assert_jq "$locked_escape_json" '.success == false and .code == "permission_denied"' 'authenticated users without server accounts cannot enter arbitrary readable folders'
assert_not_contains "$locked_escape_json" 'no-account-secret.txt' 'failed authenticated enter does not leak target room names'

(
  WIZARDRY_SITES_DIR="$SITES_DIR"
  WIZARDRY_SITE_NAME="$SITE_NAME"
  SCRIPT_DIR="$ROOT_DIR/cgi"
  export WIZARDRY_SITES_DIR WIZARDRY_SITE_NAME SCRIPT_DIR
  . "$ROOT_DIR/cgi/blog-lib.sh"
  . "$ROOT_DIR/cgi/blog-overworld-common.sh"
  . "$ROOT_DIR/cgi/ssh-auth-lib.sh"
  blog_init

  if blog_validate_username "." || blog_validate_username ".." || blog_validate_username "-root"; then
    exit 10
  fi

  probe="$TMP_ROOT/ssh-auth-eval-probe"
  if ssh_auth_user_home "bad;touch $probe" >/dev/null 2>&1; then
    exit 11
  fi
  if [ -e "$probe" ]; then
    exit 12
  fi
)
case $? in
  0) pass ;;
  10) fail 'path-shaped and option-shaped usernames are rejected' ;;
  11|12) fail 'ssh_auth_user_home rejects shell-shaped usernames before eval' ;;
  *) fail 'username hardening subshell failed unexpectedly' ;;
esac

FAKE_BIN="$TMP_ROOT/fake-bin"
mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/id" <<'EOS'
#!/bin/sh
case "$1" in
  -u)
    exec /usr/bin/id "$@"
    ;;
  -gn)
    printf '%s\n' "${2-ow123456789abc}"
    exit 0
    ;;
  ow123456789abc)
    exit 0
    ;;
esac
exec /usr/bin/id "$@"
EOS
cat > "$FAKE_BIN/sudo" <<'EOS'
#!/bin/sh
case "$*" in
  "-n true"|"-n -u ow123456789abc true"|"-n -u ow123456789abc test "*)
    exit 0
    ;;
  "-n -u ow123456789abc env "*)
    exit 42
    ;;
esac
exit 1
EOS
chmod +x "$FAKE_BIN/id" "$FAKE_BIN/sudo"

secret_dir="$TMP_ROOT/web-readable-secret"
mkdir -p "$secret_dir"
printf 'should not be listed\n' > "$secret_dir/web-secret.txt"

room_json=$(
  WIZARDRY_SITES_DIR="$SITES_DIR"
  WIZARDRY_SITE_NAME="$SITE_NAME"
  PATH="$FAKE_BIN:$PATH"
  export WIZARDRY_SITES_DIR WIZARDRY_SITE_NAME PATH
  . "$ROOT_DIR/cgi/blog-lib.sh"
  . "$ROOT_DIR/cgi/blog-overworld-common.sh"
  blog_init
  blog_overworld_room_json "$secret_dir" ow123456789abc "$real_start_path"
)
assert_jq "$room_json" '.error == "player_account_unavailable" and (.entries | length) == 0' 'player-account listing does not fall back to web-process permissions'
assert_not_contains "$room_json" 'web-secret.txt' 'failed player-account listing does not leak web-readable names'

printf 'PASS: %s\n' "$PASS_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s\n' "$FAIL_COUNT" >&2
  exit 1
fi
