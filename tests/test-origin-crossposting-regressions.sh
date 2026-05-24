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

assert_eq() {
  expected=$1
  actual=$2
  label=$3
  if [ "$actual" = "$expected" ]; then
    pass
  else
    fail "$label (expected: $expected, actual: $actual)"
  fi
}

assert_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    pass
  else
    fail "$label (missing: $needle)"
  fi
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

assert_file_exists() {
  file=$1
  label=$2
  if [ -f "$file" ]; then
    pass
  else
    fail "$label (missing file: $file)"
  fi
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/origin-crossposting-test.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=testsite
SITES_DIR="$TMP_ROOT/sites"
BIN_DIR="$TMP_ROOT/bin"
MOCK_ORIGIN_DIR="$TMP_ROOT/origin"

mkdir -p "$BIN_DIR" "$MOCK_ORIGIN_DIR/bin"

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
printf 'END-HEADERS\n'
EOS
chmod +x "$BIN_DIR/http-end-headers"

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

cat > "$MOCK_ORIGIN_DIR/origin.json" <<'EOS'
{
  "platforms": {
    "mastodon": {
      "enabled": true,
      "family": "activitypub",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "bluesky": {
      "enabled": true,
      "family": "api",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "misskey": {
      "enabled": true,
      "family": "activitypub",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "lemmy": {
      "enabled": true,
      "family": "activitypub",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "kbin": {
      "enabled": true,
      "family": "activitypub",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "reddit": {
      "enabled": true,
      "family": "bridge",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "x": {
      "enabled": true,
      "family": "bridge",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "tumblr": {
      "enabled": true,
      "family": "bridge",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "facebook": {
      "enabled": true,
      "family": "bridge",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "minds": {
      "enabled": true,
      "family": "bridge",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "mirror": {
      "enabled": true,
      "family": "paragraph",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    },
    "telegram": {
      "enabled": true,
      "family": "message",
      "project": { "command": ["./bin/mock-platform", "project"] },
      "emit": {
        "command": ["./bin/mock-platform", "emit"],
        "edit_command": ["./bin/mock-platform", "edit"]
      },
      "fetch": { "command": ["./bin/mock-platform", "fetch"] },
      "normalize": { "command": ["./bin/mock-platform", "normalize"] }
    }
  }
}
EOS

cat > "$MOCK_ORIGIN_DIR/bin/origin" <<'EOS'
#!/bin/sh
set -eu

config_path=
command_name=
platforms=
post_file=

while [ "$#" -gt 0 ]; do
  case "$1" in
    --config)
      config_path=${2-}
      shift 2
      ;;
    --platform)
      if [ -n "$platforms" ]; then
        platforms=$platforms,$2
      else
        platforms=$2
      fi
      shift 2
      ;;
    emit)
      command_name=emit
      shift
      ;;
    *)
      post_file=$1
      shift
      ;;
  esac
done

[ "$command_name" = "emit" ] || {
  printf 'mock origin only implements emit\n' >&2
  exit 1
}
[ -n "$config_path" ] || exit 1
[ -n "$post_file" ] || exit 1

state_dir=$(jq -r '.state_dir // empty' "$config_path")
[ -n "$state_dir" ] || exit 1

post_id=$(
  awk '
    NR == 1 && $0 == "---" { in_fm = 1; next }
    in_fm && $0 == "---" { exit }
    in_fm && /^slug:[[:space:]]*/ {
      line = $0
      sub(/^slug:[[:space:]]*/, "", line)
      gsub(/^"/, "", line)
      gsub(/"$/, "", line)
      print line
      exit
    }
  ' "$post_file"
)
canonical_url=$(
  awk '
    NR == 1 && $0 == "---" { in_fm = 1; next }
    in_fm && $0 == "---" { exit }
    in_fm && /^canonical_url:[[:space:]]*/ {
      line = $0
      sub(/^canonical_url:[[:space:]]*/, "", line)
      gsub(/^"/, "", line)
      gsub(/"$/, "", line)
      print line
      exit
    }
  ' "$post_file"
)
if [ -z "$post_id" ]; then
  post_id=$(basename "$post_file" .md)
fi

mkdir -p "$state_dir/$post_id"
results_tmp=$(mktemp "${TMPDIR:-/tmp}/origin-results.XXXXXX")
fail_csv=${MOCK_ORIGIN_FAIL_PLATFORMS-}

printf '%s' "$platforms" | tr ',' '\n' | while IFS= read -r platform || [ -n "$platform" ]; do
  [ -n "$platform" ] || continue
  remote_id="$platform-$post_id"
  remote_url="https://example.test/$platform/$post_id"
  status=published
  error=
  case ",$fail_csv," in
    *,"$platform",*)
      status=failed
      error="mock failure for $platform"
      ;;
  esac
  if [ "$status" = "published" ]; then
    jq -cn --arg status "$status" --arg remote_id "$remote_id" --arg remote_url "$remote_url" --arg canonical_url "$canonical_url" \
      '{status:$status,remote_id:$remote_id,remote_url:$remote_url,canonical_url:$canonical_url}' > "$state_dir/$post_id/$platform.json"
    jq -cn --arg platform "$platform" --arg status "$status" --arg remote_id "$remote_id" --arg remote_url "$remote_url" \
      '{platform:$platform,status:$status,remote_id:$remote_id,remote_url:$remote_url}'
  else
    jq -cn --arg status "$status" --arg error "$error" '{status:$status,error:$error}' > "$state_dir/$post_id/$platform.json"
    jq -cn --arg platform "$platform" --arg status "$status" --arg error "$error" \
      '{platform:$platform,status:$status,error:$error}'
  fi
done > "$results_tmp"

jq -cs --arg post_id "$post_id" '{post_id:$post_id,results:.}' "$results_tmp"
rm -f "$results_tmp"
EOS
chmod +x "$MOCK_ORIGIN_DIR/bin/origin"

export PATH="$BIN_DIR:$PATH"
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"
export ORIGIN_DIR="$MOCK_ORIGIN_DIR"

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"

blog_init

admin_profile=$(blog_user_profile admin)
config-set "$admin_profile" username admin
config-set "$admin_profile" fingerprint test-fingerprint
config-set "$admin_profile" is_admin true

session_parts=$(blog_create_session admin test-fingerprint)
session_token=${session_parts%%;*}
rest=${session_parts#*;}
csrf_token=${rest%%;*}

config-set "$blog_site_conf" origin_enabled_platforms '["mastodon","bluesky","reddit","telegram"]'
config-set "$blog_site_conf" origin_default_platforms '["bluesky","telegram"]'
config-set "$blog_site_conf" origin_public_base_url 'https://andersaamodt.com'

run_cgi() {
  script=$1
  query=$2
  output=$(REQUEST_METHOD=GET QUERY_STRING="$query" HTTP_HOST="blog.example.com" "$ROOT_DIR/cgi/$script" 2>&1)
  printf '%s\n' "$output" | awk 'NF { last = $0 } END { print last }'
}

config_json=$(blog_origin_crossposting_config_json)
assert_eq 'true' "$(printf '%s' "$config_json" | jq -r '.available')" 'origin runtime reports available'
assert_eq '12' "$(printf '%s' "$config_json" | jq -r '.platforms | length')" 'origin config exposes full platform catalog'
assert_eq '4' "$(printf '%s' "$config_json" | jq -r '.enabled_platforms | length')" 'site config enables selected origin platforms'
assert_eq '["bluesky","telegram"]' "$(printf '%s' "$config_json" | jq -c '.default_platforms')" 'site config keeps compose defaults'
assert_eq 'https://andersaamodt.com' "$(printf '%s' "$config_json" | jq -r '.public_base_url')" 'origin config exposes canonical cross-post base URL'
assert_eq 'message' "$(printf '%s' "$config_json" | jq -r '.platforms[] | select(.id=="telegram") | .family')" 'telegram family metadata is preserved'
assert_eq 'activitypub' "$(printf '%s' "$config_json" | jq -r '.platforms[] | select(.id=="misskey") | .family')" 'full platform metadata includes additional Origin adapters'

draft_out=$(run_cgi blog-save-post "action=save_draft&session_token=$session_token&csrf_token=$csrf_token&title=$(blog_url_encode 'Origin Draft')&content=$(blog_url_encode '# Draft body')&post_type=longform")
assert_contains "$draft_out" '"success":true' 'save draft succeeds'
draft_id=$(printf '%s' "$draft_out" | jq -r '.draft_id')
assert_eq 'true' "$( [ -n "$draft_id" ] && printf true || printf false )" 'save draft returns a draft id'

draft_json=$(run_cgi blog-get-draft "draft_id=$draft_id&session_token=$session_token&csrf_token=$csrf_token")
assert_eq '["bluesky","telegram"]' "$(printf '%s' "$draft_json" | jq -c '.draft.origin_platforms')" 'draft defaults to configured origin platforms'

publish_out=$(run_cgi blog-save-post "action=publish_now&draft_id=$draft_id&session_token=$session_token&csrf_token=$csrf_token&title=$(blog_url_encode 'Origin Launch')&content=$(blog_url_encode '# Origin Launch')&post_type=longform&post_filename=origin-launch&origin_platforms=$(blog_url_encode '["mastodon"]')")
assert_contains "$publish_out" '"success":true' 'publish succeeds'
assert_contains "$publish_out" 'Cross-posted to 1 site(s).' 'publish response reports initial origin emit'

post_file="$SITES_DIR/$SITE_NAME/site/pages/posts/origin-launch.md"
post_settings="$SITES_DIR/.sitedata/$SITE_NAME/origin/posts/origin-launch.json"
mastodon_state="$SITES_DIR/.sitedata/$SITE_NAME/origin/state/origin-launch/mastodon.json"

assert_file_exists "$post_file" 'published post exists'
assert_file_exists "$post_settings" 'per-post origin settings file exists'
assert_eq '["mastodon"]' "$(jq -c '.platforms' "$post_settings")" 'publish stores selected origin platforms per post'
assert_file_exists "$mastodon_state" 'origin emit writes mastodon state file'
assert_eq 'published' "$(jq -r '.status' "$mastodon_state")" 'mastodon state file marks published'
assert_eq 'https://andersaamodt.com/posts/origin-launch' "$(jq -r '.canonical_url' "$mastodon_state")" 'origin emit receives canonical post URL for future production domain'

posts_after_publish=$(run_cgi blog-list-posts "session_token=$session_token&csrf_token=$csrf_token")
assert_eq '1' "$(printf '%s' "$posts_after_publish" | jq -r '.posts | length')" 'posts list returns published post'
assert_eq '1' "$(printf '%s' "$posts_after_publish" | jq -r '.posts[0].crossposting.published_count')" 'posts list reports one published destination'
assert_eq '3' "$(printf '%s' "$posts_after_publish" | jq -r '.posts[0].crossposting.remaining_count')" 'posts list reports remaining enabled destinations'
assert_eq 'true' "$(printf '%s' "$posts_after_publish" | jq -r '.posts[0].crossposting.needs_action')" 'posts list keeps follow-up action visible'
assert_eq 'not_selected' "$(printf '%s' "$posts_after_publish" | jq -r '.posts[0].crossposting.platforms[] | select(.id=="bluesky") | .status')" 'posts list marks unselected destination explicitly'
assert_eq 'not_selected' "$(printf '%s' "$posts_after_publish" | jq -r '.posts[0].crossposting.platforms[] | select(.id=="telegram") | .status')" 'posts list includes additional enabled destinations'

crosspost_out=$(run_cgi blog-crosspost-post "session_token=$session_token&csrf_token=$csrf_token&post_path=$(blog_url_encode 'posts/origin-launch.md')&platforms=$(blog_url_encode '["bluesky","reddit","telegram"]')")
assert_contains "$crosspost_out" '"success":true' 'manual cross-post succeeds'
assert_eq 'published' "$(printf '%s' "$crosspost_out" | jq -r '.crossposting.platforms[] | select(.id=="bluesky") | .status')" 'manual cross-post updates bluesky status'
assert_eq 'published' "$(printf '%s' "$crosspost_out" | jq -r '.crossposting.platforms[] | select(.id=="telegram") | .status')" 'manual cross-post updates telegram status'

posts_after_crosspost=$(run_cgi blog-list-posts "session_token=$session_token&csrf_token=$csrf_token")
assert_eq '4' "$(printf '%s' "$posts_after_crosspost" | jq -r '.posts[0].crossposting.published_count')" 'posts list reports all enabled destinations as published'
assert_eq '0' "$(printf '%s' "$posts_after_crosspost" | jq -r '.posts[0].crossposting.remaining_count')" 'posts list reports no remaining destinations'
assert_eq 'false' "$(printf '%s' "$posts_after_crosspost" | jq -r '.posts[0].crossposting.needs_action')" 'posts list hides follow-up action once fully cross-posted'
assert_eq '["bluesky","mastodon","reddit","telegram"]' "$(jq -c '.platforms | sort' "$post_settings")" 'manual cross-post merges post selection into saved origin settings'

assert_file_contains "$ROOT_DIR/site/pages/admin.md" 'data-admin-nav="crossposting"' 'admin nav exposes cross-posting section'
assert_file_contains "$ROOT_DIR/site/pages/admin.md" 'id="compose-crosspost-details"' 'compose UI includes cross-posting details control'
assert_file_contains "$ROOT_DIR/site/pages/admin.md" 'id="post-crosspost-dialog"' 'posts UI includes cross-post dialog'
assert_file_contains "$ROOT_DIR/site/static/admin.js" 'origin_platforms: JSON.stringify(arrayFromMaybe(state.composeOriginPlatforms))' 'compose payload sends selected origin platforms'
assert_file_contains "$ROOT_DIR/site/static/admin.js" 'class="post-crosspost-trigger"' 'posts list renders explicit cross-post action button'
assert_file_contains "$ROOT_DIR/site/static/admin.js" 'function renderCrosspostingSettingsUi() {' 'admin JS renders cross-post settings section'
assert_file_contains "$ROOT_DIR/site/static/admin.js" 'function submitPostCrosspostDialog() {' 'admin JS supports manual per-post cross-posting'
assert_file_contains "$ROOT_DIR/site/static/admin.js" 'Cross-post links point to ' 'admin JS reports the active cross-post link base URL'
assert_file_contains "$ROOT_DIR/site/static/admin.js" "telegram: 'Telegram'" 'admin JS maps Telegram label explicitly'
assert_file_contains "$ROOT_DIR/site/static/admin.js" "mirror: 'Mr'" 'admin JS maps Mirror short label explicitly'

if [ "$FAIL_COUNT" -ne 0 ]; then
  printf 'not ok (%s failed, %s passed)\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
