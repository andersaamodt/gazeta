#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
THEURGY_REPLAY=${THEURGY_REPLAY:-$HOME/git/theurgy/spells/replay-theurgy-cgi-fixture}
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-read-fixtures.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

[ -x "$THEURGY_REPLAY" ] || {
  printf '%s\n' "FAIL: replay spell is not executable: $THEURGY_REPLAY" >&2
  exit 1
}

export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export WIZARDRY_SITE_NAME="example.test"

SITE_ROOT="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
SITE_DATA="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"
POSTS_STORE="$SITE_DATA/content/posts"

mkdir -p "$SITE_ROOT/site/pages" "$SITE_ROOT/site/static" "$POSTS_STORE"
ln -s "$POSTS_STORE" "$SITE_ROOT/site/pages/posts"

cat > "$POSTS_STORE/replay-post.md" <<'POST'
---
title: "Replay Post"
visibility: "public"
published_at: "2026-06-11T12:00:00Z"
---

Replay body.
POST

fixture="$SCRIPT_DIR/fixtures/theurgy-cgi/list-public-posts"
payload=$("$THEURGY_REPLAY" "$fixture" -- "$ROOT_DIR/cgi/blog-list-public-posts")
json_payload=$(printf '%s\n' "$payload" | sed -n '/^{/,$p')

printf '%s\n' "$json_payload" | jq -e '.success == true' >/dev/null
printf '%s\n' "$json_payload" | jq -e '.posts[0].title == "Replay Post"' >/dev/null
[ -f "$SITE_DATA/public-posts-cache.json" ]

printf '%s\n' 'gazeta read fixture tests passed'
