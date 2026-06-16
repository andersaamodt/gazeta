#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-post-route-generated.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

export HOME="$TMP_ROOT/home"
export XDG_STATE_HOME="$TMP_ROOT/xdg-state"
export WIZARDRY_SITES_DIR="$HOME/git/sites"
export WIZARDRY_SITE_NAME="example.test"

SITE_ROOT="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
SITE_DATA="$XDG_STATE_HOME/gazeta/sites-data/$WIZARDRY_SITE_NAME"
GENERATED_ROOT="$XDG_STATE_HOME/gazeta/generated/$WIZARDRY_SITE_NAME"
POSTS_STORE="$SITE_DATA/content/posts"
POST_HTML="$GENERATED_ROOT/build/pages/posts/example-post.html"

mkdir -p "$SITE_ROOT/site/pages" "$POSTS_STORE" "$(dirname "$POST_HTML")"
ln -s "$POSTS_STORE" "$SITE_ROOT/site/pages/posts"

cat > "$POSTS_STORE/example-post.md" <<'POST'
---
title: "Generated Route Post"
visibility: "public"
published_at: "2026-06-15T12:00:00Z"
---

Generated route body.
POST

cat > "$POST_HTML" <<'HTML'
<!doctype html>
<html>
  <body>
    <article>
      <div class="post-head"><h1>Generated Route Post</h1></div>
      <p id="generated-build-marker">served from generated build</p>
    </article>
  </body>
</html>
HTML

output=$(QUERY_STRING='path=posts/example-post' REQUEST_METHOD=GET /bin/sh "$ROOT_DIR/cgi/blog-open-post")

printf '%s\n' "$output" | grep 'Status: 200 OK' >/dev/null
printf '%s\n' "$output" | grep 'generated-build-marker' >/dev/null
printf '%s\n' "$output" | grep 'served from generated build' >/dev/null

printf '%s\n' 'post route generated build tests passed'
