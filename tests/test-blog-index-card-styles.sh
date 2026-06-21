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

assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" "var theme = 'lapidarist';" 'theme loader defaults Gazeta to the parchment Lapidarist theme'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'themes/lapidarist.css?v=20260621-parchment-restore2' 'noscript theme fallback fetches the current parchment texture theme build'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" '__wizardryThemeStylesheetVersion' 'theme cache buster is published once for hydrated page code'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" 'blog-tag-recovery-style' 'head keeps final tag recovery styles after theme CSS'
assert_file_contains "$SITE_SOURCE_ROOT/includes/head.html" '--lapidarist-control-shadow: none;' 'head clears theme shadow variables on blog tags'
assert_file_not_contains "$SITE_SOURCE_ROOT/includes/head.html" '/static/post-resize.js' 'blog pages no longer load hidden persistent post resizing'

assert_file_not_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-main-column .post-list > .blog-post-item.blog-post-resizable {' 'blog index cards no longer carry stale resize fallbacks'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '.blog-post-item button.tag,' 'post tag chip recovery applies to the public blog DOM without requiring a main-content wrapper'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'html body .blog-post-item button.tag,' 'post tag chip recovery wins after the global soft-button rule'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'html body .blog-post-item .tag,' 'post tag chip recovery wins after theme-specific button rules'
assert_file_not_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '.blog-main-column .post-list > .blog-post-item.blog-post-resizable' 'theme no longer ships post resize-specific selectors'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '--lapidarist-parchment-page-texture: url("/static/textures/lapidarist-parchment.webp");' 'Lapidarist theme publishes the page parchment texture URL'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'var(--lapidarist-parchment-page-texture)' 'Lapidarist page canvas uses the parchment texture variable'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'rgba(153, 188, 235, 0.32)' 'Lapidarist page background keeps the recovered light blue top wash'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'rgba(236, 244, 255, 0.95)' 'Lapidarist page background keeps the recovered light blue base'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" 'rgba(214, 228, 247, 0.95)' 'Lapidarist page background keeps the recovered lower blue shade'
assert_file_contains "$SITE_SOURCE_ROOT/static/themes/lapidarist.css" '--page-canvas-bg-size: auto, auto, auto, var(--lapidarist-page-parchment-size);' 'Lapidarist page canvas sizes the parchment texture layer'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'border-color: var(--post-tag-standard-border) !important;' 'standard post tag chips keep the recovered yellow treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '--post-tag-type-bg: #dff4d7;' 'type post tag chips use the green treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" '--post-tag-year-bg: #dcecff;' 'year post tag chips use the blue treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background: var(--post-tag-type-bg) !important;' 'type post tag chip recovery keeps the green treatment'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'background: var(--post-tag-year-bg) !important;' 'year post tag chip recovery keeps the blue treatment'
assert_file_contains "$ROOT_DIR/cgi/blog-open-post" 'style_css_version='"'"'20260621-parchment-restore2'"'" 'direct post fallback uses the current style cache key'
assert_file_contains "$ROOT_DIR/cgi/blog-open-post" 'cat "$head_file"' 'direct post fallback includes the normal theme stylesheet head'
assert_file_contains "$ROOT_DIR/cgi/blog-delivery" 'style_css_version='"'"'20260621-parchment-restore2'"'" 'delivery page uses the current style cache key'
assert_file_contains "$ROOT_DIR/cgi/blog-delivery" 'cat "$head_file"' 'delivery page includes the normal theme stylesheet head'
assert_file_contains "$ROOT_DIR/cgi/blog-delivery" 'cat "$nav_file"' 'delivery page includes the normal themed navbar'
assert_file_contains "$ROOT_DIR/cgi/blog-delivery" 'cat "$footer_file"' 'delivery page includes the normal themed footer'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'padding: 1.75rem 3.25rem 1.55rem;' 'single post card keeps the original inner gutter instead of the Spark-era squeeze'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'filter: none !important;' 'post tag chips do not blur'
assert_file_contains "$SITE_SOURCE_ROOT/static/style.css" 'box-shadow: none !important;' 'post tag chips do not use the old hazy shadow'

printf '%s\n' 'ok'
