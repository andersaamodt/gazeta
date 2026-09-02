#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

if grep -Fq -- '--arg label ' "$ROOT_DIR/cgi/blog-post-cards-common.sh" ||
  grep -Fq -- '(\$label |' "$ROOT_DIR/cgi/blog-post-cards-common.sh" ||
  grep -Fq -- '(\$label |' "$ROOT_DIR/cgi/gazeta-nostr-page-content-renderer.sh"; then
  printf '%s\n' "prerender jq uses the jq 1.6 reserved label variable" >&2
  exit 1
fi

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-post-cards-common.sh"
actual=$(blog_post_cards_filter_chip_html tags adamance adamance false)
expected='<button type="button" class="blog-filter-chip" data-filter-group="tags" data-filter-value="adamance" aria-pressed="false">adamance</button>'
[ "$actual" = "$expected" ] || {
  printf '%s\n' "blog filter chip renderer returned unexpected HTML" >&2
  exit 1
}

printf '%s\n' "ok"
