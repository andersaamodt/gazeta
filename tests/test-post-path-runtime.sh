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

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-post-path.XXXXXX")
cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT INT TERM

export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export WIZARDRY_SITE_NAME="example.test"

SITE_ROOT="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
SITE_DATA="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"
POSTS_STORE="$SITE_DATA/content/posts"

mkdir -p \
  "$SITE_ROOT/site/pages" \
  "$SITE_DATA/ssh-auth/sessions" \
  "$SITE_DATA/ssh-auth/users/admin" \
  "$POSTS_STORE"
ln -s "$POSTS_STORE" "$SITE_ROOT/site/pages/posts"

session_token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
csrf_token=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
expires_at=$(( $(date +%s) + 3600 ))

cat > "$SITE_DATA/ssh-auth/users/admin/profile.conf" <<EOF
username=admin
is_admin=true
fingerprint=admin-fingerprint
EOF

cat > "$SITE_DATA/ssh-auth/sessions/$session_token.conf" <<EOF
username=admin
csrf_token=$csrf_token
expires_at=$expires_at
is_admin=true
EOF

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

/bin/sh "$ROOT_DIR/cgi/blog-maintenance" rebuild-public-posts >/dev/null

symlink_post="$SITE_ROOT/site/pages/posts/example-post.md"
real_post=$(CDPATH= cd -- "$POSTS_STORE" && pwd -P)/example-post.md

assert_eq 'posts/example-post.md' "$(blog_post_rel_path_for_file "$symlink_post" 2>/dev/null || printf '')" 'post rel path accepts mounted symlink path'
assert_eq 'posts/example-post.md' "$(blog_post_rel_path_for_file "$real_post" 2>/dev/null || printf '')" 'post rel path accepts canonical mounted path'
assert_eq 'posts/example-post.md' "$(blog_managed_post_rel_path_for_file "$symlink_post" 2>/dev/null || printf '')" 'managed post path accepts mounted symlink path'
assert_eq 'posts/example-post.md' "$(blog_managed_post_rel_path_for_file "$real_post" 2>/dev/null || printf '')" 'managed post path accepts canonical mounted path'

post_context_output=$(GAZETA_THEURGY_ALLOW_CARGO=1 QUERY_STRING='path=posts/example-post' REQUEST_METHOD=GET "$ROOT_DIR/cgi/blog-post-context")
post_context_json=$(printf '%s\n' "$post_context_output" | tail -n 1)
assert_eq 'posts/example-post.md' "$(printf '%s\n' "$post_context_json" | jq -r '.current.source_path // ""')" 'post context exposes mounted source path for admin edits'
assert_eq 'posts/example-post' "$(printf '%s\n' "$post_context_json" | jq -r '.current.path // ""')" 'post context keeps public path extensionless'
assert_eq 'unpublished_local_changes' "$(printf '%s\n' "$post_context_json" | jq -r '.sync_status.status // ""')" 'post context marks local-only posts as unpublished server changes'
assert_eq 'true' "$(printf '%s\n' "$post_context_json" | jq -r '.sync_status.local_has_source // false')" 'post context reports local source presence for single posts'
assert_eq 'false' "$(printf '%s\n' "$post_context_json" | jq -r '.sync_status.has_canonical_event | tostring')" 'post context reports local-only single posts without a published Nostr event'

catalog_source_path=$(blog_public_posts_catalog_build_json | jq -r '.posts[] | select(.source_path == "posts/example-post.md") | .source_path')
assert_eq 'posts/example-post.md' "$catalog_source_path" 'public posts catalog exposes mounted source path for admin edits'

edit_body="post_path=$(blog_url_encode 'posts/example-post.md')&session_token=$session_token&csrf_token=$csrf_token"
edit_json=$(printf '%s' "$edit_body" |
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=POST \
  CONTENT_TYPE=application/x-www-form-urlencoded \
  CONTENT_LENGTH=${#edit_body} \
  /bin/sh "$ROOT_DIR/cgi/blog-create-draft-from-post" |
  sed -n '/^{/,$p')
edit_draft_id=$(printf '%s\n' "$edit_json" | jq -r '.draft_id // ""')
case "$edit_json" in
  *'"success":true'*) pass ;;
  *) fail 'create draft from post succeeds for an existing published post' ;;
esac
case "$edit_draft_id" in
  '') fail 'create draft from post returns a draft id' ;;
  *) pass ;;
esac
assert_eq 'true' "$(test -f "$POSTS_STORE/example-post.md" && printf true || printf false)" 'creating an edit draft preserves the published markdown file'
assert_eq 'posts/example-post.md' "$(blog_public_posts_catalog_build_json | jq -r '.posts[] | select(.source_path == "posts/example-post.md") | .source_path')" 'creating an edit draft keeps the post in the public catalog'
assert_eq '0' "$(wc -l < "$SITE_DATA/nostr/state/hidden_posts.txt" | tr -d ' ')" 'creating an edit draft does not hide the post from Nostr projection state'
draft_list_body="session_token=$session_token&csrf_token=$csrf_token"
draft_list_json=$(printf '%s' "$draft_list_body" |
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=POST \
  CONTENT_TYPE=application/x-www-form-urlencoded \
  CONTENT_LENGTH=${#draft_list_body} \
  /bin/sh "$ROOT_DIR/cgi/blog-list-drafts" |
  sed -n '/^{/,$p')
assert_eq "$edit_draft_id" "$(printf '%s\n' "$draft_list_json" | jq -r '.drafts[] | select(.source_post_path == "posts/example-post.md") | .draft_id')" 'draft list exposes source edit draft id for reopening'

edit_draft_file=$(blog_draft_resolve_file_path "$edit_draft_id")
edit_draft_title=$(blog_read_front_matter_value "$edit_draft_file" title 2>/dev/null || printf 'Untitled Draft')
edit_draft_tags=$(blog_read_front_matter_value "$edit_draft_file" tags 2>/dev/null || printf '')
edit_draft_summary=$(blog_read_front_matter_value "$edit_draft_file" summary 2>/dev/null || printf '')
edit_draft_author=$(blog_read_front_matter_value "$edit_draft_file" author 2>/dev/null || printf '')
edit_draft_content=$(blog_read_markdown_body "$edit_draft_file" 2>/dev/null || printf '')
edit_draft_post_type=$(blog_read_front_matter_value "$edit_draft_file" post_type 2>/dev/null || printf '')
edit_draft_source_post_path=$(blog_read_front_matter_value "$edit_draft_file" source_post_path 2>/dev/null || printf '')
edit_draft_post_filename=$(blog_read_front_matter_value "$edit_draft_file" post_filename 2>/dev/null || printf '')
edit_draft_origin_platforms=$(blog_read_front_matter_value "$edit_draft_file" origin_platforms 2>/dev/null || printf '[]')
blog_save_draft "$edit_draft_id" "$edit_draft_title" "$edit_draft_tags" "$edit_draft_summary" "$edit_draft_content" "$edit_draft_author" scheduled "2026-07-06T12:00:00Z" queued "$edit_draft_post_type" "$edit_draft_source_post_path" "$edit_draft_post_filename" "$edit_draft_origin_platforms"
assert_eq 'queued' "$(blog_read_front_matter_value "$edit_draft_file" status 2>/dev/null || printf '')" 'test fixture can place the edit draft into queued state before runtime unqueue'
assert_eq 'scheduled' "$(blog_read_front_matter_value "$edit_draft_file" publish_mode 2>/dev/null || printf '')" 'test fixture preserves queued publish mode before runtime unqueue'

unqueue_body="draft_id=$edit_draft_id&session_token=$session_token&csrf_token=$csrf_token"
unqueue_json=$(printf '%s' "$unqueue_body" |
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=POST \
  CONTENT_TYPE=application/x-www-form-urlencoded \
  CONTENT_LENGTH=${#unqueue_body} \
  /bin/sh "$ROOT_DIR/cgi/blog-unqueue-draft" |
  sed -n '/^{/,$p')
case "$unqueue_json" in
  *'"success":true'*) pass ;;
  *) fail 'unqueue draft succeeds for a queued edit draft' ;;
esac
assert_eq 'draft' "$(blog_read_front_matter_value "$edit_draft_file" status 2>/dev/null || printf '')" 'unqueue draft restores draft status through the runtime adapter'
assert_eq 'draft' "$(blog_read_front_matter_value "$edit_draft_file" publish_mode 2>/dev/null || printf '')" 'unqueue draft restores draft publish mode through the runtime adapter'
assert_eq '' "$(blog_read_front_matter_value "$edit_draft_file" scheduled_at 2>/dev/null || printf '')" 'unqueue draft clears scheduled time through the runtime adapter'

delete_draft_body="draft_id=$edit_draft_id&session_token=$session_token&csrf_token=$csrf_token"
delete_draft_json=$(printf '%s' "$delete_draft_body" |
  GAZETA_THEURGY_ALLOW_CARGO=1 \
  REQUEST_METHOD=POST \
  CONTENT_TYPE=application/x-www-form-urlencoded \
  CONTENT_LENGTH=${#delete_draft_body} \
  /bin/sh "$ROOT_DIR/cgi/blog-delete-draft" |
  sed -n '/^{/,$p')
case "$delete_draft_json" in
  *'"success":true'*) pass ;;
  *) fail 'delete draft succeeds through the runtime adapter' ;;
esac
assert_eq 'false' "$(test -f "$edit_draft_file" && printf true || printf false)" 'delete draft removes the draft file through the runtime adapter'

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
  *'<a class="post-offsite-url" href="https://links.example.com/articles/2026/06/a-very-long-path-that-should-keep-its-ending-when-displayed?with=query#final-section"'*) pass ;;
  *) fail 'CGI blog index exposes the canonical shared off-site link note URL anchor' ;;
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
