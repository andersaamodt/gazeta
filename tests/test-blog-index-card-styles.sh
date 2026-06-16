#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
SITE_SOURCE_ROOT="$ROOT_DIR/site"

fail() {
  printf '%s\n' "not ok - $1" >&2
  exit 1
}

assert_file_contains() {
  file=$1
  pattern=$2
  description=$3
  if ! grep -Fq -- "$pattern" "$file"; then
    fail "$description"
  fi
}

assert_file_not_contains() {
  file=$1
  pattern=$2
  description=$3
  if grep -Fq -- "$pattern" "$file"; then
    fail "$description"
  fi
}

assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'themes/archmage.css?v=20260526-title-action-edge1' 'theme cache buster fetches the current title-action theme build'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" '__wizardryThemeStylesheetVersion' 'theme cache buster is published once for hydrated page code'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'blog-tag-recovery-style' 'head keeps final tag recovery styles after theme CSS'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" '--lapidarist-control-shadow: none;' 'head clears theme shadow variables on blog tags'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/head.html" '/static/post-resize.js' 'blog pages no longer load hidden persistent post resizing'

assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-main-column .post-list > .blog-post-item.blog-post-resizable {' 'blog index cards no longer carry stale resize fallbacks'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-post-item button.tag,' 'post tag chip recovery applies to the public blog DOM without requiring a main-content wrapper'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'html body .blog-post-item button.tag,' 'post tag chip recovery wins after the global soft-button rule'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'html body .blog-post-item .tag,' 'post tag chip recovery wins after theme-specific button rules'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '.blog-main-column .post-list > .blog-post-item.blog-post-resizable' 'theme no longer ships post resize-specific selectors'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-color: var(--post-tag-standard-border) !important;' 'standard post tag chips keep the recovered yellow treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '--post-tag-type-bg: #dff4d7;' 'type post tag chips use the green treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '--post-tag-year-bg: #dcecff;' 'year post tag chips use the blue treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background: var(--post-tag-type-bg) !important;' 'type post tag chip recovery keeps the green treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background: var(--post-tag-year-bg) !important;' 'year post tag chip recovery keeps the blue treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'filter: none !important;' 'post tag chips do not blur'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'box-shadow: none !important;' 'post tag chips do not use the old hazy shadow'

printf '%s\n' 'ok'
