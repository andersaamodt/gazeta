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
assert_jq "$create_json" '.success == true and .created_room.path == "writing-room" and (.created_room.color | test("^#[0-9a-f]{6}$")) and .created_room.kind == "indoor"' 'Desk creates a real room folder with an indoor default and map color'
assert_jq "$create_json" '.created_room.url == "/desk/writing-room"' 'Desk room URLs use clean place paths instead of room query strings'
assert_dir_exists "$SITE_DATA/desk/office/writing-room" 'created room is a filesystem folder'

nested_json=$(run_desk "action=create-room&$auth_query&room=writing-room&room_title=$(urlencode "Inner Study")")
assert_jq "$nested_json" '.success == true and .created_room.path == "writing-room/inner-study" and .created_room.parent_path == "writing-room"' 'Desk nested folders become connected child rooms for the map'
assert_dir_exists "$SITE_DATA/desk/office/writing-room/inner-study" 'nested room is a real filesystem folder'

color_json=$(run_desk "action=set-room-color&$auth_query&room=writing-room&room_color=$(urlencode "#4f8fbd")")
assert_jq "$color_json" '.success == true and .updated_room.color == "#4f8fbd"' 'Desk stores room-local map highlight color'
assert_file_contains "$SITE_DATA/desk/office/writing-room/.room.json" '"color": "#4f8fbd"' 'room metadata persists settable room color'

kind_json=$(run_desk "action=set-room-kind&$auth_query&room=writing-room&room_kind=outdoor")
assert_jq "$kind_json" '.success == true and .updated_room.kind == "outdoor" and .current_room.kind == "outdoor"' 'Desk stores room-local indoor/outdoor kind'
assert_file_contains "$SITE_DATA/desk/office/writing-room/.room.json" '"kind": "outdoor"' 'room metadata persists outdoor room kind'

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
assert_file_contains "$ROOT_DIR/site/pages/desk.md" 'desk-no-refresh-flash1' 'Desk page cache-busts no-flash state refreshes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-gold' 'Desk stylesheet carries gold theme tokens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-blue-deep' 'Desk stylesheet carries deep blue theme tokens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'linear-gradient(135deg, #031433 0%, #061c49 44%, #08275e 100%)' 'Desk page background remains deep blue'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '#123f3a' 'Desk ambient background avoids green lower-right tint'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '#2c315e' 'Desk ambient background avoids purple lower-right tint'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'url("/static/textures/desk-mahogany.jpg")' 'Desk uses a dark mahogany desktop rectangle texture'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '0 -24px 34px rgba(35, 12, 5, 0.28) inset' 'Desk desktop edge uses inset shadow instead of a crisp border'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body.desk-page-body #title-block-header' 'Desk hides the generated page title block'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'html.desk-page-document' 'Desk clamps the document itself to one viewport'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'position: fixed;' 'Desk pins the private app body to the viewport'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: calc(100dvh - 1px);' 'Desk avoids Safari one-pixel viewport rounding scrollbars'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: calc(100% - 1px);' 'Desk root stays inside the fixed app body'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-rows: minmax(0, 1fr);' 'Desk shell gives the desktop rectangle the remaining screen space'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: 100%;' 'Desk stage fills the shell content area without forcing overflow'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'overflow: hidden;' 'Desk page clamps the private surface to one viewport'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body.desk-page-body' 'Desk has a class-based page layout fallback'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) {' 'Desk scopes page-level layout to the private root'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'max-width: none;' 'Desk removes the public content-column width cap'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns: minmax(20rem, 24vw) minmax(0, 1fr);' 'Desk workbench uses a spacious widescreen layout'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage' 'Desk interface centers modes in an open stage'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-mode-dock' 'Desk has docked map, compose, and checklist launchers'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-scroll' 'Desk map has a viewport-filling map well'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage[data-desk-stage-mode="map"] .desk-map-panel' 'Desk map leaves visible desktop around the parchment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: 88%;' 'Desk map mode keeps more mahogany desk visible'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns: minmax(0, min(46rem, 52vw)) clamp(13rem, 19vw, 15.5rem);' 'Desk checklist opens as a narrow vertical sheet beside the map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-panel {' 'Desk map panel has its own borderless surface styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'border: 0;' 'Desk map removes panel and parchment borders'
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
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns: minmax(0, min(46rem, 52vw)) clamp(13rem, 19vw, 15.5rem);' 'Desk checklist opens beside the map as a vertical sheet instead of covering it'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'desk-todo-slide-in' 'Desk checklist slides in from the right'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'repeating-linear-gradient(to bottom, #f8f2d8' 'Desk checklist looks like ruled notebook paper'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'transform: scale(1.045);' 'Desk map rooms no longer enlarge on hover or current state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '@keyframes desk-map-unfurl' 'Desk map opens with an unfurling animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '@keyframes desk-map-furl' 'Desk map closes with a furling animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-shape' 'Desk map draws rooms as architectural floorplan shapes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'fill: url(#desk-map-parchment-texture);' 'Desk map background uses the site parchment texture'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'fill: url(#desk-map-room-paper);' 'Desk map rooms use a warmer parchment texture with grid squares'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'lapidarist-parchment.webp' 'Desk map uses the existing site parchment asset'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-current-tint' 'Desk map highlights the current room with its own room color'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'class="desk-map-room-current-tint" fill="' 'Desk current room highlight uses an explicit configured room color fill'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var currentTint = isCurrent' 'Desk renders current-room color tint only for the active room'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-grass' 'Desk map draws outdoor spaces with a grassy texture fill'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-outdoor-fade' 'Desk map fades outdoor space edges into parchment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'rgba(190,91,47,0.16)' 'Desk map room parchment texture has a warmer room overlay'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'rgba(122,66,37,0.18)' 'Desk map room parchment texture has warmer grid lines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door' 'Desk map marks doors on shared room walls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door-gap' 'Desk map door symbol covers the wall at the opening'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door-leaf' 'Desk map door symbol shows the open door leaf'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door-swing' 'Desk map door symbol uses a dotted swing arc'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-wall-adornment' 'Desk map omits short exterior corner tick marks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-secret-passage' 'Desk map draws secret passages between rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke-dasharray: 2 13;' 'Desk secret passages use a thick dotted passage line'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-secret-door-label' 'Desk secret passage doors are marked with an S'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-passage-btn' 'Desk map exposes a secret passage control'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-passage-btn:hover svg' 'Desk secret passage trigger book rotates on hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) nav.site-nav .nav-center' 'Desk hides public navbar page links'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) footer.site-footer' 'Desk hides the public site footer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) nav.site-nav > .nav-right' 'Desk keeps shared auth controls as a top-right dock'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-status-btn svg' 'Desk online status controls use icons instead of text labels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-status-btn[aria-pressed="true"]' 'Desk active status icon has a selected state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-menu-settings' 'Desk injects private settings into the top-right user menu'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-menu-heading' 'Desk menu settings have a visible section heading'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '/cgi/blog-desk' 'Desk frontend talks to private API'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function storageGet(key)' 'Desk frontend tolerates restricted localStorage'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "storageGet('session_token')" 'Desk auth reads session token through guarded storage'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomFromLocation()' 'Desk frontend can parse clean room URLs'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "path.indexOf('/desk/') === 0" 'Desk frontend reads the room slug from /desk/place paths'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "url.searchParams.get('room')" 'Desk frontend keeps legacy query-room fallback parsing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "return clean ? '/desk/' + encodeURIComponent(clean) : '/desk';" 'Desk frontend writes clean room URLs'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" "'/desk?room='" 'Desk frontend no longer writes query-string room URLs'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk_room_presence_v1' 'Desk frontend stores ambient room presence locally'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function updatePresence' 'Desk frontend continuously updates room presence levels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function dimPresenceForRoom' 'Desk frontend immediately soft-dims a room when leaving'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function applyPresenceValues' 'Desk frontend applies presence values before fetching the next room'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-room-presence' 'Desk map renders ambient room presence glows'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-presence' 'Desk map styles ambient room presence as a light glow'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-presence.is-outdoor' 'Desk map gives outdoor presence a sunnier glow'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'presence clock' 'Desk presence does not render clock text'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function mansionLayout(rooms)' 'Desk frontend lays out rooms as a deterministic mansion map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomKind(room)' 'Desk frontend distinguishes indoor and outdoor rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomIsOutdoor(room)' 'Desk frontend can test outdoor room metadata'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function compactnessScore' 'Desk layout can use unrelated shared walls to avoid excessive spread'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'semanticPenalty = candidate.anchor.path === parentPath ? 0 : 28' 'Desk layout still prefers semantic parent attachment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'spreadPenalty = Math.max(0, maxSpan - 4)' 'Desk layout penalizes excessive mansion spread'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function openSidesForCandidate' 'Desk map positioning still biases outdoor rooms toward exterior exposure'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function architecturalRoomPath' 'Desk map rooms form the building outline with architectural wall shapes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderOutdoorEdgeFades' 'Desk map renders subtle fades on outdoor room edges'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderGreenbelt' 'Desk map renders a connected greenbelt around the mansion'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-strip' 'Desk map traces the greenbelt along exterior perimeter strips'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-meadow' 'Desk greenbelt no longer uses oval meadow blobs'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-wash' 'Desk greenbelt no longer adds broad green wash blocks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-grass' 'Desk map defines a subtle abstract grass texture'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-room-grass' 'Desk map renders outdoor spaces without exterior wall strokes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-greenbelt-strip' 'Desk map has a perimeter-following greenbelt layer behind the rooms'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-greenbelt-wash' 'Desk map omits broad greenbelt wash rectangles'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderDoor' 'Desk map renders doors between rooms that share a side'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderDoorGlyph' 'Desk shares ordinary and secret passage door glyph rendering'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'lastEnteredDoor' 'Desk tracks the room doorway used for the last map travel'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function isLastEnteredDoor' 'Desk map can mark the last entered doorway'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var open = 13;' 'Desk doors use a smaller wall opening'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var leaf = 24;' 'Desk door leaves use matched swing geometry'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "side === 'east' ? 1 : -1" 'Desk east-west doors swing into the child room side'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "side === 'south' ? 1 : -1" 'Desk north-south doors swing into the child room side'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-door-gap' 'Desk map renders a wall-opening stroke for doors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-door-leaf' 'Desk map renders an open door leaf'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-door-swing' 'Desk map renders a dotted door swing arc'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door.is-last-entered .desk-map-door-leaf' 'Desk mildly highlights the door last entered through'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function secretDoorPoint' 'Desk secret passages choose door points on room edges'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderSecretPassageParts' 'Desk secret passages render door-to-door lines plus endpoint doors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-secret-door-label' 'Desk secret passage door labels render over the door line'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-room-paper' 'Desk defines a warmer gridded parchment texture for rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-passage-book-cover' 'Desk secret passage trigger uses a book icon'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'roomWallAdornments' 'Desk map no longer draws corner wall adornment ticks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var visibleCount = Number(room.visible_task_count || 0);' 'Desk map room numbers use only above-threshold task counts'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'visibleCount > 0' 'Desk map hides room numbers when no above-threshold tasks are present'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" " + ' / ' +" 'Desk map room numbers omit the sleeping-task slash count'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderSecretPassage' 'Desk map renders explicit secret passages'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'attachedTo' 'Desk map layout connects each room to an already placed room'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-building' 'Desk map does not draw a separate outer house outline'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-mode="map"' 'Desk frontend exposes map mode launcher'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function statusIcon(value)' 'Desk renders online, quiet, and away as status icons'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'aria-label="' 'Desk status icon controls keep accessible labels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function syncDeskMenuSettings()' 'Desk moves threshold settings into the top-right user menu'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-menu-settings' 'Desk settings menu block is idempotently injected'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<h2 class="desk-menu-heading">Settings</h2>' 'Desk settings menu includes a Settings subheading'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<span>Surface at</span>' 'Desk threshold control has a visible field label'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "document.addEventListener('change'" 'Desk threshold menu changes are handled outside the app root'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function closeMapMode()' 'Desk map launcher can close the open map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function closeOpenMode()' 'Desk background clicks can close the open mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function isDeskBackgroundClick(event)' 'Desk detects background clicks without closing interactive controls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.mode = 'closed'" 'Desk can leave the central stage empty after closing the map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-mode="todo"' 'Desk frontend exposes checklist mode launcher'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-mode="compose"' 'Desk frontend exposes compose mode launcher'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-compose-quill-icon' 'Desk compose launcher uses the public site compose quill icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'm229.66 58.34l-32-32' 'Desk compose launcher matches the shared nav compose icon path'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-mode-compose .desk-compose-quill-icon' 'Desk compose launcher centers its quill icon'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'translateY(-0.22rem)' 'Desk dock launchers do not move on hover or focus'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('set-room-color'" 'Desk frontend can set room map colors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('set-room-kind'" 'Desk frontend can set rooms indoor or outdoor'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('set-room-title'" 'Desk frontend can rename the current room'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'if (!state.data)' 'Desk state refresh keeps the mounted room UI instead of flashing to the loading screen'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('move-room'" 'Desk frontend moves rooms by dropping one room on another'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('create-secret-passage'" 'Desk frontend creates two-way secret passages between rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "draggable=\"true\"" 'Desk map rooms are draggable for room moves'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "root.addEventListener('pointerdown'" 'Desk room moves support pointer dragging on SVG rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomDropTargetAt' 'Desk pointer room moves resolve drop targets under the pointer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function finishRoomMove' 'Desk room moves share one API path for native and pointer drops'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'touch-action: none;' 'Desk room drag targets avoid touch scroll stealing room moves'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-form="room-title"' 'Desk room view exposes a compact room-name editor'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-form="room-kind"' 'Desk room view exposes an indoor/outdoor selector'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Connects from' 'Desk create-room parent selector uses connection wording'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "join(' → ')" 'Desk room path labels use arrow separators instead of slashes'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-room-path' 'Desk removes the room breadcrumb styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-create-room-open' 'Desk frontend opens create room from the map plus button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderCreateRoomModal(data)' 'Desk frontend renders create room in a modal'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'preserveAspectRatio="xMidYMid meet"' 'Desk map scales to fit the desk without scrolling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'renderMap(data) + renderTodo(data)' 'Desk checklist keeps the map visible when open'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-notebook-list' 'Desk checklist renders tasks as notebook lines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-scroll-icon' 'Desk map launcher uses a rendered scroll-map icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'transform: rotate(-17deg);' 'Desk map launcher sits diagonally out of the desk corner'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-scroll-route' 'Desk map launcher includes a blue map route on the parchment scroll'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-checklist-notebook-icon' 'Desk checklist launcher uses a miniature notebook sheet icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-mode-todo .desk-checklist-notebook-icon' 'Desk checklist launcher centers its notebook icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-checklist-rule' 'Desk checklist launcher has ruled notebook lines'
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
