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

assert_css_block_contains() {
  file=$1
  selector=$2
  needle=$3
  label=$4
  if awk -v selector="$selector" -v needle="$needle" '
    index($0, selector) { in_block = 1 }
    in_block && index($0, needle) { found = 1 }
    in_block && index($0, "}") { exit }
    END { exit found ? 0 : 1 }
  ' "$file"; then
    pass
  else
    fail "$label (missing: $needle in $selector block)"
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
assert_jq "$create_json" '.success == true and .created_room.path == "writing-room" and (.created_room.color | test("^#[0-9a-f]{6}$")) and .created_room.kind == "indoor" and .created_room.topology == "connected"' 'Desk creates a real room folder with indoor connected defaults and map color'
assert_jq "$create_json" '.created_room.url == "/writing-room"' 'Desk room URLs use clean place paths from the dedicated subdomain root'
assert_dir_exists "$SITE_DATA/desk/office/writing-room" 'created room is a filesystem folder'

nested_json=$(run_desk "action=create-room&$auth_query&room=writing-room&room_title=$(urlencode "Inner Study")")
assert_jq "$nested_json" '.success == true and .created_room.path == "writing-room/inner-study" and .created_room.parent_path == "writing-room"' 'Desk nested folders become connected child rooms for the map'
assert_jq "$nested_json" '.created_room.url == "/writing-room/inner-study"' 'Desk nested room URLs keep path slashes instead of percent-encoding them'
assert_dir_exists "$SITE_DATA/desk/office/writing-room/inner-study" 'nested room is a real filesystem folder'

color_json=$(run_desk "action=set-room-color&$auth_query&room=writing-room&room_color=$(urlencode "#4f8fbd")")
assert_jq "$color_json" '.success == true and .updated_room.color == "#4f8fbd"' 'Desk stores room-local map highlight color'
assert_file_contains "$SITE_DATA/desk/office/writing-room/.room.json" '"color": "#4f8fbd"' 'room metadata persists settable room color'

kind_json=$(run_desk "action=set-room-kind&$auth_query&room=writing-room&room_kind=outdoor")
assert_jq "$kind_json" '.success == true and .updated_room.kind == "outdoor" and .current_room.kind == "outdoor"' 'Desk stores room-local indoor/outdoor kind'
assert_file_contains "$SITE_DATA/desk/office/writing-room/.room.json" '"kind": "outdoor"' 'room metadata persists outdoor room kind'

topology_json=$(run_desk "action=set-room-topology&$auth_query&room=writing-room&room_topology=contained")
assert_jq "$topology_json" '.success == true and .updated_room.topology == "contained" and .current_room.topology == "contained"' 'Desk stores room-local child topology for contained subdivisions'
assert_file_contains "$SITE_DATA/desk/office/writing-room/.room.json" '"topology": "contained"' 'room metadata persists contained child topology'

rename_json=$(run_desk "action=set-room-title&$auth_query&room=writing-room&room_title=$(urlencode "Library Desk")")
assert_jq "$rename_json" '.success == true and .current_room.path == "writing-room" and .current_room.title == "Library Desk" and .updated_room.title == "Library Desk"' 'Desk lets the owner edit the current room name without moving the folder'
assert_file_contains "$SITE_DATA/desk/office/writing-room/.room.json" '"title": "Library Desk"' 'room metadata persists edited room names'

rename_slug_json=$(run_desk "action=rename-room&$auth_query&room=writing-room&room_title=$(urlencode "Forest Study")")
assert_jq "$rename_slug_json" '.success == true and .renamed_room.from == "writing-room" and .renamed_room.to == "forest-study" and .current_room.path == "forest-study"' 'Desk room renaming can move folders and update current room URL path'
assert_dir_exists "$SITE_DATA/desk/office/forest-study" 'renamed room exists at its new slug path'
if [ ! -d "$SITE_DATA/desk/office/writing-room" ]; then
  pass
else
  fail 'room rename removes the old folder path'
fi

archive_json=$(run_desk "action=create-room&$auth_query&room_title=$(urlencode "Archive Room")")
assert_jq "$archive_json" '.success == true and .created_room.path == "archive-room"' 'Desk creates a second room for task moves'
assert_dir_exists "$SITE_DATA/desk/office/archive-room" 'second room is a filesystem folder'

move_room_json=$(run_desk "action=move-room&$auth_query&room=forest-study/inner-study&target_room=archive-room")
assert_jq "$move_room_json" '.success == true and .moved_room.from == "forest-study/inner-study" and .moved_room.to == "archive-room/inner-study" and .current_room.parent_path == "archive-room"' 'Desk moves rooms by moving the filesystem folder under another room'
assert_dir_exists "$SITE_DATA/desk/office/archive-room/inner-study" 'moved room folder exists under its new connected room'
if [ ! -d "$SITE_DATA/desk/office/forest-study/inner-study" ]; then
  pass
else
  fail 'room move removes the old room folder location'
fi

same_parent_move_json=$(run_desk "action=move-room&$auth_query&room=archive-room/inner-study&target_room=archive-room")
assert_jq "$same_parent_move_json" '.success == true and .moved_room.from == "archive-room/inner-study" and .moved_room.to == "archive-room/inner-study" and .current_room.path == "archive-room/inner-study"' 'Desk moving a room to its existing parent is a no-op instead of appending repeated numeric suffixes'
if [ ! -d "$SITE_DATA/desk/office/archive-room/inner-study-2" ]; then
  pass
else
  fail 'same-parent room move must not create a suffixed duplicate path'
fi

save_doc_json=$(run_desk "action=save-document&$auth_query&room=archive-room&doc_type=shortform&doc_body=$(urlencode "Draft lines for room document")")
assert_jq "$save_doc_json" '.success == true and (.saved_document.id | endswith(".md")) and .saved_document.room == "archive-room"' 'Desk saves compose documents as markdown files in room folders'
saved_doc_id=$(printf '%s\n' "$save_doc_json" | jq -r '.saved_document.id')
assert_file_exists "$SITE_DATA/desk/office/archive-room/.docs/$saved_doc_id" 'Desk writes room documents to real .docs folders on disk'
blank_doc_json=$(run_desk "action=save-document&$auth_query&room=archive-room&doc_type=shortform&doc_body=")
assert_jq "$blank_doc_json" '.success == false and .code == "empty_document"' 'Desk does not save a blank untitled document'
rename_doc_json=$(run_desk "action=rename-document&$auth_query&room=archive-room&doc_id=$(urlencode "$saved_doc_id")&doc_title=$(urlencode "Desk Rename Test")")
assert_jq "$rename_doc_json" '.success == true and .renamed_document.id == "desk-rename-test.md" and .renamed_document.title == "Desk Rename Test"' 'Desk can rename room documents from the document menu'
saved_doc_id=$(printf '%s\n' "$rename_doc_json" | jq -r '.renamed_document.id')
assert_file_exists "$SITE_DATA/desk/office/archive-room/.docs/$saved_doc_id" 'Desk document rename moves the markdown file on disk'

move_doc_json=$(run_desk "action=move-document&$auth_query&room=archive-room&doc_id=$(urlencode "$saved_doc_id")&target_room=forest-study")
assert_jq "$move_doc_json" '.success == true and .moved_document.from_room == "archive-room" and .moved_document.to_room == "forest-study"' 'Desk moves room documents by moving markdown files between room folders'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.docs/$saved_doc_id" 'Desk moved document exists in target room folder'

passage_json=$(run_desk "action=create-secret-passage&$auth_query&room=forest-study&target_room=archive-room")
assert_jq "$passage_json" '.success == true and .secret_passage.from == "archive-room" and .secret_passage.to == "forest-study" and (.secret_passages[] | select(.from == "archive-room" and .to == "forest-study"))' 'Desk creates a two-way secret passage between rooms'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.passages/archive-room--forest-study.json" 'secret passage appears inside the first room'
assert_file_exists "$SITE_DATA/desk/office/archive-room/.passages/archive-room--forest-study.json" 'secret passage appears inside the second room'
if [ "$SITE_DATA/desk/office/forest-study/.passages/archive-room--forest-study.json" -ef "$SITE_DATA/desk/office/archive-room/.passages/archive-room--forest-study.json" ]; then
  pass
else
  fail 'secret passage files are hardlinked as one two-way passage'
fi

task_text='Low task
private body'
add_json=$(run_desk "action=add-task&$auth_query&destination_room=forest-study&task_text=$(urlencode "$task_text")")
assert_jq "$add_json" '.success == true and .created_task.title == "Low task" and .created_task.body == "private body"' 'Desk stores task text as canonical content'
task_id=$(printf '%s\n' "$add_json" | jq -r '.created_task.id')
assert_file_exists "$SITE_DATA/desk/office/forest-study/.tasks/$task_id" 'task is one plain text file in room .tasks'
assert_file_contains "$SITE_DATA/desk/office/forest-study/.tasks/$task_id" 'Low task' 'task file contains first-line title'

office_after_low=$(run_desk "action=state&$auth_query")
assert_jq "$office_after_low" '.rooms[] | select(.path == "forest-study" and .sleeping_task_count == 1 and (.surfaced_tasks | length) == 0)' 'office counts sleeping local tasks without exposing below-threshold text'

room_after_low=$(run_desk "action=state&$auth_query&room=forest-study")
assert_jq "$room_after_low" '.tasks[] | select(.title == "Low task" and .body == "private body")' 'room-local view shows below-threshold task text'

same_move_json=$(run_desk "action=move-task&$auth_query&room=forest-study&target_room=forest-study&task_id=$(urlencode "$task_id")")
assert_jq "$same_move_json" '.success == true and .move_skipped == true and .moved_task.id == "'"$task_id"'"' 'Desk skips same-room task moves without renaming files'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.tasks/$task_id" 'same-room move leaves original task file in place'

move_json=$(run_desk "action=move-task&$auth_query&room=forest-study&target_room=archive-room&task_id=$(urlencode "$task_id")")
assert_jq "$move_json" '.success == true and .current_room.path == "archive-room" and .moved_task.id == "'"$task_id"'"' 'Desk moves tasks by filesystem move to another room'
assert_file_exists "$SITE_DATA/desk/office/archive-room/.tasks/$task_id" 'moved task file exists in destination room'

move_back_json=$(run_desk "action=move-task&$auth_query&room=archive-room&target_room=forest-study&task_id=$(urlencode "$task_id")")
assert_jq "$move_back_json" '.success == true and .current_room.path == "forest-study" and .moved_task.id == "'"$task_id"'"' 'Desk can move tasks back to the original room'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.tasks/$task_id" 'moved-back task file exists in original room'

soon_json=$(run_desk "action=set-soonness&$auth_query&room=forest-study&task_id=$(urlencode "$task_id")&soonness=$(urlencode "2030-01-02")")
assert_jq "$soon_json" '.success == true and .updated_task.soonness == "2030-01-02"' 'Desk stores soonness metadata on a task'

vote_json=$(run_desk "action=vote-task&$auth_query&room=forest-study&task_id=$(urlencode "$task_id")")
assert_jq "$vote_json" '.success == true and .voted_task.upvotes == 1 and .voted_task.can_vote_now == false' 'private upvote increments xattr metadata and starts revote window'

revote_json=$(run_desk "action=vote-task&$auth_query&room=forest-study&task_id=$(urlencode "$task_id")")
assert_jq "$revote_json" '.success == false and .code == "vote_wait" and (.next_vote_at | type == "number")' 'Desk enforces the 18-hour private revote window'

edit_json=$(run_desk "action=edit-task&$auth_query&room=forest-study&task_id=$(urlencode "$task_id")&task_text=$(urlencode "Edited low task")")
assert_jq "$edit_json" '.success == true and .edited_task.title == "Edited low task" and (.tasks[]?.title == "Edited low task")' 'Desk edits task text in place while preserving the task file'
assert_file_contains "$SITE_DATA/desk/office/forest-study/.tasks/$task_id" 'Edited low task' 'Desk task edit rewrites the canonical text file'

office_after_vote=$(run_desk "action=state&$auth_query")
assert_jq "$office_after_vote" '.rooms[] | select(.path == "forest-study" and (.surfaced_tasks[]?.title == "Edited low task"))' 'office surfaces room tasks only after they cross threshold'

printf 'Public-facing room surface\n' > "$SITE_DATA/desk/office/forest-study/public.md"
public_json=$(run_desk "action=state&$auth_query&room=forest-study")
assert_jq "$public_json" '.current_room.has_public_file == true and .current_room.public_file_name == "public.md"' 'Desk detects public.md without publishing private tasks'

complete_json=$(run_desk "action=complete-task&$auth_query&room=forest-study&task_id=$(urlencode "$task_id")")
assert_jq "$complete_json" '.success == true and .completed_task.status == "open" and (.completed_task.completed_at | length > 0)' 'Desk marks completion in place so checked tasks stay visible'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.tasks/$task_id" 'completed task remains in the active task list until archived'

archive_task_json=$(run_desk "action=archive-task&$auth_query&room=forest-study&task_id=$(urlencode "$task_id")")
assert_jq "$archive_task_json" '.success == true and .archived_task.status == "done"' 'Desk archives a checked task to the done archive when requested'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.tasks/done/$task_id" 'archived task moved to .tasks/done'

restore_json=$(run_desk "action=restore-task&$auth_query&room=forest-study&task_id=$(urlencode "$task_id")")
assert_jq "$restore_json" '.success == true and .restored_task.status == "open" and .restored_task.completed_at == ""' 'Desk can restore completed tasks from the done archive'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.tasks/$task_id" 'restored task moved back to room .tasks'

forget_json=$(run_desk "action=forget-task&$auth_query&room=forest-study&task_id=$(urlencode "$task_id")")
assert_jq "$forget_json" '.success == true and .forgotten_task.status == "forgotten" and (.forgotten_tasks[]?.id == "'"$task_id"'")' 'Desk can forget a task into a separate forgotten drawer without clearing votes'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.tasks/forgotten/$task_id" 'forgotten task moved to .tasks/forgotten'

clear_votes_json=$(run_desk "action=clear-task-upvotes&$auth_query&room=forest-study&task_status=forgotten&task_id=$(urlencode "$task_id")")
assert_jq "$clear_votes_json" '.success == true and .updated_task.status == "forgotten" and .updated_task.upvotes == 0' 'Desk can explicitly clear upvotes for forgotten tasks'

remember_json=$(run_desk "action=remember-task&$auth_query&room=forest-study&task_id=$(urlencode "$task_id")")
assert_jq "$remember_json" '.success == true and .remembered_task.status == "open" and (.tasks[]?.id == "'"$task_id"'")' 'Desk can remember a forgotten task back into the active notebook area'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.tasks/$task_id" 'remembered task moved back to room .tasks'

trash_task_json=$(run_desk "action=add-task&$auth_query&destination_room=forest-study&task_text=$(urlencode "Trash me safely")")
trash_task_id=$(printf '%s' "$trash_task_json" | jq -r '.created_task.id')
trash_json=$(run_desk "action=trash-task&$auth_query&room=forest-study&task_id=$(urlencode "$trash_task_id")")
assert_jq "$trash_json" '.success == true and .trashed_task.status == "trash"' 'Desk can move a task to safe trash'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.tasks/trash/$trash_task_id" 'trashed task moved to .tasks/trash'

audit_json=$(run_desk "action=audit&$auth_query")
assert_jq "$audit_json" '.success == true and .issue_count == 0' 'Desk audit command reports clean state'

rebuild_json=$(run_desk "action=rebuild-indexes&$auth_query")
assert_jq "$rebuild_json" '.success == true and .cache == "rooms.json"' 'Desk rebuild-indexes maintenance command writes disposable cache'
assert_file_exists "$SITE_DATA/desk/.state/cache/rooms.json" 'Desk cache is stored outside canonical files'

orphans_json=$(run_desk "action=list-orphans&$auth_query")
assert_jq "$orphans_json" '.success == true and .orphan_count == 0' 'Desk list-orphans maintenance command runs'

migrate_json=$(run_desk "action=migrate-metadata&$auth_query&metadata_backend=sidecar")
assert_jq "$migrate_json" '.success == true and .target == "sidecar" and .migrated >= 1' 'Desk migrates task metadata to portable sidecars'
assert_file_exists "$SITE_DATA/desk/office/forest-study/.tasks/.meta/$task_id.json" 'metadata sidecar mirrors xattr fields after migration'

assert_file_contains "$ROOT_DIR/site/pages/desk.md" 'id="desk-page-root"' 'Desk page mounts private app root'
assert_file_contains "$ROOT_DIR/site/pages/desk.md" 'desk-page-body' 'Desk marks the body before loading private chrome'
assert_file_contains "$ROOT_DIR/site/pages/desk.md" '/static/icons/desk-favicon.svg' 'Desk page uses its custom interface favicon'
assert_file_contains "$ROOT_DIR/site/static/icons/desk-favicon.svg" '#08275e' 'Desk favicon uses the Desk blue palette'
assert_file_contains "$ROOT_DIR/site/static/icons/desk-favicon.svg" 'desk-wood' 'Desk favicon renders a woodgrain desktop motif'
assert_file_contains "$ROOT_DIR/site/pages/desk.md" '20260529-checkbox-first-line1' 'Desk page cache-busts latest Desk interface updates'
assert_file_contains "$ROOT_DIR/site/pages/desk.md" 'rel="preload" href="/static/fonts/architects-daughter-latin-400-normal.ttf"' 'Desk preloads the default handwriting font before the notepad can open'
assert_file_contains "$ROOT_DIR/site/pages/desk.md" 'rel="preload" href="/static/fonts/patrick-hand-latin-400-normal.woff2"' 'Desk preloads the alternate handwriting font before the notepad can open'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function isDeskRootHost()' 'Desk frontend detects a dedicated desk subdomain root'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "clean.split('/').filter(Boolean).map(function (part)" 'Desk room URLs encode path segments without encoding slashes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "return encoded ? '/' + encoded : '/';" 'Desk room URLs work when Desk is mounted at a subdomain root'
assert_file_contains "$ROOT_DIR/cgi/blog-desk.py" 'quote(part, safe="") for part in room_rel.split("/")' 'Desk backend emits nested room URLs with slash-separated encoded segments'
assert_file_contains "$ROOT_DIR/cgi/blog-desk.py" 'def room_url_base' 'Desk backend centralizes room URL base for subdomain migration'
desk_host_json=$(HTTP_HOST=desk.andersaamodt.com run_desk "action=state&$auth_query")
assert_jq "$desk_host_json" '.success == true and .office.url == "/"' 'Desk backend emits root office URL on desk subdomain'
assert_file_contains "$ROOT_DIR/site/includes/nav.md" 'href="https://desk.andersaamodt.com/"' 'logged-in user menu links to the Desk subdomain'
assert_file_not_contains "$ROOT_DIR/site/includes/nav.md" 'href="/desk"' 'logged-in user menu no longer links to the retired Desk path'
assert_file_exists "$ROOT_DIR/site/static/fonts/architects-daughter-latin-400-normal.ttf" 'Desk bundles a free-use print handwriting font for the todo pad'
assert_file_contains "$ROOT_DIR/site/static/fonts/OFL-architects-daughter.txt" 'SIL OPEN FONT LICENSE' 'Desk includes the bundled print handwriting font license'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'font-display: block;' 'Desk blocks handwriting fallback swapping so notepad text does not change font after opening'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-gold' 'Desk stylesheet carries gold theme tokens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-blue-deep' 'Desk stylesheet carries deep blue theme tokens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'linear-gradient(135deg, #031433 0%, #061c49 44%, #08275e 100%)' 'Desk page background remains deep blue'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '#123f3a' 'Desk ambient background avoids green lower-right tint'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '#2c315e' 'Desk ambient background avoids purple lower-right tint'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'url("/static/textures/desk-mahogany.jpg")' 'Desk uses a dark mahogany desktop rectangle texture'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-loading {' 'Desk prerender includes a styled loading desk surface'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-area: 1 / 1;' 'Desk prerendered loading surface occupies the central desk area'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '0 -24px 34px rgba(35, 12, 5, 0.28) inset' 'Desk desktop edge uses inset shadow instead of a crisp border'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'width: min(96rem, calc(100vw - clamp(1.6rem, 3.2vw, 3.6rem)));' 'Desk desktop width is fixed from the viewport instead of the open mode'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'width: min(88rem, calc(100vw' 'Desk desktop no longer uses a smaller map-only width'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'width: min(96rem, calc(100vw - clamp(0.7rem, 1.4vw, 1.6rem)));' 'Desk mode changes no longer resize the mahogany desktop'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body.desk-page-body #title-block-header' 'Desk hides the generated page title block'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'html.desk-page-document' 'Desk clamps the document itself to one viewport'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'position: fixed;' 'Desk pins the private app body to the viewport'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: calc(100dvh - 1px);' 'Desk avoids Safari one-pixel viewport rounding scrollbars'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: calc(100% - 1px);' 'Desk root stays inside the fixed app body'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-rows: minmax(0, 1fr);' 'Desk shell gives the desktop rectangle the remaining screen space'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: 100%;' 'Desk stage fills the shell content area without forcing overflow'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-shell-pad-top: clamp(4.05rem, 5.2vw, 4.85rem);' 'Desk reserves blue space above the desktop for top-right controls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-shell-pad-bottom: clamp(7rem, 8vw, 7.8rem);' 'Desk reserves blue space below the desktop for corner mode launchers'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'inset: auto clamp(1rem, 2.2vw, 2.2rem) max(0.9rem, env(safe-area-inset-bottom)) clamp(1rem, 2.2vw, 2.2rem);' 'Desk lower mode launchers stay inset from the viewport and desk edges'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-shell-pad-top: 4rem;' 'Desk keeps top control clearance on narrow screens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-shell-pad-bottom: 5.65rem;' 'Desk keeps corner launcher clearance on narrow screens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns: minmax(0, 1fr) clamp(21rem, 26vw, 30rem);' 'Desk two-panel layout gives the notepad a thinner stable balanced column'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'gap: clamp(1.6rem, 2.4vw, 2.6rem);' 'Desk two-panel layout uses a deliberate gap between map and notepad'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'padding-inline: clamp(1rem, 2vw, 1.7rem);' 'Desk two-panel layout keeps equal left and right desk gutters'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage[data-desk-stage-mode="todo"] .desk-map-panel' 'Desk two-panel layout scopes map sizing to checklist mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'width: 100%;' 'Desk two-panel map and notepad fill their balanced columns instead of forcing fixed overflow'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'overflow: hidden;' 'Desk page clamps the private surface to one viewport'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body.desk-page-body' 'Desk has a class-based page layout fallback'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) {' 'Desk scopes page-level layout to the private root'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'max-width: none;' 'Desk removes the public content-column width cap'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns: minmax(20rem, 24vw) minmax(0, 1fr);' 'Desk workbench uses a spacious widescreen layout'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage' 'Desk interface centers modes in an open stage'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-mode-dock' 'Desk has docked map, compose, and checklist launchers'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-scroll' 'Desk map has a viewport-filling map well'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-scroll {' 'Desk map well owns its overlay control positioning context'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'position: relative;' 'Desk map controls can sit over the parchment grid instead of an outer row'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage[data-desk-stage-mode="map"] .desk-map-panel' 'Desk map leaves visible desktop around the parchment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'max-height: 88%;' 'Desk map mode keeps more mahogany desk visible'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'aspect-ratio: var(--desk-map-aspect, 1.33333);' 'Desk map keeps the rendered mansion viewBox ratio when the checklist opens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '--desk-map-aspect:' 'Desk map passes the current viewBox aspect ratio to CSS sizing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '(fullViewBox.w / fullViewBox.h).toFixed(5)' 'Desk map keeps the rendered mansion aspect ratio stable across zoom levels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "mapZoomMode: 'full'" 'Desk map starts in whole-map zoom mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function closeupViewBoxForRoom(path)' 'Desk map computes a closeup viewBox around the current room footprint'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.mapZoomMode === 'room' ? closeupViewBoxForRoom(currentPath) : fullViewBox" 'Desk map toggles between whole-map and current-room closeup viewBoxes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-map-zoom' 'Desk map exposes a zoom-mode toggle button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "setMapZoomMode(state.mapZoomMode === 'room' ? 'full' : 'room');" 'Desk map zoom toggle switches between closeup and whole-map modes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-room-viewbox' 'Desk map carries the current-room zoom target on the SVG'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function animateMapViewBox' 'Desk map zoom animates the SVG viewBox directly'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'applyMapZoomToDom();' 'Desk map zoom updates the existing DOM instead of replaying mode animations'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderMapZoomIcon' 'Desk map zoom button swaps magnifying glass icons by zoom mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "zoomButton.innerHTML = renderMapZoomIcon();" 'Desk map updates the zoom icon without rerendering the whole map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.mapZoomMode = 'room';" 'Desk room navigation switches the map to closeup mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.mode !== 'todo' && state.mode !== 'compose'" 'Desk room navigation preserves an already-open notepad or compose page'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.suppressComposeAnimation = state.mode === '\''compose'\''' 'Desk room navigation keeps an open compose page steady instead of replaying its open animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var keepOpenPaper = state.mode === '\''todo'\'' || state.mode === '\''compose'\'';' 'Desk double-click travel opens the notepad only when no paper is already open'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'pointerMapPan: null' 'Desk map tracks closeup panning pointer state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.pointerMapPan = {" 'Desk map starts panning when grabbing the closeup map background'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "mapPan.svg.setAttribute('viewBox'" 'Desk map panning updates the SVG viewBox directly'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-zoom-btn' 'Desk map styles the zoom-mode toggle button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-scroll.is-closeup .desk-map-svg' 'Desk map closeup mode shows a grab cursor for panning'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns: minmax(0, 1fr) auto;' 'Desk checklist mode reserves adjacent space and does not cover the map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-panel {' 'Desk map panel has its own borderless surface styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'border: 0;' 'Desk map removes panel and parchment borders'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'shape-rendering: geometricPrecision;' 'Desk map keeps SVG geometry vector-sharp when zoomed'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'text-rendering: geometricPrecision;' 'Desk map keeps SVG text vector-sharp when zoomed'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'scale(0.91)' 'Desk side-by-side map sizing does not scale the SVG and blur labels'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'translateX(-0.75rem) scale' 'Desk map panel avoids transform scaling that blurs fonts'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'drop-shadow' 'Desk map avoids SVG rasterizing drop shadows'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn,' 'box-shadow: none !important;' 'Desk map buttons force off box shadows'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn,' '-webkit-box-shadow: none !important;' 'Desk map buttons force off Safari box shadows'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn,' 'background: transparent !important;' 'Desk map buttons are icon-only at rest'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn,' 'background-color: transparent !important;' 'Desk map buttons force off resting button surfaces'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn:hover,' 'background: #e8cf8b;' 'Desk map buttons show a surface only on hover or focus'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn:hover,' 'box-shadow: none !important;' 'Desk map buttons do not gain shadows on hover'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn:not(:hover):not(:focus-visible)' 'Desk map buttons use normal base and hover rules instead of rest-state hacks'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn,' 'transition: none;' 'Desk map button hover states are instant'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn *,' 'transition: none;' 'Desk map button icon hover states are instant'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'will-change: transform, opacity;' 'Desk map avoids persistent transform raster layers'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'overflow: hidden;' 'Desk map fits without scrollbars'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn' 'Desk map create room control is a floating plus button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'place-items: center;' 'Desk map create room plus is centered in its circle'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'appearance: none;' 'Desk map create room button avoids native offset styling'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn,' 'background: transparent !important;' 'Desk map utility icons have no square idle background'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn,' 'background-image: none !important;' 'Desk map utility icons suppress inherited button chrome while idle'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-modal-backdrop' 'Desk create room form opens in a modal'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-create-room-fields' 'Desk create-room modal uses stacked dialog fields instead of a one-line form'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'width: min(24rem, 100%);' 'Desk create-room modal has a stable compact dialog width'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'max-width: 100%;' 'Desk create-room parent selector cannot stick out of the modal'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-modal-close:hover' 'Desk create-room modal close control has an interactive state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage[data-desk-stage-mode="todo"] .desk-todo-panel {' 'Desk checklist panel is explicitly laid out for side-by-side map mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage[data-desk-stage-mode="todo"] .desk-map-panel' 'Desk checklist mode keeps the map as a stable companion panel'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'animation: none;' 'Desk checklist mode does not replay the map open animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function captureMapPanelRect()' 'Desk captures the open map rectangle before opening a side panel'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function animateMapPanelResize(beforeRect)' 'Desk animates the map from its previous rectangle into the resized layout'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "previousMode === 'map' && (nextMode === 'todo' || nextMode === 'compose')" 'Desk only runs map resize animation when opening todo or compose from an open map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'renderWithMapResize(state.data, mapResizeRect);' 'Desk renders side panels through the smooth map resize path'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "panel.style.transformOrigin = 'left top';" 'Desk map resize animation anchors from the old panel rectangle'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'duration: 360' 'Desk map resize animation has a smooth visible duration'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "panel.classList.add('is-resizing');" 'Desk map resize animation marks the map for temporary compositing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "root.classList.add('is-map-resizing');" 'Desk map resize suppresses layout transitions before the resized render'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "root.classList.remove('is-map-resizing');" 'Desk map resize clears the transition suppressor after the transform animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'translate3d(' 'Desk map resize animation uses composited transforms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "panel.style.willChange = 'transform';" 'Desk map resize animation promotes only the active resize transform'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "panel.style.willChange = '';" 'Desk map resize animation removes temporary compositor hints after completion'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-panel.is-resizing' 'Desk map resize has a scoped rendering hint class'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-shell.is-map-resizing .desk-map-panel' 'Desk map resize disables panel layout transitions before the layout changes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'transition: none;' 'Desk map resize suppresses layout-property transitions while the transform animation runs'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function finishPaperCloseToMap()' 'Desk has a shared smooth map-return path for closing paper panels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var mapResizeRect = captureMapPanelRect();' 'Desk captures the side-by-side map rectangle before returning to full map mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'renderWithMapResize(state.data, mapResizeRect);' 'Desk animates the map back into place when closing a paper panel'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'desk-todo-unfold-from-corner' 'Desk checklist unfolds from the corner notebook icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'desk-todo-fold-to-corner' 'Desk checklist folds back to the corner notebook icon on close'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage[data-desk-stage-mode="todo"] .desk-todo-panel.is-closing' 'Desk keeps the checklist mounted while its close animation runs'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'suppressTodoAnimation' 'Desk can refresh an open checklist without replaying its open animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage[data-desk-stage-mode="todo"] .desk-todo-panel.is-steady' 'Desk checklist has a steady refresh state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'desk-compose-book-open' 'Desk compose book opens from its dock icon with a continuous transform'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'desk-compose-book-close' 'Desk compose book closes back to its dock icon with a continuous transform'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '@font-face' 'Desk todo pad defines a bundled handwriting font'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'font-family: "Desk Architects Daughter"' 'Desk todo pad uses a bundled print handwriting font'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '"Kalam", "Segoe Print", "Bradley Hand"' 'Desk todo pad does not prefer the old cursive handwriting stack'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'Comic Sans MS' 'Desk todo pad does not fall back to Comic Sans'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-notebook-line: 1.9rem;' 'Desk todo pad uses a single line-height unit for text and paper rules'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-room-name-title {' 'Desk todo pad has a room heading aligned to notebook paper'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<h2 class="desk-room-name-title"><span>' 'Desk todo room heading wraps the room name for word-width underlining'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-room-name-title::after' 'Desk todo room heading does not mask the full-width notebook rule on the title row'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-room-name-title span' 'Desk todo room heading underlines only the room name text'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'border-bottom: 0.08rem solid rgba(69, 110, 185, 0.74);' 'Desk todo room heading uses one word-width underline on the first ruled line'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'box-sizing: border-box;' 'Desk todo room heading keeps the word underline inside the first notebook line'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'text-decoration: none;' 'Desk todo room heading avoids a second browser text underline'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'font-size: inherit;' 'Desk todo room heading uses the same font size as task lines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'line-height: var(--desk-notebook-line);' 'Desk todo room heading underline sits on the first ruled notebook line'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-notebook-writing-inset: 0.58rem;' 'Desk todo text starts to the right of the red notebook margin'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'calc(var(--desk-notebook-margin) + var(--desk-notebook-writing-inset))' 'Desk todo notebook content uses an inset after the vertical red line'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'repeating-linear-gradient(to bottom, #faf9f2' 'Desk checklist uses off-white ruled notebook paper'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '#f8f2d8' 'Desk checklist paper is no longer yellowish'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Math.max(10, Math.min(28' 'Desk todo pad starts with enough notebook lines for a 3x2.5 sheet'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: clamp(25rem, calc((var(--todo-lines) + 3) * var(--desk-notebook-line)), min(46.7rem, 88%));' 'Desk todo pad expands from a 3x2.5 starter ratio toward A4 proportions'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'transform: scale(1.045);' 'Desk map rooms no longer enlarge on hover or current state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '@keyframes desk-map-unfurl' 'Desk map opens with an unfurling animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '@keyframes desk-map-furl' 'Desk map closes with a furling animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.closingMode = previousMode;' 'Desk background closes keep panels mounted for their close animation and sound'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'closingMap: false' 'Desk tracks side-map closing separately from paper closing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.closingMap = (previousMode === 'todo' || previousMode === 'compose') && state.paperMapVisible;" 'Desk background closes mark side maps to close with paper panels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'renderPaperMap || renderClosingMap ? renderMapSafely(data)' 'Desk background closes keep the side map mounted during its close animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.closingMode === 'map' || state.closingMap" 'Desk side maps receive the map close animation when closing with paper'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.closingMode === 'todo'" 'Desk marks the checklist as closing instead of removing it immediately'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.closingMode === 'compose'" 'Desk marks compose as closing instead of removing it immediately'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'paperSwitchFrom' 'Desk tracks an outgoing paper panel during notepad/compose switches'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function switchPaperModeTogether(previousMode, nextMode)' 'Desk switches between notepad and composition book with simultaneous animations'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "previousMode === 'todo' || previousMode === 'compose'" 'Desk detects outgoing paper panels before direct mode switches'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.paperSwitchFrom === 'todo' ? renderTodo(data) : ''" 'Desk keeps the outgoing notepad mounted while compose opens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.paperSwitchFrom === 'compose' ? renderCompose(data) : ''" 'Desk keeps the outgoing compose paper mounted while notepad opens'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage.is-paper-switching .desk-todo-panel,' 'Desk overlays both paper panels in the same dock column during switches'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'suppressMapAnimation' 'Desk suppresses map reopening animation during room-to-room navigation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'suppressMapAnimation: true' 'Desk initial data render keeps the already-open map steady'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-panel.is-steady' 'Desk keeps the map steady when room navigation refreshes it'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-shape' 'Desk map draws rooms as architectural floorplan shapes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'fill: url(#desk-map-parchment-texture);' 'Desk map background uses a warm parchment texture'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'background-size: auto, auto;' 'Desk map well parchment leaves grid drawing to the aligned SVG layer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-svg {' 'Desk map SVG stays full-size inside the gridded parchment well'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'background: transparent;' 'Desk map SVG lets the parchment base show through outside the viewBox content'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<rect class="desk-map-grid" x="' 'Desk map draws the outside grid in SVG user-space so it aligns with room grids'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '<rect class="desk-map-parchment"' 'Desk map uses the parchment well background instead of a second SVG parchment plane'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'fill: url(#desk-map-room-paper);' 'Desk map rooms use a warmer parchment texture with grid squares'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<pattern id="desk-map-room-paper" width="28" height="28"' 'Desk room parchment pattern repeats at the same scale as the map grid'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<pattern id="desk-map-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" stroke="rgba(84,55,28,0.23)"' 'Desk map grid uses one canonical parchment grid stroke'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<pattern id="desk-map-room-paper" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="#d7b46f"></rect><path d="M 28 0 L 0 0 0 28" stroke="rgba(84,55,28,0.23)"' 'Desk room grid aligns visually with the background parchment grid'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'stroke="rgba(84,55,28,0.23)"' 'Desk room parchment pattern includes visible grid lines'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'M0 13C7 10 13 15 21 11s7-3 10-1' 'Desk room paper texture no longer overlays wavy lines on top of room grid'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'lapidarist-parchment.webp' 'Desk map avoids the speckled parchment image asset'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-current-tint' 'Desk current room no longer gets a fill tint that hides presence dimming'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'class="desk-map-room-current-tint" fill="' 'Desk current room keeps the normal room background'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'var currentTint = isCurrent' 'Desk current room state is shown by outline instead of fill'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-hover-tint' 'Desk map restores a full-area room hover highlight wash'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'class="desk-map-room-hover-tint" fill="' 'Desk room hover highlight uses the configured room color'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "class=\"desk-map-room-link' + (isCurrent ? ' is-current' : '')" 'Desk current room link is marked so hover effects can skip it'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-link:not(.is-current):hover .desk-map-room-hover-tint' 'Desk current room does not receive the hover tint effect'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-hover-tint {' 'transition: none;' 'Desk room hover fill appears instantly without a fade'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function fadeRoomHoverForTravel' 'Desk room navigation can fade the clicked hover highlight'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'fadeRoomHoverForTravel(clickedRoom);' 'Desk room navigation starts the hover fade before marking the room current'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-link.is-travel-fading .desk-map-room-hover-tint,' 'transition: opacity 220ms ease;' 'Desk clicked room hover tint fades during navigation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke-width: 7.8;' 'Desk room hover outlines are thick enough to read over adjacent rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-grass' 'Desk map draws outdoor spaces with a grassy texture fill'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-room-grass-edge-soft' 'Desk outdoor areas no longer render a separate edge gradient'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-grass-edge-core' 'Desk outdoor areas rely on the shared greenbelt band'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-gradient-edge' 'Desk greenbelt uses real directional gradient geometry at the outer edge'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'function outdoorFringePath' 'Desk outdoor rooms do not use a separate fringe path'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'greenbeltCells.push' 'Desk outdoor and indoor occupied cells share one greenbelt perimeter'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'greenbeltOccupied[key] = owner;' 'Desk shared greenbelt tracks the whole occupied map footprint'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<path class="desk-map-greenbelt-strip desk-map-greenbelt-band" d="' 'Desk outdoor rooms use the same opaque greenbelt band class as the building perimeter'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'outdoorBackgroundShapes' 'Desk renders outdoor greenery below rooms and walls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<g class="desk-map-room-layer">' 'Desk keeps room hover ordering inside a dedicated SVG room layer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<g class="desk-map-door-layer">' 'Desk renders doors in a separate top SVG layer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door-layer' 'Desk door layer ignores pointer events so hover stays on rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-outdoor-hit' 'Desk outdoor rooms have a foreground hover outline'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'fill: rgba(255, 255, 255, 0.001);' 'Desk outdoor room hit paths are pickable for room drops without visible fill'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'pointer-events: all;' 'Desk outdoor room hit paths participate reliably in pointer drop targeting'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'outdoorExposedOutlinePath' 'Desk outdoor rooms draw only exposed passive wall edges'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-link:not(.is-current):hover .desk-map-room-outdoor-hit' 'Desk hovering a non-current outdoor room highlights its contour line'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'fill="#d7b46f"' 'Desk map room parchment texture has a warmer room base'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'rgba(84,55,28,0.23)' 'Desk map room parchment texture uses the shared grid line color'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door' 'Desk map marks doors on shared room walls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door-gap' 'Desk map door symbol covers the wall at the opening'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door-leaf' 'Desk map door symbol shows the open door leaf'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door-swing' 'Desk map door symbol uses a dotted swing arc'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-wall-adornment' 'Desk map omits short exterior corner tick marks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-secret-passage' 'Desk map draws secret passages between rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke-dasharray: 2 13;' 'Desk secret passages use a thick dotted passage line'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-secret-door-label' 'Desk secret passage doors are marked with an S'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-passage-btn' 'Desk map exposes a secret passage control'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-passage-btn:hover .desk-passage-book.middle' 'Desk secret passage trigger slides the middle book on hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'translateX(3.2px) scaleX(1.28) scaleY(1.08)' 'Desk secret passage book pulls straight outward on hover'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'skewY(-7deg)' 'Desk secret passage book hover does not slant'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-blueprint-sheet' 'Desk map properties button uses a blueprint-style icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-props-btn svg' 'Desk map properties button has dedicated icon sizing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-blueprint-grid' 'Desk map properties blueprint icon draws internal grid lines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-create-btn:hover' 'Desk create-room map corner button has a scoped hover state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-passage-btn:hover' 'Desk secret-passage map corner button has a scoped hover state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-props-btn:hover' 'Desk properties map corner button has a scoped hover state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'background: #e8cf8b;' 'Desk map corner buttons use a solid light map-color hover background'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'width: 2.55rem;' 'Desk map corner buttons use a smaller standardized button size'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'right: calc(clamp(0.95rem, 1.6vw, 1.3rem) + 2.92rem);' 'Desk top-right map buttons keep proper spacing between controls'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-zoom-btn.is-active' 'Desk active map buttons do not show a persistent background'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'box-shadow: none !important;' 'Desk map corner buttons remove hover drop shadows'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22) !important;' 'Desk map corner buttons do not regain hover drop shadows'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'transform: translateY(-2px);' 'Desk map corner buttons do not lift on hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) nav.site-nav .nav-center' 'Desk hides public navbar page links'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) footer.site-footer' 'Desk hides the public site footer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) nav.site-nav > .nav-right' 'Desk keeps shared auth controls as a top-right dock'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'align-items: flex-start !important;' 'Desk top-right auth menu aligns to the status selector top edge'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'body:has(#desk-page-root) nav.site-nav .nav-menu-btn' 'Desk restyles the top-right three-dot menu button separately from login'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'background: rgba(3, 20, 51, 0.72) !important;' 'Desk three-dot menu button uses the same dark surface as the status selector'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: 2.6rem !important;' 'Desk three-dot menu button matches the status selector height'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-settings-toggle' 'Desk injects a top-right settings gear button before the user menu'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '/static/icons/settings-gear.svg' 'Desk settings button uses the shared Wizardry stock gear icon'
assert_file_contains "$ROOT_DIR/site/static/icons/settings-gear.svg" 'M14 8.3V5.73' 'Desk carries the stock Wizardry settings gear asset'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-settings-panel' 'Desk settings controls live in their own gear menu panel'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-settings-menu-btn' 'Desk settings gear is styled alongside the top-right menu button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-status-btn svg' 'Desk online status controls use icons instead of text labels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-status-btn[aria-pressed="true"]' 'Desk active status icon has a selected state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function statusTitle' 'Desk status icons explain what each icon does'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'title="' 'Desk status icons use native system tooltips'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-tooltip="' 'Desk status icons avoid duplicate custom tooltips'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-status-btn::after' 'Desk status icons avoid custom tooltip overlays'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'border-radius: 10px;' 'Desk status icons sit in one unified squarish pill control'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'z-index: 1602;' 'Desk status controls sit above the retained auth chrome and its dropdown layers'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-chrome-controls' 'Desk status controls live in a dedicated fixed chrome island'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'pointer-events: none;' 'Desk chrome island does not create a transparent click-blocking slab'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'pointer-events: auto;' 'Desk status pill remains the explicit interactive target'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-shell[data-busy="true"] .desk-status-btn' 'Desk status buttons stay clickable during unrelated in-flight Desk requests'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function handleStatusClick' 'Desk handles status changes before background and map click logic'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.pendingStatus' 'Desk status changes update optimistically while the request is in flight'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "{ silentBusy: true }" 'Desk status changes do not enter the global busy-disabled control state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-status-btn:hover' 'Desk status buttons have stable hover hit targets'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'transform: none;' 'Desk status buttons do not jump on hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.suppressMapAnimation = true;' 'Desk status changes keep an open map steady'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'is already selected.' 'Desk clicking the current status gives feedback instead of feeling broken'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'messageTimer = window.setTimeout' 'Desk toasts dismiss themselves after a short delay'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-message.is-leaving' 'Desk toasts fade out before disappearing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'background: #061c49;' 'Desk toasts use an opaque deep-blue panel instead of transparent wood'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-menu-settings' 'Desk injects private settings into the top-right user menu'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-menu-heading' 'Desk menu settings have a visible section heading'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '/cgi/blog-desk' 'Desk frontend talks to private API'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function storageGet(key)' 'Desk frontend tolerates restricted localStorage'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "storageGet('session_token')" 'Desk auth reads session token through guarded storage'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomFromLocation()' 'Desk frontend can parse clean room URLs'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" "path.indexOf('/desk/') === 0" 'Desk frontend no longer treats retired /desk paths as room URLs'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "url.searchParams.get('room')" 'Desk frontend keeps legacy query-room fallback parsing'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" "return encoded ? '/desk/' + encoded : '/desk';" 'Desk frontend no longer writes retired /desk URLs'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" "'/desk?room='" 'Desk frontend no longer writes query-string room URLs'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'slugifyForMatch' 'Desk frontend no longer rewrites missing room URLs with fuzzy slug matches'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "showGate('That Desk room does not exist.')" 'Desk direct bad room URLs fail clearly instead of refresh-rewriting'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk_room_presence_v1' 'Desk frontend stores ambient room presence locally'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk_flashlight_strength_v1' 'Desk frontend stores the map flashlight strength locally'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var flashlightSteps = [' 'Desk flashlight control uses graduated presence timing steps'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "{ label: '5m'" 'Desk flashlight steps include a five-minute difficult setting'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "{ label: '1d'" 'Desk flashlight steps include a one-day easy setting'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "storageGet('desk_flashlight_strength_v1') || 4" 'Desk flashlight defaults to a visibly responsive middle strength'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderFlashlightControl' 'Desk map renders a flashlight strength slider'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-flashlight-strength' 'Desk flashlight strength slider is wired to the frontend'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function updatePresence' 'Desk frontend continuously updates room presence levels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'strength.fadeMs' 'Desk presence fade rate follows the flashlight strength'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'strength.buildMs' 'Desk presence build rate follows the flashlight strength'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "{ label: '5m', fadeMs: 5 * 60 * 1000, buildMs: 20 * 1000 }" 'Desk shortest flashlight setting lights up fastest and fades fastest'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "{ label: '1d', fadeMs: 24 * 60 * 60 * 1000, buildMs: 16 * 60 * 1000 }" 'Desk longest flashlight setting lights up slowest and fades slowest'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Math.min(5 * 60 * 1000' 'Desk presence keeps several minutes of elapsed room time when timers are throttled'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'if (room === currentRoom)' 'Desk current room does not fade while it is actively occupied'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function dimPresenceForRoom' 'Desk frontend immediately soft-dims a room when leaving'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function applyPresenceValues' 'Desk frontend applies presence values before fetching the next room'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-room-presence' 'Desk map updates room light gradients from ambient presence'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-room-dim' 'Desk map renders clipped dimming layers for low-presence rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderRoomWallLights' 'Desk map renders localized wall lights from room footprints'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomWallLightPoints' 'Desk map places wall lights from room wall segments'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderRoomLightGradientDefs' 'Desk map defines one floor gradient per wall light source'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-room-light-gradient' 'Desk map lights indoor floors with clipped per-lamp gradients'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomLampLightRadius' 'Desk lamps use one fixed local light radius'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<circle class="desk-map-room-light-gradient"' 'Desk lamp gradients cover local circular areas instead of whole-room rects'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '<rect class="desk-map-room-light-gradient"' 'Desk lamp gradients no longer cover every room with full overlay rectangles'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'stop-opacity="0"></stop></radialGradient>' 'Desk lamp gradients fade fully out at their fixed radius'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'segmentHasDoor(from, to, doorSegments)' 'Desk wall lamps skip wall segments that contain doors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'segment.start + (segment.end - segment.start) / 2' 'Desk wall lamps sit at the center of their nearest straight wall segment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "if (segment.side === 'north') y += 2.4;" 'Desk wall lamps attach their flat side directly to the wall'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'var count = Math.max(1, Math.round(length / 96));' 'Desk wall lamps are no longer evenly re-spaced along merged runs'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function wallSconcePath' 'Desk wall lamps render as flat-sided wall sconces'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var tip = 4.9;' 'Desk wall sconces are shorter and less tall on the map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<path class="desk-map-wall-light"' 'Desk visible lamp markers use sconce paths instead of bordered dots'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-wall-light-side' 'Desk wall lamp markers expose side metadata for geometry verification'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-door-spill-fan' 'Desk map lets brighter rooms spill fan-shaped light through doorway CSS'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function doorFanPath' 'Desk map renders door light spill as directional fan shapes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Math.abs(fromPresence - toPresence)' 'Desk doorway light spill follows the presence contrast between connected rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-light-gradients' 'Desk map styles ambient indoor light as clipped lamp gradients'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-dim' 'Desk map darkens rooms that have low recent presence'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-wall-light' 'Desk map styles localized wall lights'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door-spill-fan' 'Desk map styles doorway light spill without changing the light model'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'opacity: calc(var(--presence) * 0.72);' 'Desk map hides lamp dots completely in fully dark rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke: none;' 'Desk wall lamps do not draw a border'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-wall-light-halo' 'Desk lamp markers do not draw a separate oval halo around the center dot'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'opacity: calc(0.66 - var(--presence) * 0.24);' 'Desk map keeps indoor rooms shaded so lamp gradients provide the visible light'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'opacity: calc(var(--presence) * 0.86);' 'Desk lamp gradients carry the room brightening'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-presence.is-outdoor' 'Desk map gives outdoor presence a sunnier glow'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-flashlight' 'Desk map has a bottom-left flashlight strength control'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-flashlight-steps' 'Desk flashlight slider shows graduated time labels while active'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'repeating-linear-gradient(90deg' 'Desk flashlight slider has stepped map-ink graduations'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-room-light-gradient-' 'Desk indoor presence uses localized light source gradients'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<linearGradient id="desk-map-presence-glow-outdoor"' 'Desk outdoor presence uses a broad wash instead of circular blobs'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '<radialGradient id="desk-map-presence-glow-outdoor"' 'Desk outdoor presence avoids big circular glow patches'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<clipPath id="' 'Desk light gradients are clipped to room walls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'clip-path="url(#' 'Desk light gradients fill clipped room rectangles'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var overlayPad = Math.max(unitW, unitH);' 'Desk light and dim overlays extend across decorative wall contours'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var overlayX = x - overlayPad;' 'Desk clipped room overlays start beyond the plain grid-cell bounds'
overlay_x_count=$(grep -F 'var overlayX = x - overlayPad;' "$ROOT_DIR/site/static/desk-page.js" | wc -l | tr -d '[:space:]')
if [ "$overlay_x_count" -ge 2 ]; then
  pass
else
  fail 'Desk clipped overlay coordinates are defined in both map render passes'
fi
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '<ellipse class="desk-map-room-presence' 'Desk presence no longer renders visible nested ovals'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'presence clock' 'Desk presence does not render clock text'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function mansionLayout(rooms)' 'Desk frontend lays out rooms as a deterministic mansion map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "originY: 4" 'Desk root room starts lower on the mansion plan like a grand entrance'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomKind(room)' 'Desk frontend distinguishes indoor and outdoor rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomTopology(room)' 'Desk frontend distinguishes connected rooms from contained subdivisions'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomIsOutdoor(room)' 'Desk frontend can test outdoor room metadata'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'childrenByParent' 'Desk layout groups rooms by semantic parent before placing wings'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function assignContainedChildren(parentPath, parentRect)' 'Desk layout can subdivide a room into contained child shares'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function containedChildrenForParent(parentPath)' 'Desk layout treats contained as a child-room relationship'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'roomTopology(room) === '\''contained'\''' 'Desk child rooms marked contained subdivide their parent room'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function connectedChildrenForParent(parentPath)' 'Desk layout keeps connected child rooms attached outside the parent'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function containedShareCount(parentPath)' 'Desk contained-room layout sizes parents for nested subdivision trees'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'return 1 + containedChildrenForParent(parentPath).reduce' 'Desk contained-room layout reserves one share for the parent room itself'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function containedGridRect(parentPath, totalShares)' 'Desk contained-room layout expands parent rooms to fit all subrooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Math.floor(parent.x || 0)' 'Desk contained-room subdivisions stay on the map grid'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function containedShareBoxes(rect, items)' 'Desk contained-room subdivisions are contiguous grid rectangles'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'containedSelf: true' 'Desk parent rooms keep one visible share when subdivided by contained child rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'layout[parentPath].x = container.x;' 'Desk contained parent rooms render as containers around their subdivisions'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'layout[parentPath].originX = selfBox.x + selfBox.w / 2 - 0.5;' 'Desk contained parent room labels sit in the parent self share'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'layout[parentPath].containedSelf = true;' 'Desk subdivided parent layout cells render with contained-share geometry'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'containedIn: parentPath' 'Desk contained child rooms remember their parent subdivision'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'containedRoomPath(roomCell, unitW, unitH)' 'Desk contained rooms render as subdivisions inside the parent footprint'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function isContainedRoomCell(roomCell)' 'Desk contained room detection works even when the parent is Office'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "hasOwnProperty.call(roomCell, 'containedIn')" 'Desk treats Office-contained rooms as contained despite an empty parent path'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function attachPoint(parentPath, direction, index, forcedSide)' 'Desk layout creates deterministic parent wing attachment points'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function primaryWingDirection(parentPath)' 'Desk layout gives each parent one straight wing spine'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function manorEntranceDirection(index)' 'Desk layout treats the office as a lower-center manor entrance'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "['west', 'east', 'north', 'north', 'west', 'east', 'north', 'north']" 'Desk root room balances first wings left and right while reserving the south entrance edge'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function directionNamesForParent(parentPath)' 'Desk layout uses root-specific direction choices before ordinary room placement'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function preferredSiblingSlot(parentPath, index)' 'Desk layout assigns sibling rooms to explicit mirrored attachment slots'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function balancedWingDirection(parentPath, index)' 'Desk layout balances sibling wings across directions'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomBalanceScore(x, y)' 'Desk layout scores fallback placements for left/right and top/bottom balance'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function rootCenteredSpreadScore(x, y)' 'Desk layout penalizes mansion wings that drift too far from the root hall'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Math.max(0, dx - 4) * 24' 'Desk layout discourages arms that would force the mansion off the map edge'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function doorlessWallPenalty(cells, allowedOwners)' 'Desk layout penalizes doorless wall sharing before accepting crowded placements'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'penalty += 48;' 'Desk layout strongly avoids doorless wall sharing between sibling rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function outdoorWrapPenalty(cells, roomPath, allowedOwners)' 'Desk layout keeps indoor rooms from wrapping around unrelated outdoor rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "roomIsOutdoor(roomsByPath[String(owner || '')])" 'Desk layout detects outdoor neighbors while scoring indoor placement candidates'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'outdoorWrapPenalty(corridor.concat([child]), roomPath, [parentPath])' 'Desk wing placement penalizes corridors that hug unrelated outdoor rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Math.abs(centerX) * 4' 'Desk layout penalizes one-sided horizontal spread around the office'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Math.abs(centerY + 0.35)' 'Desk layout biases the office below the map center like a manor entrance'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Math.max(0, height - width * 0.72)' 'Desk layout penalizes tall map shapes more than wide mansion plans'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function symmetricCorridorCells(parentPath, direction, corridor)' 'Desk parent room footprints mirror corridor arms toward symmetric T or cross shapes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function canClaimCorridorCells(cells, parentPath, childPoint)' 'Desk symmetric parent hall cells avoid claiming child room cells'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var symmetricCorridor = symmetricCorridorCells(parentPath, direction, attach.corridor);' 'Desk wing placement tries mirrored parent corridors before one-sided arms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'symmetricOpen ? symmetricCorridor : attach.corridor' 'Desk wing placement falls back only when a mirrored wing is blocked'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function symmetryFallbackPenalty(parentPath)' 'Desk layout penalizes L-shaped fallback harder for outdoor parent rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var directionPenalty = direction.name === preferred.direction.name ? -96 : 420 + orderIndex * 18;' 'Desk layout makes sibling symmetry expensive to violate'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var sidePenalty = attach.side === preferred.side ? 0 : 120;' 'Desk layout keeps sibling rooms on their mirrored side of a wing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'symmetricOpen ? -42 : symmetryFallbackPenalty(parentPath)' 'Desk layout strongly prefers paired symmetrical wings over L-shaped rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var maxWingAlong = 4;' 'Desk layout caps wing extrusion while allowing rooms to attach at wing ends'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function compactAttachment(parentPath, index, roomPath)' 'Desk layout falls back to compact adjacent placement for crowded parent rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function findCompactAttachment(parentPath, index, roomPath)' 'Desk layout retries compact placement before leaving a room unplaced'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function wingAttachment(parentPath, index, roomPath)' 'Desk layout grows crowded parent rooms one grid cell at a time instead of stretching them into corridors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var wing = findWingAttachment(parentPath, index, roomPath);' 'Desk layout tries wing placement before compact adjacent fallback'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var compact = findCompactAttachment(parentPath, index, roomPath);' 'Desk layout keeps compact adjacent placement as a fallback'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Math.min(maxWingAlong, Math.floor(index / 2) + 2)' 'Desk sibling rooms alternate along a bounded grid-fitted wing spine'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'forcedSide === -1 || forcedSide === 1' 'Desk sibling placement can force mirrored left/right wing attachment sides'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var unitW = 168;' 'Desk room cells align to the 28px map grid horizontally'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var unitH = 112;' 'Desk room cells align to the 28px map grid vertically'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var rootCenterX = (Number.isFinite(rootCell.originX)' 'Desk map viewport locks the Office origin to the visual center'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var halfMapWidth = Math.max(rootCenterX - minX, maxX - rootCenterX);' 'Desk map viewport grows symmetrically left and right around the root'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var desiredRootYRatio = 0.62;' 'Desk map viewport places the Office lower without excessive empty parchment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Math.min(biasedTopSpan, actualTopSpan + 2)' 'Desk map limits extra top whitespace while keeping the root entrance biased low'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var viewX = (rootCenterX - halfMapWidth) * unitW - pad;' 'Desk map viewBox is centered on the root entrance hall'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var pad = 70;' 'Desk map uses tighter full-map padding so the mansion fills the parchment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'corridor.push' 'Desk layout builds continuous parent-owned hallway cells'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function cellFreeOrOwned' 'Desk layout lets parent hallways extend through their own footprint without colliding'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'child_side' 'Desk layout records the child side for exact shared-wall door geometry'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function footprintContourPath' 'Desk map renders multi-cell room and wing footprints as one connected room shape'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var labelX = (Number.isFinite(origin.originX)' 'Desk map labels anchor to the room origin cell instead of a parent wing bounding box'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var labelY = (Number.isFinite(origin.originY)' 'Desk map labels avoid making child rooms look nested inside parent room labels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'labelX - unitW / 2 + 18' 'Desk map rename input stays on the room origin cell instead of spanning a parent footprint'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var renderRooms = rooms.filter' 'Desk map skips any unplaced room instead of crashing on an undefined footprint'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function contourSegmentPath' 'Desk map restores decorative angled contour juts to grid-fitted exterior building walls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function isOpenCell' 'Desk exterior wall contouring checks both sides of a boundary segment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'outsideDirection = { x: -1, y: 0 };' 'Desk west-facing exterior walls receive outward contours even when traced top-to-bottom'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'outsideDirection = { x: 1, y: 0 };' 'Desk east-facing exterior walls receive outward contours independent of path direction'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'path += segmentPath(finalPoint, firstPoint, points.length);' 'Desk explicitly contours the closing footprint edge so west walls are not left straight'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'outX = outward && Number.isFinite(outward.x)' 'Desk vertical wall contours push toward the actual outside side'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" ':grid-wall-deep:' 'Desk exterior wall contours restore the original two-depth bay variation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'dx * 0.24' 'Desk horizontal wall contours use the original flat-faced bay proportions'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'dx * 0.72' 'Desk horizontal wall contours include a second deeper flat-faced bay'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'dy * 0.28' 'Desk vertical wall contours use flat-faced side bay proportions instead of pointy peaks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'dy * 0.9' 'Desk vertical wall contours return to the baseline after the deeper flat side bay'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'buildingOccupied' 'Desk treats outdoor rooms as outside the building for outer wall contouring'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'renderGreenbelt(greenbeltCells, greenbeltOccupied' 'Desk greenbelt is continuous around indoor buildings and outdoor areas'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "footprintContourPath(footprint, unitW, unitH, path || 'office', false, null, roomDoorSegments)" 'Desk outdoor rooms use straight non-building footprint paths'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "footprintContourPath(footprint, unitW, unitH, path || 'office', true, buildingOccupied, roomDoorSegments)" 'Desk ornaments only indoor building walls facing outside or outdoor rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function outdoorExposedOutlinePath' 'Desk suppresses outdoor room passive borders where the building wall covers them'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "return roomIsOutdoor(roomsByPath[String(owner || '')]);" 'Desk outdoor passive outlines only draw against open air or other outdoor rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var roomPassiveOutlineShape = isOutdoor' 'Desk uses a different passive outline from the full hover outline for outdoor rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-outdoor-hit {' 'Desk outdoor hit path remains clickable without drawing covered borders'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke: transparent;' 'Desk outdoor hit path does not draw a normal-state border over building walls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function segmentHasDoor' 'Desk wall contouring knows when a door sits on a wall segment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'ornate && isBuildingExterior && !hasDoor' 'Desk suppresses decorative wall contours where a door is drawn'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function architecturalRoomPath' 'Desk map rooms form the building outline with architectural wall shapes'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderOutdoorEdgeFades' 'Desk outdoor rooms no longer render parchment edge gradients'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderGreenbelt' 'Desk map renders a connected greenbelt around the mansion'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-strip' 'Desk map traces the greenbelt as one continuous band around the exterior'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-strip desk-map-greenbelt-fade far' 'Desk greenbelt no longer fakes the edge with a far transparent belt'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-strip desk-map-greenbelt-fade mid' 'Desk greenbelt no longer fakes the edge with a middle transparent belt'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-strip desk-map-greenbelt-fade near' 'Desk greenbelt no longer fakes the edge with a near transparent belt'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'gradientEdges = edges.map(gradientEdge).join' 'Desk greenbelt builds the outer fade from exterior edge geometry'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'gradientCorners = Object.keys(corners).map' 'Desk greenbelt fills outside corners with radial gradient geometry'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-strip desk-map-greenbelt-band' 'Desk greenbelt renders an opaque main band on the same perimeter path'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var greenbeltPaths = edges.map(function (edge)' 'Desk greenbelt uses a clean plain perimeter instead of architectural wall contours'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "' L ' + (edge.b.x * unitW)" 'Desk greenbelt path uses straight perimeter segments'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke-width: 68;' 'Desk greenbelt restores the clean opaque main band'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-greenbelt-gradient-edge' 'Desk greenbelt has real outer-edge gradient geometry'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-greenbelt-gradient-corner' 'Desk greenbelt has real corner gradient geometry'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'opacity: 1;' 'Desk greenbelt main band is opaque instead of entirely translucent'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-greenbelt-fade' 'Desk greenbelt CSS no longer defines fake transparent belt strokes'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'filter: url(#desk-map-greenery-blur);' 'Desk greenbelt outer edge fade does not use blur that creates cloud-like shapes'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'stdDeviation=' 'Desk greenbelt outer edge fade avoids SVG blur blobs'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke: #9fac63;' 'Desk greenbelt uses a warmer spring yellow-green'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'fill="#9fac63"' 'Desk outdoor grass texture matches the warmer spring greenbelt color'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke-linejoin: round;' 'Desk greenery has rounded map-like corners'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-meadow' 'Desk greenbelt no longer uses oval meadow blobs'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-greenbelt-wash' 'Desk greenbelt no longer adds broad green wash blocks'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'stripRect' 'Desk greenbelt no longer builds sloppy overlapping rectangle strips'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'fill: #9fac63;' 'Desk outdoor areas use the same solid color as the greenbelt'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'opacity: 1;' 'Desk outdoor areas are opaque so they meet the greenbelt seamlessly'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'M0 42C18 35 34 37 50 28S66 16 72 18' 'Desk grass texture no longer overlays lined wave strokes'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'circle cx="54" cy="18"' 'Desk grass texture no longer uses circular shrub blobs'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-room-grass' 'Desk map renders outdoor spaces with grass texture beneath muted walls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-greenbelt-strip' 'Desk map has a perimeter-following greenbelt layer behind the rooms'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-greenbelt-wash' 'Desk map omits broad greenbelt wash rectangles'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderDoor' 'Desk map renders doors between rooms that share a side'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderDoorGlyph' 'Desk shares ordinary and secret passage door glyph rendering'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var renderDoorwayOnly = roomIsOutdoor(fromRoom) && roomIsOutdoor(toRoom);' 'Desk outdoor-to-outdoor connections render as doorway openings instead of doors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "doorwayOnly ? 'desk-map-doorway-gap' : 'desk-map-door-gap'" 'Desk outdoor-to-outdoor doorway keeps the wall opening but omits door hardware'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "doorwayOnly ? '' : '<path class=\"desk-map-door-leaf\"" 'Desk outdoor-to-outdoor doorway omits the ajar door leaf'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "doorwayOnly ? '' : '<path class=\"desk-map-door-leaf\"" 'Desk outdoor-to-outdoor doorway omits the dotted door swing arc'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-doorway-gap' 'Desk outdoor-to-outdoor doorway covers the shared wall with grass instead of door color'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderRootEntranceDoor' 'Desk map renders a root double-door entrance on the lower office wall'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-entrance-door' 'Desk root entrance uses a distinct double-door glyph'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function rootEntranceDoorSegment' 'Desk contouring treats the root entrance as a real door gap'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'lastEnteredDoor' 'Desk tracks the room doorway used for the last map travel'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function isLastEnteredDoor' 'Desk map can mark the last entered doorway'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var open = 13;' 'Desk doors use a smaller wall opening'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var leaf = 24;' 'Desk door leaves use matched swing geometry'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "side === 'east' ? 1 : -1" 'Desk east-west doors swing into the child room side'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "side === 'south' ? 1 : -1" 'Desk north-south doors swing into the child room side'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-door-gap' 'Desk map renders a wall-opening stroke for doors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-door-leaf' 'Desk map renders an open door leaf'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-door-swing' 'Desk map renders a dotted door swing arc'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-door.is-last-entered .desk-map-door-gap' 'Desk highlights the wall segment of the door last entered through'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke: #624527;' 'Desk default door wall gaps use a visible brown door color'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke-width: 5.8;' 'Desk door wall gaps are thicker than room wall strokes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke: rgba(82, 68, 54, 0.58);' 'Desk ajar door leaves use a darker warm grey-brown'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke-width: 2.9;' 'Desk ajar door leaves are slightly thicker'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke: rgba(82, 68, 54, 0.52);' 'Desk dotted door swing arcs use a darker warm grey-brown'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'stroke-width: 2.25;' 'Desk dotted door swing arcs are slightly thicker'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function secretDoorPoint' 'Desk secret passages choose door points on room edges'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderSecretPassageParts' 'Desk secret passages render door-to-door lines plus endpoint doors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-secret-door-label' 'Desk secret passage door labels render over the door line'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-room-paper' 'Desk defines a warmer gridded parchment texture for rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-passage-book-cover' 'Desk secret passage trigger uses a book icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-passage-books' 'Desk secret passage trigger uses a three-book icon'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'roomWallAdornments' 'Desk map no longer draws corner wall adornment ticks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var visibleCount = Number(room.visible_task_count || 0);' 'Desk map room numbers use only above-threshold task counts'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'visibleCount > 0' 'Desk map hides room numbers when no above-threshold tasks are present'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" "text-anchor=\"middle\">+'" 'Desk map room above-threshold counts do not show a plus prefix'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'font-size: max(16px, 0.9rem);' 'Desk map room above-threshold count has a larger minimum font size'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" " + ' / ' +" 'Desk map room numbers omit the sleeping-task slash count'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderSecretPassage' 'Desk map renders explicit secret passages'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'attachedTo' 'Desk map layout connects each room to an already placed room'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-building' 'Desk map does not draw a separate outer house outline'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-mode="map"' 'Desk frontend exposes map mode launcher'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "root.addEventListener('dblclick'" 'Desk map rooms handle double-click room opening'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "if (event.target.closest('.desk-map-room-title'))" 'Desk map room title clicks are reserved for inline rename double-clicks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "beginMapRoomRename(roomTitle.getAttribute('data-desk-room-title') || '');" 'Desk map room title double-clicks open inline rename for any room'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'lastMapRoomTravel: null' 'Desk map remembers a just-clicked room so double-click can still open its notepad'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'doubleClickedAfterTravel' 'Desk map double-click opens the notepad after the first click has already traveled'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'if (roomPath === state.currentRoom && !doubleClickedAfterTravel)' 'Desk map room double-clicks ignore only ordinary current-room repeats'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'if (clickedRoom === state.currentRoom)' 'Desk map room clicks ignore the current room instead of traveling to it'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.mode = 'todo';" 'Desk room double-click opens the room notepad'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'roomPath !== state.currentRoom' 'Desk room double-click navigates when opening another room notepad'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function statusIcon(value)' 'Desk renders online, quiet, and away as status icons'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'online; allow sparse visitor calls' 'Desk Online tooltip explains visitor calls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'present, but visitor calls stay quiet' 'Desk Quiet tooltip explains that presence remains but calls are suppressed'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'away; visitors cannot call' 'Desk Away tooltip explains unavailable status'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'aria-label="' 'Desk status icon controls keep accessible labels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function syncDeskMenuSettings()' 'Desk moves threshold settings into the top-right user menu'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-menu-settings' 'Desk settings menu block is idempotently injected'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<h2 class="desk-menu-heading">Settings</h2>' 'Desk settings menu includes a Settings subheading'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "getElementById('nav-menu-desk-link')" 'Desk removes the redundant Desk link from its user menu'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'text-transform: none;' 'Desk menu Settings heading keeps normal casing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<span>Surface at</span>' 'Desk threshold control has a visible field label'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<span>Handwriting font</span>' 'Desk settings include a handwriting font field label'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function handwritingFontOptions()' 'Desk exposes a curated handwriting font option list'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "value: 'architects'" 'Desk includes Architects Daughter as a handwriting font option'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "value: 'comic'" 'Desk handwriting font selector includes seven local/system options'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk_handwriting_font_v1' 'Desk persists the selected handwriting font'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'applyHandwritingFont();'$'\n''      root.dataset.roomTone' 'Desk applies the saved handwriting font before rendering the notepad DOM'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-handwriting-font' 'Desk handwriting font is scoped through a CSS variable'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'font-family: var(--desk-handwriting-font);' 'Desk handwriting selector only targets handwriting surfaces'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "document.addEventListener('change'" 'Desk threshold menu changes are handled outside the app root'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function closeMapMode()' 'Desk map launcher can close the open map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function closeOpenMode()' 'Desk background clicks can close the open mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function isDeskBackgroundClick(event)' 'Desk detects background clicks without closing interactive controls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "target.closest && target.closest('.desk-stage')" 'Desk clicks on the mahogany desk do not close open modes'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" "Boolean(target.closest('.desk-map-scroll'))" 'Desk clicks on the map parchment no longer count as background clicks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.mode = 'closed'" 'Desk can leave the central stage empty after closing the map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-mode="todo"' 'Desk frontend exposes checklist mode launcher'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-mode="compose"' 'Desk frontend exposes compose mode launcher'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function isMapVisibleMode(mode)' 'Desk has one predicate for modes that render the map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "mode === 'map' || state.closingMap || ((mode === 'todo' || mode === 'compose') && state.paperMapVisible)" 'Desk treats side maps as visible while they close with paper panels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function shouldRenderMapWithPaper()' 'Desk has one predicate for paper modes that keep the side map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'isMapVisibleMode(state.mode) ?' 'Desk map launcher stays hidden whenever the map is visible'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.mode === 'compose' ? ''" 'Desk composition book launcher leaves the corner when compose is open'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function closeTodoMode()' 'Desk checklist close has a dedicated path that preserves the map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function closeComposeMode()' 'Desk composition book launcher can close the open composition book'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var returnToMap = state.paperMapVisible;' 'Desk paper close only returns to the map when that paper kept the side map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.mode = 'map';" 'Desk paper close can return to map mode instead of closing the whole stage'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'closeTodoMode();' 'Desk checklist X uses the map-preserving close path'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "requestedMode === 'compose' && state.mode === 'compose'" 'Desk composition book dock button toggles closed when compose is open'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'closeComposeMode();' 'Desk compose dock close uses the map-preserving close path'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-compose-book-icon' 'Desk compose launcher uses a composition book icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-compose-marble' 'Desk compose launcher includes a black-and-white composition pattern'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderCompositionBookIcon()' 'Desk compose launcher renders a dedicated classic composition-book SVG'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-compose-marble-vein heavy' 'Desk composition book icon uses dense agate-style marble veins'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-compose-book-spine-stitch' 'Desk composition book icon includes a dark tape-bound spine'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-compose-book-label' 'Desk compose launcher renders a classic composition book label'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-marble-vein.heavy' 'Desk composition book icon styles heavier black marble veins'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-marble-speck.dark' 'Desk composition book icon includes irregular speckling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-mode-compose .desk-compose-book-icon' 'Desk compose launcher centers its composition-book icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-mode-compose {' 'Desk compose launcher has dedicated artwork-only positioning'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'background: transparent;' 'Desk compose launcher removes the background circle'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'left: calc(50% - 2.05rem);' 'Desk compose launcher is centered without transform-based positioning'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-mode-compose.is-active' 'Desk compose launcher has an explicit stable active state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "(renderPaperMap || renderClosingMap ? renderMapSafely(data) : '') + (isPaperSwitching && state.paperSwitchFrom === 'todo' ? renderTodo(data) : '') + renderCompose(data)" 'Desk compose mode mounts the map only when visible or closing with compose'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-stage.is-paper-only[data-desk-stage-mode="compose"]' 'Desk compose can open as paper only without creating a map panel'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-compose-paper=' 'Desk compose includes a paper-style selector'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function composePaperIcon(option)' 'Desk compose paper selector uses icons instead of text labels'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function applyComposePaperToDom()' 'Desk compose paper changes update the existing sheet instead of remounting compose'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'applyComposePaperToDom();' 'Desk compose paper selector applies paper changes in place'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-compose-menu' 'Desk compose document surface has a three-dot document menu'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-close-compose' 'Desk compose paper has a top-right close button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'closeComposeMode();' 'Desk compose close button uses the existing close animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-close' 'Desk compose close control is styled on the paper'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'right: 2.55rem;' 'Desk compose three-dot menu sits to the left of the close button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-compose-rename-open' 'Desk compose document menu exposes Rename'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-form="rename-document"' 'Desk compose renames documents through a modal form'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('rename-document'" 'Desk frontend calls the document rename API'
assert_file_contains "$ROOT_DIR/cgi/blog-desk.py" 'def rename_document' 'Desk backend can rename document markdown files'
assert_file_contains "$ROOT_DIR/cgi/blog-desk.py" 'Start typing before Desk saves the document.' 'Desk backend rejects blank document saves before creating default files'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" "{ value: 'page'" 'Desk compose no longer offers Page as a post type'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" "{ value: 'note'" 'Desk compose no longer offers unclear Note post type'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-compose-advanced' 'Desk compose can toggle full compose controls in place'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'suppressComposeAnimation' 'Desk compose can rerender toolbar controls without replaying the open animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-panel.is-steady' 'Desk compose has a steady refresh state for post controls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'animation: none;' 'Desk compose steady refresh disables the book-open animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-form="compose-doc"' 'Desk compose saves room documents directly from Desk'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'roomOptionRows(data, state.composeTargetRoom || selected)' 'Desk compose does not show a room dropdown below the document'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '<button type="submit" class="desk-btn primary">Save</button>' 'Desk compose does not show a manual save button below the document'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'Full Composer' 'Desk compose no longer links out to external full composer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var filesPanel = files.length' 'Desk todo pad only builds the Files frame when room documents exist'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-files-frame' 'Desk todo pad shows a Files frame for room documents'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'No files' 'Desk todo pad hides the Files frame instead of showing an empty state'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-doc-drag' 'Desk compose replaces the document drag handle with a page-type control'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-compose-type-toggle' 'Desk compose page-type icon toggles the in-page type selector'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'composeTypeMenuOpen' 'Desk compose tracks the in-page type selector state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function applyComposeTypeMenuToDom()' 'Desk compose type selector opens smoothly without rerendering the page'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-compose-type-picker' 'Desk compose no longer shows the page type selector above the page'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-type-control.is-open' 'Desk compose page-type selector expands from the current type icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns 240ms' 'Desk compose page-type selector expansion is animated'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-type-selector' 'Desk compose type options live inside the expanding in-page selector'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'box-shadow: none;' 'Desk compose page-type control avoids a floating drop shadow'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('save-document'" 'Desk compose autosave persists YAML markdown room documents through Desk API'
assert_file_contains "$ROOT_DIR/cgi/blog-desk.py" '"move-document"' 'Desk API path can move documents between rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'margin-inline: auto;' 'Desk compose paper is centered with equal left and right wood margins'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'justify-self: center;' 'Desk compose panel centers in its side of the desk'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'margin-left: auto;' 'Desk compose paper no longer hugs the right side of its panel'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-sheet-typewriter' 'Desk compose supports a typewriter paper mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'transition: aspect-ratio 260ms' 'Desk compose paper shape animates when changing paper size'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'background-color 260ms ease' 'Desk compose paper color animates when changing paper style'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-sheet::before' 'Desk compose lined-paper rules live on a fading overlay'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-sheet-lined::before' 'Desk compose fades lined-paper rules in and out'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-sheet-card25x3' 'Desk compose supports a 2.5x3 notecard mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-sheet-card3x5' 'Desk compose supports a 3x5 notecard mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "label: 'half-index card'" 'Desk compose half-card tooltip uses the requested index-card wording'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "label: '3x5 index card'" 'Desk compose 3x5 tooltip uses the requested index-card wording'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-sheet-lined' 'Desk compose supports a lined-paper mode with binder-hole styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'aspect-ratio: 8 / 10.5;' 'Desk lined notebook paper uses common US filler-paper dimensions'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-sheet-lavender::after' 'Desk lavender stationery has the same three binder holes as lined paper'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'url("/static/textures/desk-mahogany.jpg") center / 38rem auto' 'Desk compose binder holes use the mahogany desk texture'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '0 0.52rem' 'Desk compose binder holes are larger and consistent across paper styles'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-compose-lined-top: 4.35rem;' 'Desk compose lined paper has a larger real-notebook top margin'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-compose-lined-margin: 3.35rem;' 'Desk compose lined paper has a red vertical notebook margin'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'rgba(69, 110, 185, 0.32)' 'Desk compose lined paper uses blue notebook rules instead of black lines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '5.25% 11.36%' 'Desk compose lined paper places the top binder hole at the real three-hole position'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '5.25% 50%' 'Desk compose lined paper places the middle binder hole at page center'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '5.25% 88.64%' 'Desk compose lined paper places the bottom binder hole at the real three-hole position'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'font-family: "Desk Architects Daughter"' 'Desk compose lined paper uses the print handwriting font'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-sheet-lavender' 'Desk compose supports a lavender stationery mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'aspect-ratio: 8.5 / 11;' 'Desk lavender stationery uses normal letter-paper dimensions'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'background-color: #e7e2ff;' 'Desk lavender stationery is lighter and bluer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "color: '#e7e2ff'" 'Desk lavender stationery swatch matches the lighter bluer paper'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '#dfd4ff' 'Desk lavender stationery no longer uses the darker violet'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-toolbar' 'Desk compose separates toolbar controls so the advanced button does not overlap selectors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-doc-menu' 'Desk compose styles an in-document three-dot menu'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-doc-menu-btn {' 'box-shadow: none;' 'Desk compose three-dot menu button has no drop shadow'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-compose-doc-menu {' 'box-shadow: none;' 'Desk compose three-dot menu panel has no drop shadow'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: 100%;' 'Desk compose textarea fills the paper instead of leaving a horizontal page seam'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'translateY(-0.22rem)' 'Desk dock launchers do not move on hover or focus'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('set-room-color'" 'Desk frontend can set room map colors'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('set-room-kind'" 'Desk frontend can set rooms indoor or outdoor'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('set-room-topology'" 'Desk frontend can set child rooms connected or contained'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'name="room_topology"' 'Desk room properties expose a subroom topology selector'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<span>Subroom</span>' 'Desk room properties use singular Subroom label'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '>Connected room</option>' 'Desk room topology option is singular'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '>Contained subdivision</option>' 'Desk contained topology option is singular'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '<span>Subrooms</span>' 'Desk room properties no longer use plural Subrooms label'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '>Connected rooms</option>' 'Desk room topology option no longer uses plural rooms'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '>Contained subdivisions</option>' 'Desk room topology option no longer uses plural subdivisions'
assert_file_contains "$ROOT_DIR/cgi/blog-desk.py" 'def set_room_topology' 'Desk API persists room child topology'
assert_file_contains "$ROOT_DIR/cgi/blog-desk" 'BLOG_DESK_ROOM_TOPOLOGY=$(blog_param room_topology)' 'Desk CGI wrapper forwards room topology changes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "'rename-room';" 'Desk frontend can still rename non-current rooms with path updates through Desk API'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-map-props' 'Desk map has a top-right blueprint properties control'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-map-props-close' 'Desk room properties panel has its own close control'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.mapPropsOpen = false;' 'Desk room properties close control closes only the properties panel'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-close-map' 'Desk map has a top-right close button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'closeMapMode();' 'Desk map close button uses the existing map close animation when map is primary'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-close' 'Desk map close control is styled over the map parchment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'right: calc(clamp(0.95rem, 1.6vw, 1.3rem) + 2.92rem);' 'Desk map properties button sits to the left of the map close button with a visible gap'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.mapPropsOpen = !state.mapPropsOpen;' 'Desk map properties button toggles the properties pane'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.suppressMapAnimation = true;' 'Desk map properties toggle keeps the map from replaying its open animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.suppressTodoAnimation = state.mode === 'todo';" 'Desk map properties toggle keeps an open notepad from replaying its open animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<h2 class="desk-map-properties-title">' 'Desk room properties panel shows the current room name above the controls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "escapeHtml(currentRoom.title || 'Room')" 'Desk room properties title uses the current room name'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-properties-title' 'Desk room properties title has centered panel styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'margin: 0 2rem 0.45rem -2.6rem;' 'Desk room properties title offsets the button-footprint padding and leaves room for close icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'text-align: center;' 'Desk room properties title is centered'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-properties-close' 'Desk room properties close icon is positioned inside the panel'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'top: 0.42rem;' 'Desk room properties close icon sits at the panel top'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'right: 0.42rem;' 'Desk room properties close icon sits at the panel right'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-form="rename-room-inline"' 'Desk map supports in-place room renaming'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "if (event.target.closest('.desk-map-room-title'))" 'Desk map ignores single clicks on room titles before a double-click rename'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "beginMapRoomRename(roomTitle.getAttribute('data-desk-room-title') || '');" 'Desk map double-click edits any room title instead of opening the notepad'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function beginMapRoomRename(roomPath)' 'Desk map title rename uses one focused inline-edit path'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "var renameAction = renameSource === state.currentRoom ? 'set-room-title' : 'rename-room';" 'Desk current-room title edits do not move the room folder'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-room-title="' 'Desk room titles have an explicit title hit target for current-room inline rename'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-room-title-hit' 'Desk room titles include a full label-area hit rectangle'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function mapRoomTitleAtPoint' 'Desk map can rename room titles even when Safari targets the SVG root'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'mapRoomTitleAtPoint(event.clientX, event.clientY)' 'Desk map double-click rename falls back to title hit geometry'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'pointer-events: all;' 'Desk map room titles receive pointer events for double-click rename'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-title-hit' 'Desk map room title hit target is styled separately from the visible text'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'mapRenameRoom: null' 'Desk map rename state uses null so Office is not always in edit mode'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.mapRenameRoom !== null && state.mapRenameRoom === path' 'Desk map only renders inline rename after an explicit room double-click'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.mapRenameRoom = null;' 'Desk map clears inline rename mode with a non-Office sentinel'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '<label><span>Name</span><input class="desk-map-prop-input"' 'Desk room properties panel does not expose room renaming'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-properties' 'Desk map renders a floating top-right room properties pane'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'padding: 0.55rem 0.6rem 0.55rem 3.2rem;' 'Desk map properties pane expands from and includes the smaller blueprint button footprint'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'transform-origin: top right;' 'Desk map properties pane expands from the original top-right button position'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '@keyframes desk-map-properties-open' 'Desk map properties pane has its own small expansion animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'if (!state.data)' 'Desk state refresh keeps the mounted room UI instead of flashing to the loading screen'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('move-room'" 'Desk frontend moves rooms by dropping one room on another'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('create-secret-passage'" 'Desk frontend creates two-way secret passages between rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "draggable=\"false\"" 'Desk map rooms use pointer-driven dragging without native drag ghost behavior'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "root.addEventListener('pointerdown'" 'Desk room moves support pointer dragging on SVG rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomDropTargetAt' 'Desk pointer room moves resolve drop targets under the pointer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function currentParentRoom' 'Desk room drag logic can identify the source room current parent'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'rejectCurrentParent' 'Desk room drag targeting can reject the current parent'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'roomId !== currentParent' 'Desk current parent does not highlight as a valid room drop target'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function finishRoomMove' 'Desk room moves share one API path for native and pointer drops'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'targetRoom === currentParentRoom(sourceRoom)' 'Desk dropping a room on its existing parent is a no-op'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'hasValidTarget' 'Desk room moves do nothing unless the drop target is valid'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'suppressRoomClickFor(220)' 'Desk room drags suppress the synthetic click after drop so checklist mode stays open'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'elementsFromPoint' 'Desk room drop targeting scans stacked elements for reliable drop hits'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-room-outline-layer' 'Desk renders room outlines in a stable top overlay layer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-room-hover-outline-layer' 'Desk renders hovered room outlines in a final overlay layer above current-room outlines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-room-hover-outline' 'Desk keeps hover outlines separate from passive and current room outlines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function setHoveredRoomOutline' 'Desk hover outlines update without reordering SVG rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'roomPath == null || roomPath === state.currentRoom' 'Desk hover outline skips the current room'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'function bringRoomLinkToFront' 'Desk hover no longer mutates SVG room order'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'pendingMapViewBoxFrom: null' 'Desk map keeps the previous closeup viewBox during room navigation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function applyPendingMapRoomPan' 'Desk map pans smoothly after a room navigation refresh'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.pendingMapViewBoxFrom = currentMapViewBox();' 'Desk captures the current zoomed view before loading another room'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'svg.setAttribute('\''viewBox'\'', formatViewBox(fromViewBox));' 'Desk renders the new room map from the previous closeup before animating'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function syncCurrentRoomInMapDom' 'Desk map can preserve the clicked room outline while navigation refreshes'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'syncCurrentRoomInMapDom(clean);' 'Desk map marks the clicked room current before the delayed pan refresh'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "root.addEventListener('wheel'" 'Desk map handles mouse-wheel zoom while hovered'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "setMapZoomMode(event.deltaY < 0 ? 'room' : 'full')" 'Desk map wheel up zooms in and wheel down zooms out'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "if (nextMode === 'full')" 'Desk map canonicalizes the full-map view even when already zoomed out'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.pointerMapPan = null;' 'Desk map clears active pan state when returning to the fixed full-map view'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function beginMapPan' 'Desk map shares pan setup across background and room drags'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "if (mapSvg && state.mapZoomMode === 'room' && beginMapPan(event, mapSvg))" 'Desk zoomed map can drag-pan from rooms as well as parchment'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'roomPath: roomLink ? roomLink.getAttribute('\''data-desk-room-link'\'') || '\'''\'' : null' 'Desk closeup panning remembers whether the pointer began on a room'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var shouldActivateRoom = !mapPan.active && mapPan.roomPath !== null && !mapPan.startedOnRoomTitle;' 'Desk room clicks still travel when drag-to-pan starts on rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'activateMapRoom(mapPan.roomPath)' 'Desk uses the normal room travel path after a non-drag room press'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "if (state.mapZoomMode !== 'room')" 'Desk stale pan moves cannot keep changing the full-map view'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var gridPadY = fullViewBox.h;' 'Desk map grid extends above and below the canonical map bounds'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'fullViewBox.h + gridPadY * 2' 'Desk map grid cannot run out vertically after zoom and pan'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-outline.is-current' 'Desk current room outline remains visible above neighboring rooms'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-hover-outline.is-hovered' 'Desk hover room outline is drawn by the final top overlay'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-hover-outline.is-hovered {' 'transition: none;' 'Desk room hover outline appears instantly without animation'
assert_css_block_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-room-hover-outline.is-travel-fading,' 'transition: stroke 220ms ease;' 'Desk clicked room hover outline fades during navigation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'touch-action: none;' 'Desk room drag targets avoid touch scroll stealing room moves'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'cursor: pointer;' 'Desk room links show pointer cursor when hover indicates navigation'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-form="room-title"' 'Desk checklist no longer exposes a room-name editor'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-form="room-kind"' 'Desk room view exposes an indoor/outdoor selector'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Connects from' 'Desk create-room parent selector uses connection wording'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function roomImmediateOptionRows' 'Desk create-room parent selector labels rooms by immediate name only'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'roomImmediateOptionRows(data, current)' 'Desk create-room modal uses short parent labels while preserving path values'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "join(' → ')" 'Desk room path labels use arrow separators instead of slashes'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-room-path' 'Desk removes the room breadcrumb styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-create-room-open' 'Desk frontend opens create room from the map plus button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderCreateRoomModal(data)' 'Desk frontend renders create room in a modal'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'preserveAspectRatio="xMidYMid meet"' 'Desk map scales to fit the desk without scrolling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderMapSafely(data)' 'Desk isolates map render failures from the rest of the interface'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "(renderPaperMap || renderClosingMap ? renderMapSafely(data) : '') + (isPaperSwitching && state.paperSwitchFrom === 'compose' ? renderCompose(data) : '') + renderTodo(data)" 'Desk checklist stays usable without forcing the map open and can close the map simultaneously'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function applyDeskTooltips()' 'Desk hydrates native tooltips across rendered controls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Double-click to rename this room' 'Desk room titles explain inline rename affordance'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Type a task and press Enter' 'Desk todo add line has a useful tooltip instead of browser validation copy'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Minimum upvotes for tasks surfaced on the map' 'Desk settings threshold control has a tooltip'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Toggle between the full mansion map and a closeup of this room' 'Desk map zoom control has a descriptive tooltip'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "root.querySelectorAll('button[aria-label], a[aria-label], input[aria-label], textarea[aria-label], select[aria-label]')" 'Desk tooltip hydration covers all labeled native controls'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-panel-error' 'Desk has a contained map error panel instead of crashing the full page'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-notebook-list' 'Desk checklist renders tasks as notebook lines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-notebook-vote-controls' 'Desk checklist places votes in the notebook margin'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-notebook-vote-btn' 'Desk checklist task rows include Reading List-style upvote buttons'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '<span class="desk-notebook-votes">' 'Desk checklist renders task vote counts as plain numbers'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '<span class="desk-notebook-votes">+' 'Desk checklist vote counts do not include a plus sign'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" "var bits = ['+'" 'Desk task metadata vote counts do not include a plus sign'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'M12 4 19.5 13.2h-4.25V20h-6.5v-6.8H4.5L12 4Z' 'Desk checklist uses the Reading List upvote arrow shape'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-notebook-check' 'Desk checklist task rows include a full-line checkbox control'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-notebook-check-icon' 'Desk checklist checkbox uses hand-drawn SVG artwork'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-notebook-check-box' 'Desk checklist checkbox has an irregular hand-drawn box path'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '>□</button>' 'Desk checklist checkbox no longer uses a text glyph'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'style="--todo-lines:' 'Desk checklist sizes the paper from its task count'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "event.key !== 'Enter'" 'Desk checklist add form submits on Enter'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "event.key === 'Escape'" 'Desk checklist add field handles Escape while typing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'todoInput.blur();' 'Desk checklist Escape defocuses the notepad typing field'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'novalidate' 'Desk todo add form disables browser-native validation bubbles'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'aria-label="New task" required' 'Desk todo add textarea is not required, avoiding native validation copy'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'wrap="off"' 'Desk checklist add line wraps naturally with the notebook paper'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function resizeTodoAddTextarea' 'Desk checklist add line grows in notebook-line increments as text wraps'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'box-shadow: none;' 'Desk checklist add line has no separate input shadow'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-todo-add-textarea:focus' 'Desk checklist add line has an explicit no-chrome focus state'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '-webkit-appearance: none;' 'Desk checklist add line suppresses Safari native textarea chrome'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'caret-color: #1e2a46;' 'Desk checklist add line leaves only a paper-appropriate cursor while typing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'border: 0 !important;' 'Desk checklist add line does not show a textbox border while typing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'outline: 0 !important;' 'Desk checklist add line does not show a focus outline while typing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'white-space: pre-wrap;' 'Desk checklist add line preserves natural wrapping'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'overflow-wrap: anywhere;' 'Desk checklist add line stays inside the todo pad width'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" 'max-width: calc(100% - var(--desk-notebook-margin) - var(--desk-notebook-writing-inset) - 0.45rem);' 'Desk checklist no longer uses the too-tight old right page margin'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-columns: var(--desk-notebook-margin) var(--desk-notebook-line) minmax(0, 1fr) auto;' 'Desk checklist reserves notebook margin, checkbox, task text, and row actions columns'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-notebook-content-margin: calc(var(--desk-notebook-margin) + var(--desk-notebook-writing-inset));' 'Desk checklist defines the effective writing margin once'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '--desk-notebook-right-margin: var(--desk-notebook-content-margin);' 'Desk checklist uses the same writing margin on both sides of the page'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'max-width: calc(100% - var(--desk-notebook-content-margin) - var(--desk-notebook-right-margin));' 'Desk checklist add line respects symmetric page margins'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'margin-right: var(--desk-notebook-right-margin);' 'Desk checklist task list respects the wider right page margin'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'overflow-wrap: anywhere;' 'Desk checklist task titles wrap instead of truncating'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'white-space: normal;' 'Desk checklist task titles can wrap across notebook lines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'height: calc(var(--desk-notebook-line) - 0.16rem);' 'Desk checklist checkbox is nearly a full notebook line tall'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'align-self: start;' 'Desk checklist checkbox sits on the first notebook line for wrapped tasks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'width: calc(var(--desk-notebook-line) - 0.22rem);' 'Desk checklist SVG checkbox nearly fills the line height'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-notebook-check-box' 'Desk checklist styles the hand-drawn checkbox path'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-notebook-vote-icon' 'Desk checklist upvote button carries the Reading List arrow icon styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'clip-path: polygon(50% 0, 100% 52%, 72% 52%, 72% 100%, 28% 100%, 28% 52%, 0 52%);' 'Desk checklist upvote hit area is clipped to the arrow silhouette'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'width: 1.05rem;' 'Desk checklist upvote button is no larger than the arrow artwork'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'border-radius: 0;' 'Desk checklist upvote button does not have a circular/square button surface'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'transition: color 140ms ease;' 'Desk checklist upvote hover changes only arrow color'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'color: var(--list-vote-up-color, #d4a41d);' 'Desk checklist upvote hover uses the Reading List gold accent'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function applyOptimisticDeskVote' 'Desk checklist votes update locally before the API response'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.data.tasks = sortDeskTasks(state.data.tasks);' 'Desk checklist optimistic votes keep the Reading List-style vote sort'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function applyOptimisticDeskRestore' 'Desk checklist restore moves archived tasks back locally before the API response'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'removeDeskTask(state.data.done_tasks, targetRoom, taskId)' 'Desk optimistic restore removes the archived row immediately'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'state.data.tasks = sortDeskTasks(state.data.tasks.concat([task]));' 'Desk optimistic restore inserts the restored task into active notebook rows immediately'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function captureNotebookTaskRects' 'Desk checklist captures task positions before vote sorting'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function animateNotebookTaskFlip' 'Desk checklist animates task reordering with FLIP'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api(apiAction, {" 'Desk checklist task actions still submit to the Desk API'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" '}, { silentBusy: true }).then(function (data) {' 'Desk checklist vote requests avoid blocking optimistic feedback'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'restoreDeskVoteSnapshot(rollbackData, beforeVoteRects' 'Desk checklist rolls optimistic votes back when the server rejects them'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'renderDeskDataSteady(data, captureNotebookTaskRects());' 'Desk checklist server vote refresh does not replay the notepad open animation'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-notebook-check:hover' 'Desk checklist checkbox reveals an affordance only on hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-todo-close:hover' 'Desk checklist close control reveals an affordance only on hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'background: rgba(105, 113, 128, 0.16)' 'Desk notebook controls use a translucent grey hover circle'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'border-radius: 999px;' 'Desk notebook controls use circular hover geometry'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'text-decoration: none;' 'Desk notebook close control does not turn into a text underline on hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function todoTypePrompt' 'Desk checklist uses device-appropriate click or tap prompt text'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "return 'Click to type';" 'Desk checklist blank line invites desktop typing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "return 'Tap to type';" 'Desk checklist blank line invites mobile typing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-todo-add-line' 'Desk checklist renders the add affordance as the newest blank notebook line'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'Save task</button>' 'Desk checklist keeps a hidden submit path for the blank-line add form'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-todo-add-toggle' 'Desk checklist no longer uses a separate plus button to add tasks'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-todo-add-reveal' 'Desk checklist add-task line is always visible instead of collapsed'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-todo-add-toggle' 'Desk checklist no longer styles a separate plus button'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-fold-icon' 'Desk map launcher uses a rendered folded-map icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-fold-art' 'Desk map launcher keeps the diagonal map angle in the artwork'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'transform: scale(1.14);' 'Desk map launcher expands instead of tilting on hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-fold-panel' 'Desk map launcher is a clear three-panel folded map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-map-fold-route' 'Desk map launcher includes a blue route on the folded map'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-map-scroll-roll' 'Desk map launcher is no longer a confusing scroll hybrid'
assert_file_exists "$ROOT_DIR/site/static/sounds/desk/cpage2.wav" 'Desk bundles the map-open page-turn sound'
assert_file_exists "$ROOT_DIR/site/static/sounds/desk/cpage1.wav" 'Desk bundles the map-close page-turn sound'
assert_file_exists "$ROOT_DIR/site/static/sounds/desk/book.wav" 'Desk bundles the tome thump sound for pad and compose'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "mapOpen: createSound('/static/sounds/desk/cpage2.wav'" 'Desk map-open sound uses cpage2.wav'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "mapClose: createSound('/static/sounds/desk/cpage1.wav'" 'Desk map-close sound uses cpage1.wav'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "book: createSound('/static/sounds/desk/book.wav'" 'Desk todo and compose sounds use book.wav'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'playSound(deskSounds.mapOpen);' 'Desk plays map-open sound when opening the map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'playSound(deskSounds.mapClose);' 'Desk plays map-close sound when closing the map'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'playSound(deskSounds.book);' 'Desk plays book sound for todo and compose mode transitions'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-checklist-notebook-icon' 'Desk checklist launcher uses a miniature notebook sheet icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-mode-todo .desk-checklist-notebook-icon' 'Desk checklist launcher centers its notebook icon'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-mode-todo:hover' 'Desk checklist launcher removes button chrome on hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'appearance: none;' 'Desk checklist launcher has no native button chrome'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "state.mode === 'todo' ? ''" 'Desk checklist launcher leaves the corner when the notebook is open'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-checklist-rule' 'Desk checklist launcher has ruled notebook lines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'translateY(clamp(16rem, 42vh, 30rem))' 'Desk checklist folds down to the bottom corner instead of stopping mid-screen'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderChromeControls(data)' 'Desk renders compact chrome controls without the room title header'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" '<h2 id="desk-map-heading">Room Map</h2>' 'Desk map omits title text for one-screen use'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'Central hall, wings, and nested rooms' 'Desk map omits explanatory description text'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'restore-task' 'Desk frontend exposes task restore after completion'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'archive-task' 'Desk frontend exposes explicit checked-task archive'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'forget-task' 'Desk frontend exposes task forgetting'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'remember-task' 'Desk frontend exposes remembering forgotten tasks'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'clear-task-upvotes' 'Desk frontend exposes explicit upvote clearing'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'contenteditable="plaintext-only"' 'Desk notebook task text is directly editable on the page'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function saveEditableTask' 'Desk notebook task edits save back through the Desk API'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" "api('edit-task'" 'Desk notebook task edits call the edit-task API'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-notebook-title:focus' 'Desk editable task text keeps notebook-paper focus styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'cursor: text;' 'Desk editable task text shows text cursor affordance'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'forgotten_tasks' 'Desk frontend receives forgotten task data for the archive drawer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'data-desk-forgotten-toggle' 'Desk archive section expands from the notebook'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'function renderArchivedTasks' 'Desk archived tasks render through the notebook archive drawer'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'var archivedTasks = forgotten.concat(done);' 'Desk archived drawer includes both forgotten and completed tasks'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.js" 'desk-done-list' 'Desk archived tasks do not fall back to generic grey task cards'
assert_file_not_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-forgotten-toggle' 'Desk no longer shows a text forgotten-task toggle'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-archive-toggle' 'Desk archived task drawer uses an unobtrusive icon toggle'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'background: transparent;' 'Desk archive toggle has no button background until hover'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-archive-toggle:hover' 'Desk archive toggle gains a circular light hover background'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-notebook-task.is-complete .desk-notebook-title' 'Desk checked tasks remain visible with strikethrough styling'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-notebook-row-icon.is-archive' 'Desk checked task archive icon is styled separately'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-notebook-row-icon.is-trash' 'Desk checked task trash icon is styled separately'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" '.desk-archive-drawer' 'Desk archive drawer animates open on notebook lines'
assert_file_contains "$ROOT_DIR/site/static/desk-page.css" 'grid-template-rows 260ms' 'Desk forgotten drawer has a smooth slide-open transition'
assert_file_contains "$ROOT_DIR/site/static/desk-page.js" 'desk_visibility_threshold' 'Desk frontend exposes the surfacing threshold control'

printf 'PASS: %s\n' "$PASS_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s\n' "$FAIL_COUNT" >&2
  exit 1
fi
