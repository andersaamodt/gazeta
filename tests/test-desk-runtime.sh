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

assert_dir_exists() {
  dir=$1
  label=$2
  if [ -d "$dir" ]; then
    pass
  else
    fail "$label (missing dir: $dir)"
  fi
}

assert_file_exists() {
  file=$1
  label=$2
  if [ -f "$file" ]; then
    pass
  else
    fail "$label (missing file: $file)"
  fi
}

assert_file_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    pass
  else
    fail "$label (missing: $needle in $file)"
  fi
}

assert_file_not_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    fail "$label (unexpected: $needle in $file)"
  else
    pass
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

urlencode() {
  jq -nr --arg value "$1" '$value|@uri'
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/desk-runtime.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=desk.test
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
SITE_DATA="$SITES_DIR/.sitedata/$SITE_NAME"
BIN_DIR="$TMP_ROOT/bin"

mkdir -p "$SITE_ROOT/site/pages" "$SITE_ROOT/site/static" "$SITE_DATA" "$BIN_DIR"

cat > "$SITE_ROOT/site.conf" <<'EOFCONF'
site_title=Desk Test
plugin_nostr_support=true
plugin_nostr_login=true
EOFCONF

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
printf '\n'
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

PATH="$BIN_DIR:$PATH"
export PATH WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME"

. "$ROOT_DIR/cgi/blog-lib.sh"
blog_init

owner_pubkey=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
other_pubkey=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

owner_profile=$(blog_user_profile owner)
config-set "$owner_profile" username owner
config-set "$owner_profile" fingerprint owner-fingerprint
config-set "$owner_profile" is_admin false
config-set "$owner_profile" nostr_pubkey "$owner_pubkey"

other_profile=$(blog_user_profile other)
config-set "$other_profile" username other
config-set "$other_profile" fingerprint other-fingerprint
config-set "$other_profile" is_admin true
config-set "$other_profile" nostr_pubkey "$other_pubkey"

printf '%s\n' "$owner_pubkey" > "$blog_nostr_authors_file"

owner_session=$(blog_create_session owner owner-fingerprint "$owner_pubkey" "$owner_pubkey" '' nostr false)
owner_token=${owner_session%%;*}
owner_rest=${owner_session#*;}
owner_csrf=${owner_rest%%;*}

other_session=$(blog_create_session other other-fingerprint "$other_pubkey" "$other_pubkey" '' nostr false)
other_token=${other_session%%;*}
other_rest=${other_session#*;}
other_csrf=${other_rest%%;*}

run_desk() {
  query=$1
  REQUEST_METHOD=GET QUERY_STRING="$query" "$ROOT_DIR/cgi/blog-desk" | strip_cgi_headers
}

auth_query="session_token=$(urlencode "$owner_token")&csrf_token=$(urlencode "$owner_csrf")"
other_query="session_token=$(urlencode "$other_token")&csrf_token=$(urlencode "$other_csrf")"

unauth_json=$(run_desk 'action=state')
assert_jq "$unauth_json" '.success == false and .code == "auth_required"' 'Desk rejects unauthenticated access'

other_json=$(run_desk "action=state&$other_query")
assert_jq "$other_json" '.success == true and .office.title == "Office"' 'Desk accepts site admins even when they are not Nostr authors'

config-set "$SITE_ROOT/site.conf" desk_owner_pubkeys "$owner_pubkey"
explicit_other_json=$(run_desk "action=state&$other_query")
assert_jq "$explicit_other_json" '.success == false and .code == "owner_required"' 'Desk explicit owner list overrides site admin access'
explicit_owner_json=$(run_desk "action=state&$auth_query")
assert_jq "$explicit_owner_json" '.success == true and .office.title == "Office"' 'Desk explicit owner can enter the office'
config-set "$SITE_ROOT/site.conf" desk_owner_pubkeys ''

state_json=$(run_desk "action=state&$auth_query")
assert_jq "$state_json" '.success == true and .office.title == "Office" and .rooms == []' 'Desk owner can enter the office'
assert_dir_exists "$SITE_DATA/desk/office" 'Desk creates the real office folder'
assert_file_exists "$SITE_DATA/desk/office/.room.json" 'Desk writes minimal office metadata'

create_json=$(run_desk "action=create-room&$auth_query&room_title=$(urlencode "Writing Room")")
assert_jq "$create_json" '.success == true and .created_room.path == "writing-room" and (.created_room.color | test("^#[0-9a-f]{6}$"))' 'Desk creates a real room folder with a map color'
assert_dir_exists "$SITE_DATA/desk/office/writing-room" 'created room is a filesystem folder'

nested_json=$(run_desk "action=create-room&$auth_query&room=writing-room&room_title=$(urlencode "Inner Study")")
assert_jq "$nested_json" '.success == true and .created_room.path == "writing-room/inner-study" and .created_room.parent_path == "writing-room"' 'Desk nested folders become connected child rooms for the map'
assert_dir_exists "$SITE_DATA/desk/office/writing-room/inner-study" 'nested room is a real filesystem folder'

color_json=$(run_desk "action=set-room-color&$auth_query&room=writing-room&room_color=$(urlencode "#4f8fbd")")
assert_jq "$color_json" '.success == true and .updated_room.color == "#4f8fbd"' 'Desk stores room-local map highlight color'
assert_file_contains "$SITE_DATA/desk/office/writing-room/.room.json" '"color": "#4f8fbd"' 'room metadata persists settable room color'

rename_json=$(run_desk "action=set-room-title&$auth_query&room=writing-room&room_title=$(urlencode "Library Desk")")
assert_jq "$rename_json" '.success == true and .current_room.path == "writing-room" and .current_room.title == "Library Desk" and .updated_room.title == "Library Desk"' 'Desk lets the owner edit the current room name without moving the folder'
assert_file_contains "$SITE_DATA/desk/office/writing-room/.room.json" '"title": "Library Desk"' 'room metadata persists edited room names'

archive_json=$(run_desk "action=create-room&$auth_query&room_title=$(urlencode "Archive Room")")
assert_jq "$archive_json" '.success == true and .created_room.path == "archive-room"' 'Desk creates a second room for task moves'
assert_dir_exists "$SITE_DATA/desk/office/archive-room" 'second room is a filesystem folder'

move_room_json=$(run_desk "action=move-room&$auth_query&room=writing-room/inner-study&target_room=archive-room")
assert_jq "$move_room_json" '.success == true and .moved_room.from == "writing-room/inner-study" and .moved_room.to == "archive-room/inner-study" and .current_room.parent_path == "archive-room"' 'Desk moves rooms by moving the filesystem folder under another room'
assert_dir_exists "$SITE_DATA/desk/office/archive-room/inner-study" 'moved room folder exists under its new connected room'
if [ ! -d "$SITE_DATA/desk/office/writing-room/inner-study" ]; then
  pass
else
  fail 'room move removes the old room folder location'
fi

passage_json=$(run_desk "action=create-secret-passage&$auth_query&room=writing-room&target_room=archive-room")
assert_jq "$passage_json" '.success == true and .secret_passage.from == "archive-room" and .secret_passage.to == "writing-room" and (.secret_passages[] | select(.from == "archive-room" and .to == "writing-room"))' 'Desk creates a two-way secret passage between rooms'
assert_file_exists "$SITE_DATA/desk/office/writing-room/.passages/archive-room--writing-room.json" 'secret passage appears inside the first room'
assert_file_exists "$SITE_DATA/desk/office/archive-room/.passages/archive-room--writing-room.json" 'secret passage appears inside the second room'
if [ "$SITE_DATA/desk/office/writing-room/.passages/archive-room--writing-room.json" -ef "$SITE_DATA/desk/office/archive-room/.passages/archive-room--writing-room.json" ]; then
  pass
else
  fail 'secret passage files are hardlinked as one two-way passage'
fi

task_text='Low task
private body'
add_json=$(run_desk "action=add-task&$auth_query&destination_room=writing-room&task_text=$(urlencode "$task_text")")
assert_jq "$add_json" '.success == true and .created_task.title == "Low task" and .created_task.body == "private body"' 'Desk stores task text as canonical content'
task_id=$(printf '%s\n' "$add_json" | jq -r '.created_task.id')
assert_file_exists "$SITE_DATA/desk/office/writing-room/.tasks/$task_id" 'task is one plain text file in room .tasks'
assert_file_contains "$SITE_DATA/desk/office/writing-room/.tasks/$task_id" 'Low task' 'task file contains first-line title'

office_after_low=$(run_desk "action=state&$auth_query")
assert_jq "$office_after_low" '.rooms[] | select(.path == "writing-room" and .sleeping_task_count == 1 and (.surfaced_tasks | length) == 0)' 'office counts sleeping local tasks without exposing below-threshold text'

room_after_low=$(run_desk "action=state&$auth_query&room=writing-room")
assert_jq "$room_after_low" '.tasks[] | select(.title == "Low task" and .body == "private body")' 'room-local view shows below-threshold task text'

same_move_json=$(run_desk "action=move-task&$auth_query&room=writing-room&target_room=writing-room&task_id=$(urlencode "$task_id")")
assert_jq "$same_move_json" '.success == true and .move_skipped == true and .moved_task.id == "'"$task_id"'"' 'Desk skips same-room task moves without renaming files'
assert_file_exists "$SITE_DATA/desk/office/writing-room/.tasks/$task_id" 'same-room move leaves original task file in place'

move_json=$(run_desk "action=move-task&$auth_query&room=writing-room&target_room=archive-room&task_id=$(urlencode "$task_id")")
assert_jq "$move_json" '.success == true and .current_room.path == "archive-room" and .moved_task.id == "'"$task_id"'"' 'Desk moves tasks by filesystem move to another room'
assert_file_exists "$SITE_DATA/desk/office/archive-room/.tasks/$task_id" 'moved task file exists in destination room'

move_back_json=$(run_desk "action=move-task&$auth_query&room=archive-room&target_room=writing-room&task_id=$(urlencode "$task_id")")
assert_jq "$move_back_json" '.success == true and .current_room.path == "writing-room" and .moved_task.id == "'"$task_id"'"' 'Desk can move tasks back to the original room'
assert_file_exists "$SITE_DATA/desk/office/writing-room/.tasks/$task_id" 'moved-back task file exists in original room'

soon_json=$(run_desk "action=set-soonness&$auth_query&room=writing-room&task_id=$(urlencode "$task_id")&soonness=$(urlencode "2030-01-02")")
assert_jq "$soon_json" '.success == true and .updated_task.soonness == "2030-01-02"' 'Desk stores soonness metadata on a task'

vote_json=$(run_desk "action=vote-task&$auth_query&room=writing-room&task_id=$(urlencode "$task_id")")
assert_jq "$vote_json" '.success == true and .voted_task.upvotes == 1 and .voted_task.can_vote_now == false' 'private upvote increments xattr metadata and starts revote window'

revote_json=$(run_desk "action=vote-task&$auth_query&room=writing-room&task_id=$(urlencode "$task_id")")
assert_jq "$revote_json" '.success == false and .code == "vote_wait" and (.next_vote_at | type == "number")' 'Desk enforces the 18-hour private revote window'

office_after_vote=$(run_desk "action=state&$auth_query")
assert_jq "$office_after_vote" '.rooms[] | select(.path == "writing-room" and (.surfaced_tasks[]?.title == "Low task"))' 'office surfaces room tasks only after they cross threshold'

printf 'Public-facing room surface\n' > "$SITE_DATA/desk/office/writing-room/public.md"
public_json=$(run_desk "action=state&$auth_query&room=writing-room")
assert_jq "$public_json" '.current_room.has_public_file == true and .current_room.public_file_name == "public.md"' 'Desk detects public.md without publishing private tasks'

complete_json=$(run_desk "action=complete-task&$auth_query&room=writing-room&task_id=$(urlencode "$task_id")")
assert_jq "$complete_json" '.success == true and .completed_task.status == "done"' 'Desk marks completion by moving to done archive'
assert_file_exists "$SITE_DATA/desk/office/writing-room/.tasks/done/$task_id" 'completed task moved to .tasks/done'

restore_json=$(run_desk "action=restore-task&$auth_query&room=writing-room&task_id=$(urlencode "$task_id")")
assert_jq "$restore_json" '.success == true and .restored_task.status == "open" and .restored_task.completed_at == ""' 'Desk can restore completed tasks from the done archive'
assert_file_exists "$SITE_DATA/desk/office/writing-room/.tasks/$task_id" 'restored task moved back to room .tasks'

audit_json=$(run_desk "action=audit&$auth_query")
assert_jq "$audit_json" '.success == true and .issue_count == 0' 'Desk audit command reports clean state'

rebuild_json=$(run_desk "action=rebuild-indexes&$auth_query")
assert_jq "$rebuild_json" '.success == true and .cache == "rooms.json"' 'Desk rebuild-indexes maintenance command writes disposable cache'
assert_file_exists "$SITE_DATA/desk/.state/cache/rooms.json" 'Desk cache is stored outside canonical files'

orphans_json=$(run_desk "action=list-orphans&$auth_query")
assert_jq "$orphans_json" '.success == true and .orphan_count == 0' 'Desk list-orphans maintenance command runs'

migrate_json=$(run_desk "action=migrate-metadata&$auth_query&metadata_backend=sidecar")
assert_jq "$migrate_json" '.success == true and .target == "sidecar" and .migrated >= 1' 'Desk migrates task metadata to portable sidecars'
assert_file_exists "$SITE_DATA/desk/office/writing-room/.tasks/.meta/$task_id.json" 'metadata sidecar mirrors xattr fields after migration'

assert_file_contains "$ROOT_DIR/site/pages/desk.md" 'id="desk-page-root"' 'Desk page mounts private app root'
assert_file_contains "$ROOT_DIR/site/pages/desk.md" 'desk-page-body' 'Desk marks the body before loading private chrome'
assert_file_contains "$ROOT_DIR/site/pages/desk.md" 'desk-room-modal1' 'Desk page cache-busts create-room modal polish assets'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-gold' 'Desk stylesheet carries gold theme tokens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-blue-deep' 'Desk stylesheet carries deep blue theme tokens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'linear-gradient(135deg, #031433 0%, #061c49 44%, #08275e 100%)' 'Desk page background remains deep blue'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'url("/static/textures/desk-mahogany.jpg")' 'Desk uses a dark mahogany desktop rectangle texture'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body.desk-page-body #title-block-header' 'Desk hides the generated page title block'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: calc(100dvh - clamp(7.2rem, 9vw, 8.8rem));' 'Desk desktop is sized as a one-screen rectangle'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'overflow: hidden;' 'Desk page clamps the private surface to one viewport'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body.desk-page-body' 'Desk has a class-based page layout fallback'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) {' 'Desk scopes page-level layout to the private root'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'max-width: none;' 'Desk removes the public content-column width cap'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns: minmax(20rem, 24vw) minmax(0, 1fr);' 'Desk workbench uses a spacious widescreen layout'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage' 'Desk interface centers modes in an open stage'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-mode-dock' 'Desk has docked map, compose, and checklist launchers'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-scroll' 'Desk map has a viewport-filling map well'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'shape-rendering: geometricPrecision;' 'Desk map keeps SVG geometry vector-sharp when zoomed'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'text-rendering: geometricPrecision;' 'Desk map keeps SVG text vector-sharp when zoomed'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'drop-shadow' 'Desk map avoids SVG rasterizing drop shadows'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'will-change: transform, opacity;' 'Desk map avoids persistent transform raster layers'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'overflow: hidden;' 'Desk map fits without scrollbars'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn' 'Desk map create room control is a floating plus button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'place-items: center;' 'Desk map create room plus is centered in its circle'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'appearance: none;' 'Desk map create room button avoids native offset styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-modal-backdrop' 'Desk create room form opens in a modal'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns: minmax(13rem, 1fr) max-content 2.4rem;' 'Desk create-room modal has a structured compact form row'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'padding: 1rem 3.1rem 1rem 1rem;' 'Desk create-room modal reserves space for the close control'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-modal-close:hover' 'Desk create-room modal close control has an interactive state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns: minmax(0, 1fr) minmax(18rem, min(24rem, 32vw));' 'Desk checklist opens beside the map instead of covering it'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'desk-todo-slide-in' 'Desk checklist slides in from the right'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'repeating-linear-gradient(to bottom, #f8f2d8' 'Desk checklist looks like ruled notebook paper'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-link:hover .desk-map-room' 'Desk map rooms expand smoothly on hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '@keyframes desk-map-unfurl' 'Desk map opens with an unfurling animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '@keyframes desk-map-furl' 'Desk map closes with a furling animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-shape' 'Desk map draws rooms as architectural floorplan shapes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'fill: #ead49a;' 'Desk map uses a neutral default room color'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door' 'Desk map marks doors on shared room walls'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-wall-adornment' 'Desk map omits short exterior corner tick marks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-secret-passage' 'Desk map draws secret passages between rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-passage-btn' 'Desk map exposes a secret passage control'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) nav.site-nav .nav-center' 'Desk hides public navbar page links'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) footer.site-footer' 'Desk hides the public site footer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) nav.site-nav > .nav-right' 'Desk keeps shared auth controls as a top-right dock'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '/cgi/blog-desk' 'Desk frontend talks to private API'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function storageGet(key)' 'Desk frontend tolerates restricted localStorage'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "storageGet('session_token')" 'Desk auth reads session token through guarded storage'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function mansionLayout(rooms)' 'Desk frontend lays out rooms as a deterministic mansion map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function architecturalRoomPath' 'Desk map rooms form the building outline with architectural wall shapes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderDoor' 'Desk map renders doors between rooms that share a side'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '(y - 20)' 'Desk map renders doors as two-way arcs across shared walls'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'roomWallAdornments' 'Desk map no longer draws corner wall adornment ticks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderSecretPassage' 'Desk map renders explicit secret passages'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'attachedTo' 'Desk map layout connects each room to an already placed room'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-building' 'Desk map does not draw a separate outer house outline'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-mode="map"' 'Desk frontend exposes map mode launcher'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function closeMapMode()' 'Desk map launcher can close the open map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.mode = 'closed'" 'Desk can leave the central stage empty after closing the map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-mode="todo"' 'Desk frontend exposes checklist mode launcher'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-mode="compose"' 'Desk frontend exposes compose mode launcher'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('set-room-color'" 'Desk frontend can set room map colors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('set-room-title'" 'Desk frontend can rename the current room'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('move-room'" 'Desk frontend moves rooms by dropping one room on another'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('create-secret-passage'" 'Desk frontend creates two-way secret passages between rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "draggable=\"true\"" 'Desk map rooms are draggable for room moves'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-form="room-title"' 'Desk room view exposes a compact room-name editor'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Connects from' 'Desk create-room parent selector uses connection wording'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "join(' → ')" 'Desk room path labels use arrow separators instead of slashes'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-room-path' 'Desk removes the room breadcrumb styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-create-room-open' 'Desk frontend opens create room from the map plus button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderCreateRoomModal(data)' 'Desk frontend renders create room in a modal'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'preserveAspectRatio="xMidYMid meet"' 'Desk map scales to fit the desk without scrolling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'renderMap(data) + renderTodo(data)' 'Desk checklist keeps the map visible when open'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-notebook-list' 'Desk checklist renders tasks as notebook lines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5l5-2 8 2 5-2v15l-5 2-8-2-5 2z"></path>' 'Desk map launcher uses a map SVG icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<path d="M7 4.5h13"></path><path d="M7 10h13"></path><path d="M7 15.5h13"></path>' 'Desk checklist launcher uses a checklist SVG icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderChromeControls(data)' 'Desk renders compact chrome controls without the room title header'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '<h2 id="desk-map-heading">Room Map</h2>' 'Desk map omits title text for one-screen use'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'Central hall, wings, and nested rooms' 'Desk map omits explanatory description text'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'restore-task' 'Desk frontend exposes task restore after completion'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk_visibility_threshold' 'Desk frontend exposes the surfacing threshold control'
assert_file_contains "$ROOT_DIR/site/includes/nav.md" 'href="/desk"' 'logged-in user menu links to Desk'

printf 'PASS: %s\n' "$PASS_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s\n' "$FAIL_COUNT" >&2
  exit 1
fi
