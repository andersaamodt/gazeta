#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-maintenance.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export WIZARDRY_SITE_NAME="example.test"

SITE_ROOT="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
SITE_DATA="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"
POSTS_STORE="$SITE_DATA/content/posts"

mkdir -p "$SITE_ROOT/site/pages" "$SITE_ROOT/site/static" "$POSTS_STORE"
ln -s "$POSTS_STORE" "$SITE_ROOT/site/pages/posts"

cat > "$POSTS_STORE/maintenance-post.md" <<'POST'
---
title: "Maintenance Post"
visibility: "public"
published_at: "2026-06-11T12:00:00Z"
---

Maintenance body.
POST

payload=$("$ROOT_DIR/cgi/blog-maintenance" rebuild-indexes)

printf '%s\n' "$payload" | jq -e '.success == true and .post_count == 1' >/dev/null
printf '%s\n' "$payload" | jq -e '.rebuilt == ["public-posts"]' >/dev/null
[ -f "$SITE_ROOT/site/static/public-posts.json" ]
[ -f "$SITE_DATA/public-posts-cache.json" ]
jq -e '.posts[0].title == "Maintenance Post"' "$SITE_ROOT/site/static/public-posts.json" >/dev/null

bad=$("$ROOT_DIR/cgi/blog-maintenance" unknown-action)
printf '%s\n' "$bad" | jq -e '.success == false and .code == "bad_action"' >/dev/null

printf '%s\n' 'blog maintenance tests passed'
