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

assert_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s\n' "$haystack" | awk -v needle="$needle" 'index($0, needle) { found=1 } END { exit found ? 0 : 1 }'; then
    pass
  else
    fail "$label (missing: $needle)"
  fi
}

assert_not_contains() {
  haystack=$1
  needle=$2
  label=$3
  if printf '%s\n' "$haystack" | awk -v needle="$needle" 'index($0, needle) { found=1 } END { exit found ? 0 : 1 }'; then
    fail "$label (unexpected: $needle)"
  else
    pass
  fi
}

assert_equals() {
  actual=$1
  expected=$2
  label=$3
  if [ "$actual" = "$expected" ]; then
    pass
  else
    fail "$label (expected: $expected, actual: $actual)"
  fi
}

assert_file_exists() {
  path=$1
  label=$2
  if [ -f "$path" ]; then
    pass
  else
    fail "$label (missing file: $path)"
  fi
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/nostr-publish-runtime-test.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

SITE_NAME=testsite
SITES_DIR="$TMP_ROOT/sites"
SITE_ROOT="$SITES_DIR/$SITE_NAME"
BIN_DIR="$TMP_ROOT/bin"
APP_CGI_BIN="$SITE_ROOT/app/cgi-bin"

mkdir -p "$SITE_ROOT/site/pages/posts" "$SITES_DIR/.sitedata/$SITE_NAME" "$BIN_DIR" "$APP_CGI_BIN"

cat > "$APP_CGI_BIN/config-get" <<'EOS'
#!/bin/sh
set -eu
file=${1-}
key=${2-}
[ -f "$file" ] || exit 1
line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)
[ -n "$line" ] || exit 1
printf '%s\n' "${line#*=}"
EOS
chmod +x "$APP_CGI_BIN/config-get"

cat > "$APP_CGI_BIN/config-set" <<'EOS'
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
chmod +x "$APP_CGI_BIN/config-set"

cat > "$BIN_DIR/nostril" <<'EOS'
#!/bin/sh
set -eu

kind=1
created_at=0
content=''
secret=''
tags_json='[]'

while [ "$#" -gt 0 ]; do
  case "$1" in
    --sec)
      secret=${2-}
      shift 2
      ;;
    --kind)
      kind=${2-}
      shift 2
      ;;
    --created-at|--time|--ts)
      created_at=${2-}
      shift 2
      ;;
    --content|-c)
      content=${2-}
      shift 2
      ;;
    --tag)
      key=${2-}
      value=${3-}
      shift 3
      tags_json=$(printf '%s\n' "$tags_json" | jq -c --arg key "$key" --arg value "$value" '. + [[$key, $value]]')
      ;;
    -t)
      value=${2-}
      shift 2
      key=t
      tags_json=$(printf '%s\n' "$tags_json" | jq -c --arg key "$key" --arg value "$value" '. + [[$key, $value]]')
      ;;
    -d)
      value=${2-}
      shift 2
      tags_json=$(printf '%s\n' "$tags_json" | jq -c --arg value "$value" '. + [["d", $value]]')
      ;;
    -e)
      value=${2-}
      shift 2
      tags_json=$(printf '%s\n' "$tags_json" | jq -c --arg value "$value" '. + [["e", $value]]')
      ;;
    -p)
      value=${2-}
      shift 2
      tags_json=$(printf '%s\n' "$tags_json" | jq -c --arg value "$value" '. + [["p", $value]]')
      ;;
    *)
      shift
      ;;
  esac
done

pubkey=$(printf '%s' "$secret" | tr 'A-F' 'a-f' | tr -d '\r\n[:space:]')
if [ -z "$pubkey" ]; then
  pubkey='1111111111111111111111111111111111111111111111111111111111111111'
fi
id=$(printf '%s|%s|%s|%s|%s\n' "$pubkey" "$kind" "$created_at" "$content" "$tags_json" | shasum -a 256 | awk '{print $1}')

jq -cn \
  --arg id "$id" \
  --arg pubkey "$pubkey" \
  --argjson kind "$kind" \
  --argjson created_at "$created_at" \
  --argjson tags "$tags_json" \
  --arg content "$content" \
  '{id:$id,pubkey:$pubkey,created_at:$created_at,kind:$kind,tags:$tags,content:$content,sig:"sig"}'
EOS
chmod +x "$BIN_DIR/nostril"

cat > "$BIN_DIR/nak" <<'EOS'
#!/bin/sh
set -eu

cmd=${1-}
shift || true

relay_key() {
  printf '%s' "${1-}" | sed 's#[^A-Za-z0-9]#_#g'
}

case "$cmd" in
  help)
    case "${1-}" in
      event)
        printf 'NAME:\n   nak event\n'
        ;;
      req)
        printf 'NAME:\n   nak req\n'
        ;;
      *)
        printf 'verify\n'
        ;;
    esac
    ;;
  verify)
    tmp=$(mktemp "${TMPDIR:-/tmp}/nak-verify.XXXXXX")
    cat > "$tmp"
    if jq -e '.id and .pubkey and (.kind != null)' "$tmp" >/dev/null 2>&1; then
      rm -f "$tmp"
      exit 0
    fi
    rm -f "$tmp"
    exit 1
    ;;
  event)
    tmp=$(mktemp "${TMPDIR:-/tmp}/nak-event.XXXXXX")
    cat > "$tmp"
    event_id=$(jq -r '.id // empty' "$tmp" 2>/dev/null || printf '')
    [ -n "$event_id" ] || {
      rm -f "$tmp"
      exit 1
    }
    for relay in "$@"; do
      key=$(relay_key "$relay")
      mkdir -p "$NAK_PUBLISH_DIR/$key"
      cp "$tmp" "$NAK_PUBLISH_DIR/$key/$event_id.json"
    done
    cat "$tmp"
    rm -f "$tmp"
    ;;
  req)
    event_id=''
    relay=''
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --limit|-l)
          shift 2
          ;;
        --id|-i)
          event_id=${2-}
          shift 2
          ;;
        *)
          relay=$1
          shift
          ;;
      esac
    done
    [ -n "$event_id" ] || exit 1
    [ -n "$relay" ] || exit 1
    key=$(relay_key "$relay")
    path="$NAK_PUBLISH_DIR/$key/$event_id.json"
    [ -f "$path" ] || exit 1
    cat "$path"
    ;;
  *)
    exit 1
    ;;
esac
EOS
chmod +x "$BIN_DIR/nak"

export PATH="$BIN_DIR:$PATH"
export WIZARDRY_SITES_DIR="$SITES_DIR"
export WIZARDRY_SITE_NAME="$SITE_NAME"
export NAK_PUBLISH_DIR="$TMP_ROOT/nak-published"

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-nostr-pages-common.sh"

blog_init

config-set "$blog_site_conf" domain "example.com"
config-set "$blog_site_conf" https true
config-set "$blog_site_conf" nostr_bridge_enabled true
config-set "$blog_site_conf" plugin_nostr_support true
config-set "$blog_site_conf" plugin_zaps true
config-set "$blog_site_conf" zaps_enabled true
printf '%s\n' '1111111111111111111111111111111111111111111111111111111111111111' > "$blog_nostr_secret_key_file"
printf '%s\n' 'npub1siteexamplewalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' > "$blog_nostr_state_dir/site_npub"
cat > "$blog_nostr_relays_file" <<'EOS'
wss://example.com
wss://relay.one
wss://relay.two/
wss://relay.one
EOS

cat > "$SITE_ROOT/site/pages/posts/example-post.md" <<'EOS'
---
title: "Example Post"
summary: "Example summary"
published_at: "2026-04-21T00:00:00Z"
visibility: "public"
post_type: "longform"
tags: ["nostr", "zaps"]
---
Hello from a synced authored post.
EOS

cat > "$SITE_ROOT/site/pages/posts/2026-04-20-dated-example-post.md" <<'EOS'
---
title: "Dated Example Post"
summary: "Dated example summary"
published_at: "2026-04-20T00:00:00Z"
visibility: "public"
post_type: "longform"
tags: ["nostr", "dated"]
---
Hello from a dated authored post.
EOS

sync_output=$("$ROOT_DIR/cgi/blog-sync-authored-nostr")
assert_contains "$sync_output" 'contact=ok' 'authored sync publishes contact metadata'
assert_contains "$sync_output" 'posts_synced=2' 'authored sync processes local public posts'

count_output=$("$ROOT_DIR/cgi/blog-sync-authored-nostr" --count-public-posts)
assert_contains "$count_output" 'posts_total=2' 'authored sync can count local public posts without publishing'
example_projection=$(blog_read_front_matter_value "$SITE_ROOT/site/pages/posts/example-post.md" nostr_projection 2>/dev/null || printf '')
assert_equals "$example_projection" '' 'authored sync does not overwrite local posts with projection copies'

contact_event=$(blog_nostr_contact_latest_event_json 2>/dev/null || printf '')
contact_content=$(printf '%s\n' "$contact_event" | jq -c 'try (.content | fromjson) catch {}' 2>/dev/null || printf '{}')
assert_contains "$contact_event" '"kind":0' 'contact sync stores a kind 0 event locally'
assert_not_contains "$contact_content" '"lud16":"npub1siteexamplewalletxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@npub.cash"' 'contact sync does not inject Admin zap config into contact metadata'

post_record=$(blog_nostr_post_record_for_slug "example-post" 2>/dev/null || printf '')
assert_contains "$post_record" '"slug":"example-post"' 'authored sync rebuilds the derived posts index'

post_event_id=$(printf '%s\n' "$post_record" | jq -r '.id // ""' 2>/dev/null || printf '')
assert_file_exists "$NAK_PUBLISH_DIR/wss___relay_one/$post_event_id.json" 'post event is published to the first upstream relay'
assert_file_exists "$NAK_PUBLISH_DIR/wss___relay_two/$post_event_id.json" 'post event is published to the second upstream relay'
if [ -f "$NAK_PUBLISH_DIR/wss___example_com/$post_event_id.json" ]; then
  fail 'post event should not publish to the site relay'
else
  pass
fi

post_context_output=$(QUERY_STRING='path=posts/example-post' REQUEST_METHOD=GET "$ROOT_DIR/cgi/blog-post-context")
assert_contains "$post_context_output" '"nostr":{"id":"' 'post context falls back to stored authored nostr metadata'
assert_contains "$post_context_output" '"address":"30023:1111111111111111111111111111111111111111111111111111111111111111:example-post"' 'post context exposes the authored address'
assert_contains "$post_context_output" '"relays":["wss://example.com","wss://relay.one","wss://relay.two/","wss://relay.one"]' 'post context exposes configured relays for NIP-19 share codes'

dated_post_record=$(blog_nostr_post_record_for_slug "dated-example-post" 2>/dev/null || printf '')
assert_contains "$dated_post_record" '"slug":"dated-example-post"' 'dated authored sync uses the canonical public slug'

dated_event_json=$(blog_nostr_build_post_event_json_for_file "$SITE_ROOT/site/pages/posts/2026-04-20-dated-example-post.md" 2>/dev/null || printf '')
dated_d_tag=$(printf '%s\n' "$dated_event_json" | jq -r '[.tags[]? | select(type=="array" and length>=2 and .[0]=="d") | .[1]] | first // ""' 2>/dev/null || printf '')
assert_equals "$dated_d_tag" 'dated-example-post' 'dated authored events strip the filename date prefix from the d tag'

dated_context_output=$(QUERY_STRING='path=posts/dated-example-post' REQUEST_METHOD=GET "$ROOT_DIR/cgi/blog-post-context")
assert_contains "$dated_context_output" '"address":"30023:1111111111111111111111111111111111111111111111111111111111111111:dated-example-post"' 'dated post context resolves the canonical authored address'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf 'FAIL: %s tests failed; %s passed\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'ok (%s assertions)\n' "$PASS_COUNT"
