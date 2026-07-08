#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
REAL_HOME=${HOME:-}
export GAZETA_LODESTONE="${GAZETA_LODESTONE:-$ROOT_DIR/../lodestone/spells/lodestone}"
export GAZETA_SKIP_THEURGY_RUNTIME_BUILD=1

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

cat > "$site_root/site/pages/projects.md" <<'PROJECTS'
---
title: "Projects"
published_at: "2026-04-15T00:00:00Z"
content_hash: ""
tags: ["nostr", "public-ranking"]
author: "author"
visibility: "public"
license: "CC BY 4.0"
---

<div data-lodestone-root="page" data-lodestone-render="universal">
<section id="public-ranking-root" class="list-page-shell public-ranking-shell" data-ranking-slug="projects" data-page-type="public-ranking" data-page-title="Projects">
<div id="public-ranking-content" class="list-page-content">
<p class="list-page-empty-state">No content yet.</p>
</div>
</section>
</div>
PROJECTS

"$site_root/cgi/pre-build"

for stone_rel in \
  admin.stone.html \
  artificer.stone.html \
  blog.stone.html \
  cart.stone.html \
  checkout.stone.html \
  embed/video-chat.stone.html \
  login-security.stone.html \
  search.stone.html
do
  stone_file="$site_root/site/lodestone/pages/$stone_rel"
  [ -f "$stone_file" ] || {
    printf '%s\n' "missing lodestone source for $stone_rel" >&2
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

grep -Fq '<h1 id="blog-page-title"><span class="list-page-title-text">Blog</span><span id="blog-page-title-actions" class="list-page-title-actions"></span><span data-page-nav-title-host="true" class="list-page-nav-title-row-wrap"></span></h1>' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing hydration-matching prerendered title shell from lodestone render" >&2
  exit 1
}

grep -Fq '<p id="blog-page-description" class="muted" hidden><span class="list-page-description-text">' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing hydration-matching prerendered description shell from lodestone render" >&2
  exit 1
}

grep -Fq '<div id="blog-draft-notice" class="blog-draft-notice" hidden></div>' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing Lodestone-owned draft notice shell" >&2
  exit 1
}

grep -Fq '/static/compose-shared.js?v=20260403-compose1' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing script from lodestone source" >&2
  exit 1
}

grep -Fq '<div id="blog-post-list" class="post-list" data-gazeta-component="blog-post-list"' "$site_root/site/pages/blog.md" &&
  grep -Fq '<article class="post-item blog-post-item' "$site_root/site/pages/blog.md" &&
  grep -Fq 'Lodestone Rendered Post' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing Lodestone-rendered post cards" >&2
  exit 1
}

grep -Fq '<div id="blog-filter-tags" class="blog-filter-options">' "$site_root/site/pages/blog.md" &&
  grep -Fq 'class="blog-filter-chip" data-filter-group="tags" data-filter-value="blog" aria-pressed="false">blog</button>' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing Lodestone-rendered tag filter chips" >&2
  exit 1
}

if grep -Fq '<div data-gazeta-component="blog-post-list">' "$site_root/site/pages/blog.md"; then
  printf '%s\n' "blog page kept a nested prerender wrapper that hydration does not own" >&2
  exit 1
fi

if grep -Fq '<gazeta-blog-post-list posts=' "$site_root/site/pages/blog.md"; then
  printf '%s\n' "blog page shipped an unexpanded Lodestone post-list component" >&2
  exit 1
fi

grep -Fq '<section id="public-ranking-root"' "$site_root/site/pages/projects.md" || {
  printf '%s\n' "projects page missing public-ranking shell" >&2
  exit 1
}

grep -Fq '<h1 id="public-ranking-title"><span class="list-page-title-text">Projects</span><span id="public-ranking-page-title-actions" class="list-page-title-actions public-ranking-sync-actions"></span><span data-page-nav-title-host="true" class="list-page-nav-title-row-wrap"></span></h1>' "$site_root/site/pages/projects.md" || {
  printf '%s\n' "projects page missing hydration-matching public-ranking title shell" >&2
  exit 1
}

grep -Fq '<p class="list-page-empty-state">No content yet.</p>' "$site_root/site/pages/projects.md" || {
  printf '%s\n' "projects page missing prerendered empty state" >&2
  exit 1
}

projects_root_count=$(grep -F '<section id="public-ranking-root"' "$site_root/site/pages/projects.md" | wc -l | tr -d ' ')
[ "$projects_root_count" = "1" ] || {
  printf '%s\n' "projects page rendered nested public-ranking shells" >&2
  exit 1
}

grep -Fq '<h1 id="list-page-title"><span class="list-page-title-text">' "$site_root/site/pages/reading-list.md" &&
  grep -Fq '<span id="list-page-title-actions" class="list-page-title-actions"></span><span data-page-nav-title-host="true" class="list-page-nav-title-row-wrap"></span></h1>' "$site_root/site/pages/reading-list.md" || {
  printf '%s\n' "reading-list page missing hydration-matching list title shell" >&2
  exit 1
}

grep -Fq '<h1 id="contact-page-title"><span class="list-page-title-text">Contact</span><span id="contact-page-title-actions" class="list-page-title-actions"></span><span data-page-nav-title-host="true" class="list-page-nav-title-row-wrap"></span></h1>' "$site_root/site/pages/contact.md" || {
  printf '%s\n' "contact page missing hydration-matching contact title shell" >&2
  exit 1
}

for stone_file in \
  "$site_root/site/lodestone/pages/blog.stone.html" \
  "$site_root/site/lodestone/templates/list.stone.html" \
  "$site_root/site/lodestone/templates/icon-gallery.stone.html" \
  "$site_root/site/lodestone/templates/contact.stone.html" \
  "$site_root/site/lodestone/templates/nip23.stone.html" \
  "$site_root/site/lodestone/templates/public-ranking.stone.html" \
  "$site_root/site/lodestone/templates/overworld.stone.html"
do
  if grep -Eq '<(nostr-sync-pill|gazeta-sync-pill)\b' "$stone_file"; then
    printf '%s\n' "$stone_file emits a duplicate static sync pill" >&2
    exit 1
  fi
done

local_site_name="local-template-site"
local_site_root="$WIZARDRY_SITES_DIR/$local_site_name"
local_state_root="$WIZARDRY_SITES_DIR/.sitedata/$local_site_name"
mkdir -p "$local_site_root" "$local_state_root"
cp -R "$ROOT_DIR/cgi" "$ROOT_DIR/site" "$local_site_root/"
cat > "$local_site_root/site.conf" <<EOFCONF
template=blog
theme=lapidarist
site_title=Local Template Fixture
append_site_title_to_page_title=false
local-template=$ROOT_DIR
EOFCONF

local_posts_store="$local_state_root/content/posts"
mkdir -p "$local_posts_store" "$local_site_root/site/pages"
rm -rf "$local_site_root/site/pages/posts"
ln -s "$local_posts_store" "$local_site_root/site/pages/posts"
cat > "$local_posts_store/local-template-post.md" <<'POST'
---
title: "Local Template Post"
visibility: "public"
published_at: "2026-06-21T12:00:00Z"
tags: ["blog"]
post_type: "longform"
summary: "Rendered from current repo-owned template sources."
---

This post proves local-template build sources came from the current repo.
POST
cat > "$local_state_root/nostr-pages.json" <<'JSON'
{
  "pages": [
    {"slug":"blog","type":"blog","show_in_nav":true,"placeholder_title":"Blog"}
  ]
}
JSON
cat > "$local_site_root/site/lodestone/pages/blog.stone.html" <<'EOFBLOGSTALE'
---
title: Blog
---

<lode-page>
<section id="blog-page-root" class="blog-page" data-blog-slug={slug} data-page-type="blog" aria-live="polite"{@html prerender_attrs}>
<div class="blog-main-column">
<div class="list-page-head">
<h1 id="blog-page-title" hidden></h1>
<nostr-sync-pill slug={slug}></nostr-sync-pill>
<p id="blog-page-description" class="muted" hidden></p>
</div>
</div>
</section>
<script src="/static/nostr-page-bootstrap/{slug}.js"></script>
<lode-script src="/static/blog-page.js?v={blog_page_js_version}" />
</lode-page>
EOFBLOGSTALE
printf '%s\n' 'console.log("stale blog page js");' > "$local_site_root/site/static/blog-page.js"

WIZARDRY_SITE_NAME="$local_site_name" "$local_site_root/cgi/pre-build"

grep -Fq '<h1 id="blog-page-title"><span class="list-page-title-text">Blog</span><span id="blog-page-title-actions" class="list-page-title-actions"></span><span data-page-nav-title-host="true" class="list-page-nav-title-row-wrap"></span></h1>' "$local_site_root/site/pages/blog.md" || {
  printf '%s\n' "local-template build still rendered stale site-owned blog head instead of repo template head" >&2
  exit 1
}

if grep -Fq '<nostr-sync-pill slug=' "$local_site_root/site/pages/blog.md"; then
  printf '%s\n' "local-template build still emitted stale static sync pill from site-owned blog template copy" >&2
  exit 1
fi

cmp -s "$ROOT_DIR/site/static/blog-page.js" "$local_site_root/site/static/blog-page.js" || {
  printf '%s\n' "local-template build did not refresh stale site-owned blog-page.js from repo template sources" >&2
  exit 1
}

if grep -Fq '&lt;section id=&quot;public-ranking-root&quot;' "$site_root/site/pages/projects.md" ||
   grep -Fq '&lt;div data-lodestone-root=&quot;page&quot;' "$site_root/site/pages/projects.md"; then
  printf '%s\n' "projects page escaped its previous generated shell into content" >&2
  exit 1
fi

export HOME="$tmp_root/home"
export XDG_STATE_HOME="$tmp_root/xdg-state"
if [ -n "$REAL_HOME" ]; then
  export RUSTUP_HOME="${RUSTUP_HOME:-$REAL_HOME/.rustup}"
  export CARGO_HOME="${CARGO_HOME:-$REAL_HOME/.cargo}"
fi
export WIZARDRY_SITES_DIR="$HOME/git/sites"
export WIZARDRY_SITE_NAME="git-lodestone.test"
git_site_root="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
git_state_root="$XDG_STATE_HOME/gazeta/sites-data/$WIZARDRY_SITE_NAME"
git_generated_root="$XDG_STATE_HOME/gazeta/generated/$WIZARDRY_SITE_NAME"

mkdir -p "$git_site_root" "$git_state_root/content/posts"
cp -R "$ROOT_DIR/cgi" "$ROOT_DIR/site" "$git_site_root/"
cat > "$git_site_root/site.conf" <<'EOFCONF'
template=blog
theme=lapidarist
site_title=Git Checkout Site
append_site_title_to_page_title=false
EOFCONF

mkdir -p "$git_site_root/site/pages"
cat > "$git_site_root/site/pages/blog.md" <<'SENTINEL'
---
title: Sentinel Blog
---

Repo-local source sentinel.
SENTINEL
rm -rf "$git_site_root/site/pages/posts"
ln -s "$git_state_root/content/posts" "$git_site_root/site/pages/posts"

"$git_site_root/cgi/pre-build"

grep -Fq 'Repo-local source sentinel.' "$git_site_root/site/pages/blog.md" || {
  printf '%s\n' "git checkout pre-build rewrote repo-local blog.md" >&2
  exit 1
}
[ -f "$git_generated_root/pages/blog.md" ] || {
  printf '%s\n' "git checkout pre-build did not render Lodestone blog page into generated pages root" >&2
  exit 1
}
grep -Fq 'data-lodestone-root="page"' "$git_generated_root/pages/blog.md" || {
  printf '%s\n' "generated Lodestone blog page missing render root" >&2
  exit 1
}
[ -f "$git_generated_root/static/site-bootstrap.js" ] || {
  printf '%s\n' "git checkout pre-build did not write generated static bootstrap" >&2
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

grep -Fq 'v0.7.60' "$ROOT_DIR/site/includes/footer.md" || {
  printf '%s\n' "footer version was not incremented" >&2
  exit 1
}

printf '%s\n' "ok"
