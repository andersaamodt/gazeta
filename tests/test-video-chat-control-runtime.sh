#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

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

call_control() {
  query=$1
  REQUEST_METHOD=GET \
    QUERY_STRING="$query&session_token=$session_token&csrf_token=$csrf_token" \
    WIZARDRY_SITES_DIR="$SITES_DIR" \
    WIZARDRY_SITE_NAME="$SITE_NAME" \
    "$ROOT_DIR/cgi/blog-video-chat-control" | strip_cgi_headers
}

call_token() {
  query=$1
  REQUEST_METHOD=GET \
    QUERY_STRING="$query" \
    WIZARDRY_SITES_DIR="$SITES_DIR" \
    WIZARDRY_SITE_NAME="$SITE_NAME" \
    "$ROOT_DIR/cgi/blog-video-chat-token" | strip_cgi_headers
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/video-chat-control-runtime.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=demo
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
SITE_DATA="$SITES_DIR/.sitedata/$SITE_NAME"
AUTH_DIR="$SITE_DATA/ssh-auth"
NOW=$(date +%s)
EXPIRES=$((NOW + 3600))

mkdir -p \
  "$SITE_ROOT" \
  "$SITE_DATA" \
  "$AUTH_DIR/users/admin" \
  "$AUTH_DIR/users/guest" \
  "$AUTH_DIR/sessions"

printf 'plugin_video_chat=true\nsite_title=Demo\n' > "$SITE_ROOT/site.conf"
cat > "$AUTH_DIR/users/admin/profile.conf" <<'EOF'
username=admin
is_admin=true
player_name=Admin User
video_chat_allow_admin_calls=false
EOF
cat > "$AUTH_DIR/users/guest/profile.conf" <<'EOF'
username=guest
is_admin=false
player_name=Guest User
video_chat_allow_admin_calls=false
EOF
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"
blog_init
session_parts=$(blog_create_session admin test-fingerprint)
session_token=${session_parts%%;*}
session_rest=${session_parts#*;}
csrf_token=${session_rest%%;*}

heartbeat_json=$(call_control 'action=heartbeat&current_room=&status=online&page_url=/admin')
assert_jq "$heartbeat_json" '.success == true and .username == "admin" and .allow_admin_calls == false' 'admin heartbeat succeeds without call opt-in'

status_json=$(call_control 'action=admin_status')
assert_jq "$status_json" '.success == true and (.users[] | select(.username == "admin" and .is_self == true and .allow_admin_calls == false))' 'admin status identifies the current user as self'

self_call_json=$(call_control 'action=admin_call_user&username=admin')
assert_jq "$self_call_json" '.success == true and .call.to_user == "admin" and .call.from_admin == "admin" and .call.self_test == true and .call.private_room == true and (.call.room_password | length > 20) and .call.status == "ringing"' 'admin can call self as an explicit passworded self-test without opt-in'

guest_call_json=$(call_control 'action=admin_call_user&username=guest')
assert_jq "$guest_call_json" '.success == false and .code == "not_allowed"' 'admin cannot call another user without their opt-in'

inactive_public_room_json=$(call_token 'room_id=office-hours&public_room=true')
assert_jq "$inactive_public_room_json" '.success == false and .code == "public_room_not_active"' 'public event room joins require an active configured room'

config-set "$SITE_ROOT/site.conf" video_chat_public_rooms true
config-set "$SITE_ROOT/site.conf" video_chat_rooms 'Office hours,Launch Q&A'

active_public_room_json=$(call_token 'room_id=office-hours&public_room=true')
assert_jq "$active_public_room_json" '.success == true and .room_id == "office-hours" and .public_rooms == true and (.rooms | index("Office hours")) and (.rooms | index("Launch Q&A"))' 'active configured event rooms can issue video tokens'

unlisted_public_room_json=$(call_token 'room_id=random-hangout&public_room=true')
assert_jq "$unlisted_public_room_json" '.success == false and .code == "public_room_not_active"' 'unlisted public event rooms cannot issue public room tokens'

owner_call_json=$(call_token 'owner_call=true&display_name=Browser%20Caller')
assert_jq "$owner_call_json" '.success == true and .private_room == true and (.room_id | startswith("anders-")) and (.room_password | length > 20)' 'public owner calls get a fresh private passworded room'
owner_room=$(printf '%s\n' "$owner_call_json" | jq -r '.room_id')
owner_password=$(printf '%s\n' "$owner_call_json" | jq -r '.room_password')

admin_status_after_owner_json=$(call_control 'action=admin_status')
assert_jq "$admin_status_after_owner_json" ".success == true and (.calls[] | select(.owner_call == true and .private_room == true and .room_id == \"$owner_room\" and .room_password == \"$owner_password\" and .to_user == \"admin\"))" 'public owner calls appear in admin call requests with room password'
owner_call_id=$(printf '%s\n' "$admin_status_after_owner_json" | jq -r ".calls[] | select(.owner_call == true and .room_id == \"$owner_room\") | .call_id" | head -n 1)

blocked_join_json=$(call_token "room_id=$owner_room")
assert_jq "$blocked_join_json" '.success == false and .code == "room_password_required"' 'private rooms reject token requests without the room password'

allowed_join_json=$(call_token "room_id=$owner_room&room_password=$owner_password")
assert_jq "$allowed_join_json" ".success == true and .room_id == \"$owner_room\" and .private_room == true and .room_password == \"$owner_password\"" 'private rooms allow token requests with the room password'

answer_json=$(call_control "action=answer_call&call_id=$owner_call_id")
assert_jq "$answer_json" ".success == true and .room_id == \"$owner_room\" and .room_password == \"$owner_password\"" 'answering an owner call returns the private room password'

call_id_join_json=$(call_token "room_id=$owner_room&call_id=$owner_call_id")
assert_jq "$call_id_join_json" ".success == true and .room_id == \"$owner_room\" and .private_room == true and .room_password == \"$owner_password\"" 'accepted owner-call rooms can resolve password by call id on first answered-page load'

printf 'PASS: %s\n' "$PASS_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s\n' "$FAIL_COUNT" >&2
  exit 1
fi
