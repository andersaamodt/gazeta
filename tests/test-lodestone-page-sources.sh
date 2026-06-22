#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
export GAZETA_LODESTONE="${GAZETA_LODESTONE:-$ROOT_DIR/../lodestone/spells/lodestone}"

tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-lodestone-pages.XXXXXX")
trap 'rm -rf "$tmp_root"' EXIT INT TERM

export WIZARDRY_SITES_DIR="$tmp_root/sites"
export WIZARDRY_SITE_NAME="testsite"
site_root="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
state_root="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"

mkdir -p "$site_root" "$state_root"
cp -R "$ROOT_DIR/cgi" "$ROOT_DIR/site" "$site_root/"

cat > "$site_root/site.conf" <<'EOFCONF'
template=blog
theme=lapidarist
site_title=Example Site
append_site_title_to_page_title=false
EOFCONF

mkdir -p "$tmp_root/bin"
cat > "$tmp_root/bin/config-get" <<'EOFCONFIG'
#!/bin/sh
set -eu
file=$1
key=$2
awk -F= -v wanted="$key" '$1 == wanted { sub(/^[^=]*=/, "", $0); print; found=1; exit } END { if (!found) exit 1 }' "$file"
EOFCONFIG
chmod +x "$tmp_root/bin/config-get"
PATH="$tmp_root/bin:$PATH"
export PATH

posts_store="$state_root/content/posts"
mkdir -p "$posts_store" "$site_root/site/pages"
rm -rf "$site_root/site/pages/posts"
ln -s "$posts_store" "$site_root/site/pages/posts"
cat > "$posts_store/lodestone-rendered-post.md" <<'POST'
---
title: "Lodestone Rendered Post"
visibility: "public"
published_at: "2026-06-21T12:00:00Z"
tags: ["blog"]
post_type: "longform"
summary: "Rendered from [structured data](/structured-data)."
---

The post body proves public post catalog generation has a concrete source.
POST

cat > "$state_root/nostr-pages.json" <<'JSON'
{
  "pages": [
    {"slug":"blog","type":"blog","show_in_nav":true,"placeholder_title":"Blog"},
    {"slug":"contact","type":"contact","show_in_nav":true,"placeholder_title":"Contact"},
    {"slug":"values","type":"nip23","show_in_nav":true,"placeholder_title":"Values"},
    {"slug":"projects","type":"public-ranking","show_in_nav":true,"placeholder_title":"Projects"},
    {"slug":"overworld","type":"overworld","show_in_nav":true,"placeholder_title":"Overworld"},
    {"slug":"reading-list","type":"list","show_in_nav":true,"placeholder_title":"Reading List"},
    {"slug":"software","type":"software-gallery","show_in_nav":true,"placeholder_title":"Software"}
  ]
}
JSON

"$site_root/cgi/pre-build"

for rel in \
  admin.md \
  artificer.md \
  blog.md \
  cart.md \
  checkout.md \
  embed/video-chat.md \
  login-security.md \
  search.md
do
  stone_file="$site_root/site/lodestone/pages/${rel%.md}.stone.html"
  [ -f "$stone_file" ] || {
    printf '%s\n' "missing lodestone source for $rel" >&2
    exit 1
  }
done

for page in blog contact values projects overworld reading-list software; do
  grep -Fq 'data-lodestone-root="page"' "$site_root/site/pages/$page.md" || {
    printf '%s\n' "$page page missing lodestone render root" >&2
    exit 1
  }
done

grep -Fq 'data-prerender-painted="true"' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing prerender data from lodestone render" >&2
  exit 1
}

grep -Fq '/static/compose-shared.js?v=20260403-compose1' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing script from lodestone source" >&2
  exit 1
}

grep -Fq 'data-lodestone-component="blog-post-card"' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page posts were not rendered by lodestone" >&2
  exit 1
}

grep -Fq '"$render_lodestone_cmd" render-md "$render_template"' "$site_root/cgi/blog-nostr-pages-common.sh" || {
  printf '%s\n' "blog prerender branch does not render through lodestone" >&2
  exit 1
}

grep -Fq -- '--html-file "posts_json=$render_posts_tmp"' "$site_root/cgi/blog-nostr-pages-common.sh" || {
  printf '%s\n' "blog prerender branch does not pass structured post data to lodestone" >&2
  exit 1
}

grep -Fq 'v0.7.13' "$ROOT_DIR/site/includes/footer.md" || {
  printf '%s\n' "footer version was not incremented" >&2
  exit 1
}

printf '%s\n' "ok"
