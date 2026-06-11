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
POSTS_STORE="$SITE_DATA/content/posts"

mkdir -p "$SITE_ROOT/site/pages" "$POSTS_STORE"
ln -s "$POSTS_STORE" "$SITE_ROOT/site/pages/posts"

cat > "$POSTS_STORE/example-post.md" <<'EOS'
---
title: "Example Post"
visibility: "public"
---

Body.
EOS

cat > "$POSTS_STORE/link-post.md" <<'EOS'
---
title: "Useful Linked Page"
visibility: "public"
post_type: "link-share"
author: "Link Curator"
published_at: "2026-06-04T12:00:00Z"
---

[Useful linked page](https://links.example.com/articles/2026/06/a-very-long-path-that-should-keep-its-ending-when-displayed?with=query#final-section)

This is context around the linked page.
EOS

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"

symlink_post="$SITE_ROOT/site/pages/posts/example-post.md"
real_post=$(CDPATH= cd -- "$POSTS_STORE" && pwd -P)/example-post.md

assert_eq 'posts/example-post.md' "$(blog_post_rel_path_for_file "$symlink_post" 2>/dev/null || printf '')" 'post rel path accepts mounted symlink path'
assert_eq 'posts/example-post.md' "$(blog_post_rel_path_for_file "$real_post" 2>/dev/null || printf '')" 'post rel path accepts canonical mounted path'
assert_eq 'posts/example-post.md' "$(blog_managed_post_rel_path_for_file "$symlink_post" 2>/dev/null || printf '')" 'managed post path accepts mounted symlink path'
assert_eq 'posts/example-post.md' "$(blog_managed_post_rel_path_for_file "$real_post" 2>/dev/null || printf '')" 'managed post path accepts canonical mounted path'

post_context_output=$(QUERY_STRING='path=posts/example-post' REQUEST_METHOD=GET "$ROOT_DIR/cgi/blog-post-context")
post_context_json=$(printf '%s\n' "$post_context_output" | tail -n 1)
assert_eq 'posts/example-post.md' "$(printf '%s\n' "$post_context_json" | jq -r '.current.source_path // ""')" 'post context exposes mounted source path for admin edits'
assert_eq 'posts/example-post' "$(printf '%s\n' "$post_context_json" | jq -r '.current.path // ""')" 'post context keeps public path extensionless'

catalog_source_path=$(blog_public_posts_catalog_build_json | jq -r '.posts[] | select(.source_path == "posts/example-post.md") | .source_path')
assert_eq 'posts/example-post.md' "$catalog_source_path" 'public posts catalog exposes mounted source path for admin edits'

catalog_json=$(blog_public_posts_catalog_build_json)
link_catalog_row=$(printf '%s\n' "$catalog_json" | jq -c '.posts[] | select(.source_path == "posts/link-post.md")')
assert_eq 'link-share' "$(printf '%s\n' "$link_catalog_row" | jq -r '.type // ""')" 'public posts catalog keeps link-share post type'
assert_eq 'https://links.example.com/articles/2026/06/a-very-long-path-that-should-keep-its-ending-when-displayed?with=query#final-section' "$(printf '%s\n' "$link_catalog_row" | jq -r '.link_url // ""')" 'public posts catalog exposes link-share off-site URL'
assert_eq '[Useful linked page](https://links.example.com/articles/2026/06/a-very-long-path-that-should-keep-its-ending-when-displayed?with=query#final-section)' "$(printf '%s\n' "$link_catalog_row" | jq -r '.summary | split("\n")[0]')" 'public posts catalog preserves markdown link syntax in condensed previews'

index_output=$(REQUEST_METHOD=GET CONTENT_LENGTH=0 /bin/sh "$ROOT_DIR/cgi/blog-index")
case "$index_output" in
  *'<span class="post-offsite-link-kind">Off-site link</span><span>Linked by Link Curator</span>'*) pass ;;
  *) fail 'CGI blog index distinguishes link-share cards as off-site links linked by the post author' ;;
esac
case "$index_output" in
  *'<a href="https://links.example.com/articles/2026/06/a-very-long-path-that-should-keep-its-ending-when-displayed?with=query#final-section">Useful linked page</a>'*) pass ;;
  *) fail 'CGI blog index preserves markdown summary links as anchors' ;;
esac
case "$(blog_markdown_block_html '[unsafe](javascript:alert)')" in
  *'href="javascript:'*) fail 'markdown summary renderer rejects unsafe javascript hrefs' ;;
  *'<p>unsafe</p>'*) pass ;;
  *) fail 'markdown summary renderer degrades unsafe links to label text' ;;
esac

if [ "$FAIL_COUNT" -ne 0 ]; then
  printf 'post path runtime tests failed: %s failure(s), %s pass(es)\n' "$FAIL_COUNT" "$PASS_COUNT" >&2
  exit 1
fi

printf 'post path runtime tests passed: %s\n' "$PASS_COUNT"
