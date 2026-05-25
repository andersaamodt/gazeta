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

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/nostr-blog-post-path.XXXXXX")
cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT INT TERM

export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export WIZARDRY_SITE_NAME="example.test"

SITE_ROOT="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
SITE_DATA="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"
EXTERNAL_POSTS="$TMP_ROOT/external-mounted-posts"

mkdir -p "$SITE_ROOT/site/pages" "$SITE_DATA/content/posts" "$EXTERNAL_POSTS"
ln -s "$EXTERNAL_POSTS" "$SITE_ROOT/site/pages/posts"

cat > "$EXTERNAL_POSTS/example-post.md" <<'EOS'
---
title: "Example Post"
visibility: "public"
---

Body.
EOS

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"

symlink_post="$SITE_ROOT/site/pages/posts/example-post.md"
real_post=$(CDPATH= cd -- "$EXTERNAL_POSTS" && pwd -P)/example-post.md

assert_eq 'posts/example-post.md' "$(blog_post_rel_path_for_file "$symlink_post" 2>/dev/null || printf '')" 'post rel path accepts mounted symlink path'
assert_eq 'posts/example-post.md' "$(blog_post_rel_path_for_file "$real_post" 2>/dev/null || printf '')" 'post rel path accepts canonical mounted path'
assert_eq 'posts/example-post.md' "$(blog_managed_post_rel_path_for_file "$symlink_post" 2>/dev/null || printf '')" 'managed post path accepts mounted symlink path'
assert_eq 'posts/example-post.md' "$(blog_managed_post_rel_path_for_file "$real_post" 2>/dev/null || printf '')" 'managed post path accepts canonical mounted path'

if [ "$FAIL_COUNT" -ne 0 ]; then
  printf 'post path runtime tests failed: %s failure(s), %s pass(es)\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'post path runtime tests passed: %s\n' "$PASS_COUNT"
