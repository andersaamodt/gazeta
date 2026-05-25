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

assert_file_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq "$needle" "$file"; then
    pass
  else
    fail "$label (missing: $needle in $file)"
  fi
}

assert_file_not_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq "$needle" "$file"; then
    fail "$label (unexpected: $needle in $file)"
  else
    pass
  fi
}

assert_file_exists() {
  file=$1
  label=$2
  if [ -f "$file" ]; then
    pass
  else
    fail "$label (missing: $file)"
  fi
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

urlencode() {
  jq -nr --arg value "$1" '$value|@uri'
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/overworld-runtime.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=demo
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
SITE_DATA="$SITES_DIR/.sitedata/$SITE_NAME"
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"
mkdir -p "$SITE_ROOT/site/pages" "$SITE_ROOT/site/static" "$SITE_ROOT/build/static" "$SITE_DATA"
printf 'plugin_overworld=true\nplugin_nostr_posts=true\nsite_title=Demo\n' > "$SITE_ROOT/site.conf"
printf '{"pages":[{"slug":"overworld","type":"overworld","show_in_nav":true,"placeholder_title":"Overworld","path":"/overworld"}]}\n' > "$SITE_DATA/nostr-pages.json"

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"
blog_init

assert_file_contains "$ROOT_DIR/cgi/blog-lib.sh" 'overworld)' 'plugin registry supports Overworld'
assert_file_contains "$ROOT_DIR/site/pages/admin.md" 'plugin-overworld' 'admin plugin table exposes Overworld'
assert_file_contains "$ROOT_DIR/site/pages/admin.md" 'account-overworld-ssh-user' 'account settings expose Overworld SSH username'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" 'data-overworld-game' 'web game mounts shortcode host'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" "GODOT_BUILD_PATH = '/static/overworld-godot/v20260523-page-help/'" 'web game targets versioned Godot export'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" "GODOT_URL = GODOT_BUILD_PATH + 'index.html'" 'web game mounts Godot export HTML from the versioned build'
assert_file_exists "$ROOT_DIR/site/static/overworld-godot/v20260523-page-help/index.html" 'Godot export HTML exists'
assert_file_exists "$ROOT_DIR/site/static/overworld-godot/v20260523-page-help/index.pck" 'Godot export package exists'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" 'Download (6.8 MB)' 'web game advertises compressed opt-in download size'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" 'Play cached game' 'web game distinguishes cached launch from first download'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" "GODOT_SERVICE_WORKER_URL = GODOT_BUILD_PATH + 'index.service.worker.js'" 'web game registers the Godot cache worker before launch'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" "GODOT_CACHE_NAME = 'Overworld-sw-cache-1779582932|1469358'" 'web game checks the current Godot cache version'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" 'hasCurrentGodotCache' 'web game detects whether the current build is already cached'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" "startDownload({ fromCache: true })" 'web game autostarts when the current build is cached'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" 'frame.src = GODOT_URL' 'web game starts the versioned Godot iframe'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" 'background: linear-gradient(180deg, #101310, #080a08)' 'web game splash covers the Godot logo while controls are visible'
assert_file_not_contains "$ROOT_DIR/site/static/overworld-game.js" 'index.png") center / min' 'web game splash does not overlap controls with the Godot logo image'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" 'text-fill-color: #fff8e8' 'web game title resets inherited heading gradient text fill'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" 'border: 0;' 'web game title resets inherited heading underline'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" 'height: min(78svh, 640px)' 'web game gives mobile portrait a taller play area'
assert_file_contains "$ROOT_DIR/site/static/overworld-game.js" 'touch-action: none' 'web game prevents page gestures inside the play surface'
assert_file_contains "$ROOT_DIR/wizardry-server-requirements.conf" 'overworld_server_accounts=required' 'server requirements include Overworld account provisioning'
assert_file_contains "$ROOT_DIR/.headquarters/scripts/ensure-site-overworld-server-accounts.sh" 'overworld-site-helper' 'Overworld provisioning installs the constrained account helper'

config_json=$(WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/blog-get-config" | strip_cgi_headers)
assert_jq "$config_json" '.plugins.overworld == true' 'config JSON enables Overworld plugin'
assert_jq "$config_json" '.overworld.include_syntax == "{{overworld-game}}"' 'config JSON advertises Overworld include syntax'

state_json=$(REQUEST_METHOD=GET QUERY_STRING='action=state' WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/blog-overworld-game" | strip_cgi_headers)
assert_jq "$state_json" '.success == true and .authenticated == false and .can_leave_default == false' 'anonymous state is restricted to the starting room'
assert_jq "$state_json" '.start_path == "/overworld/start" and .current_path == "/overworld/start" and .room.path == "/overworld/start"' 'anonymous state uses public placeholder paths'
assert_jq "$state_json" '.room.entries[]? | select(.name == "website" and .kind == "door" and .locked == true and (.path | startswith("overworld-locked://")))' 'starting room includes locked website door'

website_path=$(printf '%s\n' "$state_json" | jq -r '.room.entries[] | select(.name == "website") | .path' | head -n 1)
leave_json=$(REQUEST_METHOD=GET QUERY_STRING="action=enter&path=$(urlencode "$website_path")" WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/blog-overworld-game" | strip_cgi_headers)
assert_jq "$leave_json" '.success == false and .code == "auth_required"' 'anonymous players cannot leave the default room'

mobile_profile=$(blog_user_profile mobileuser)
config-set "$mobile_profile" username mobileuser
config-set "$mobile_profile" fingerprint test-fingerprint
session_parts=$(blog_create_session mobileuser test-fingerprint)
session_token=${session_parts%%;*}
session_rest=${session_parts#*;}
csrf_token=${session_rest%%;*}
header_reset_json=$(REQUEST_METHOD=GET QUERY_STRING='action=reset' HTTP_X_OVERWORLD_SESSION="$session_token" HTTP_X_OVERWORLD_CSRF="$csrf_token" "$ROOT_DIR/cgi/blog-overworld-game" | strip_cgi_headers)
assert_jq "$header_reset_json" '.success == true and .authenticated == true and .username == "mobileuser"' 'Overworld API accepts header auth for Godot web GET requests'

BLOG_NOSTR_PAGE_PRERENDER_TIMEOUT_SECONDS=2 WIZARDRY_SITES_DIR="$SITES_DIR" WIZARDRY_SITE_NAME="$SITE_NAME" "$ROOT_DIR/cgi/pre-build" >/dev/null 2>&1
assert_file_contains "$SITE_ROOT/site/pages/overworld.md" '<div class="overworld-game-mount" data-overworld-game data-prerender-painted="true"' 'pre-build creates Overworld page with a prerendered game mount'
assert_file_contains "$SITE_ROOT/site/pages/overworld.md" 'overworld-godot-frame-wrap' 'pre-build creates Overworld page with a stable play-surface shell'
assert_file_contains "$SITE_ROOT/site/pages/overworld.md" 'overworld-godot-status' 'pre-build creates Overworld status row before runtime JS'
assert_file_not_contains "$SITE_ROOT/site/pages/overworld.md" 'Loading page content' 'pre-build Overworld page does not ship loading copy'
assert_file_not_contains "$SITE_ROOT/site/pages/overworld.md" 'data-page-initial-placeholder' 'pre-build Overworld page does not ship the legacy loading placeholder marker'
assert_file_not_contains "$SITE_ROOT/site/pages/overworld.md" '{{overworld-game}}' 'pre-build does not leave the Overworld shortcode visible in the managed page shell'
assert_file_contains "$SITE_ROOT/site/pages/overworld.md" '/static/overworld-game.js' 'pre-build creates Overworld page script mount'
assert_file_contains "$SITE_ROOT/site/static/navbar-pages.json" '"/overworld"' 'pre-build includes Overworld in navbar data'
assert_file_contains "$SITE_ROOT/site/static/nostr-page-bootstrap/overworld.js" 'local_embed:true' 'pre-build creates local embed bootstrap for Overworld'

printf 'PASS: %s\n' "$PASS_COUNT"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s\n' "$FAIL_COUNT" >&2
  exit 1
fi
