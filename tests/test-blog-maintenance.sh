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

payload=$(/bin/sh "$ROOT_DIR/cgi/blog-maintenance" rebuild-indexes)

printf '%s\n' "$payload" | jq -e '.success == true and .post_count == 1' >/dev/null
printf '%s\n' "$payload" | jq -e '.rebuilt == ["public-posts"]' >/dev/null
[ -f "$SITE_ROOT/site/static/public-posts.json" ]
[ -f "$SITE_DATA/public-posts-cache.json" ]
jq -e '.posts[0].title == "Maintenance Post"' "$SITE_ROOT/site/static/public-posts.json" >/dev/null

search_payload=$(/bin/sh "$ROOT_DIR/cgi/blog-maintenance" rebuild-search-index)
printf '%s\n' "$search_payload" | jq -e '.success == true and .rebuilt == ["search-index"] and .entry_count == 1' >/dev/null
[ -f "$SITE_ROOT/site/static/search-index.json" ]
[ -f "$SITE_DATA/search-index-cache.json" ]
jq -e '.entries[0].title == "Maintenance Post"' "$SITE_ROOT/site/static/search-index.json" >/dev/null
jq -e '.entries[0].search_text | contains("Maintenance body.")' "$SITE_ROOT/site/static/search-index.json" >/dev/null

mkdir -p "$SITE_DATA/lists"
cat > "$SITE_DATA/nostr-pages.json" <<'JSON'
{"pages":[{"slug":"maintenance-product","type":"nip23","kind":30023,"show_in_nav":false,"placeholder_title":"Maintenance Product","path":"/maintenance-product"}]}
JSON
cat > "$SITE_DATA/lists/maintenance-product.json" <<'JSON'
{"slug":"maintenance-product","type":"nip23","title":"Maintenance Product","content":"Product body","product_enabled":true,"product_type":"software","price":"12.50","currency":"USD","purchase_endpoint":"/purchase/maintenance-product","crypto_discount_percent":0}
JSON
product_payload=$(/bin/sh "$ROOT_DIR/cgi/blog-maintenance" rebuild-product-index)
printf '%s\n' "$product_payload" | jq -e '.success == true and .rebuilt == ["product-index"] and .product_count == 1' >/dev/null
[ -f "$SITE_ROOT/site/static/product-index.json" ]
[ -f "$SITE_DATA/product-index-cache.json" ]
jq -e '.products[0].slug == "maintenance-product"' "$SITE_ROOT/site/static/product-index.json" >/dev/null
jq -e '.products[0].price == "12.50"' "$SITE_ROOT/site/static/product-index.json" >/dev/null

navbar_payload=$(/bin/sh "$ROOT_DIR/cgi/blog-maintenance" rebuild-navbar-pages)
printf '%s\n' "$navbar_payload" | jq -e '.success == true and .rebuilt == ["navbar-pages"]' >/dev/null
[ -f "$SITE_ROOT/site/static/navbar-pages.json" ]
[ -f "$SITE_DATA/navbar-pages-cache.json" ]
printf '%s\n' "$navbar_payload" | jq -e 'has("page_count")' >/dev/null

bad=$(/bin/sh "$ROOT_DIR/cgi/blog-maintenance" unknown-action)
printf '%s\n' "$bad" | jq -e '.success == false and .code == "bad_action"' >/dev/null

printf '%s\n' 'blog maintenance tests passed'
