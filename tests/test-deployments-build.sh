#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/deployments-build.XXXXXX")
cleanup() {
  rm -rf "$tmp_root"
}
trap 'cleanup' EXIT INT TERM

export HOME="$tmp_root/home"
release_dir="$HOME/git/gazeta"
release_dir_real=
sites_root="$HOME/sites"
site_name="example.test"
site_root="$sites_root/$site_name"
site_data_root="$sites_root/.sitedata/$site_name"
wizardry_dir="$tmp_root/wizardry"
build_dir="$tmp_root/build-output"
manifest_path="$tmp_root/build-manifest.json"
original_site_conf="$tmp_root/original-site.conf"

mkdir -p "$release_dir" "$site_root" "$site_data_root/content/posts" "$site_data_root/files/legacy-assets/oeuvre" "$wizardry_dir/spells/web"
release_dir_real=$(CDPATH= cd -- "$release_dir" && pwd -P)
mkdir -p "$release_dir/cgi" "$release_dir/site/lodestone/pages"

cat > "$release_dir/cgi/pre-build" <<'EOFPREBUILD'
#!/bin/sh
set -eu
exit 0
EOFPREBUILD
chmod +x "$release_dir/cgi/pre-build"

cat > "$release_dir/cgi/blog-prerender-nostr-page-bootstraps" <<'EOFPRERENDER'
#!/bin/sh
set -eu
[ "${BLOG_NOSTR_PAGE_PRERENDER_FORCE:-}" = "1" ] || {
  printf '%s\n' 'deployment prerender was not forced' >&2
  exit 1
}
[ "$WIZARDRY_SITE_NAME" = "example.test" ] || {
  printf '%s\n' 'deployment prerender used the wrong site name' >&2
  exit 1
}
[ -f "$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME/site.conf" ] || {
  printf '%s\n' 'deployment prerender could not read the staged site configuration' >&2
  exit 1
}
[ -f "$WIZARDRY_SITES_DATA_DIR/$WIZARDRY_SITE_NAME/content/posts/fixture-post.md" ] || {
  printf '%s\n' 'deployment prerender could not read live site data' >&2
  exit 1
}
mkdir -p "$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME/site/pages"
printf '%s\n' 'filtered writing prerender' > "$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME/site/pages/index.md"
EOFPRERENDER
chmod +x "$release_dir/cgi/blog-prerender-nostr-page-bootstraps"

cat > "$release_dir/site/lodestone/pages/blog.stone.html" <<'EOFBLOG'
<main>Fixture blog template</main>
EOFBLOG

cat > "$site_root/site.conf" <<EOFCONF
domain=$site_name
local-template=$release_dir
site_title=Fixture Site
EOFCONF
cp "$site_root/site.conf" "$original_site_conf"

cat > "$site_data_root/content/posts/fixture-post.md" <<'EOFPOST'
---
title: Fixture Post
published_at: 2026-07-06T00:00:00Z
---

Fixture content
EOFPOST
printf '%s\n' 'fixture-video' > "$site_data_root/files/legacy-assets/oeuvre/ultramemes.mkv"
mkdir -p "$site_data_root/files/legacy-assets/root"
printf '%s\n' 'fixture-root-alias' > "$site_data_root/files/legacy-assets/root/essay"
printf '%s\n' 'fixture-pdf' > "$site_data_root/files/fixture-public.pdf"

cat > "$wizardry_dir/spells/web/build" <<'EOFBUILD'
#!/bin/sh
set -eu
site_name=$1
mode=${2-}
site_root="$WEB_WIZARDRY_ROOT/$site_name"
site_conf="$site_root/site.conf"
build_dir=$(awk -F= '$1 == "build-dir" { value=$0; sub(/^[^=]*=/, "", value); print value; exit }' "$site_conf")
template_dir=$(awk -F= '$1 == "local-template" { value=$0; sub(/^[^=]*=/, "", value); print value; exit }' "$site_conf")
template_dir=$(CDPATH= cd -- "$template_dir" && pwd -P)
post_title=$(awk '/^title:/ { sub(/^title:[[:space:]]*/, "", $0); print; exit }' "$WEB_WIZARDRY_ROOT/.sitedata/$site_name/content/posts/fixture-post.md")
[ -n "$build_dir" ] || {
  printf '%s\n' "missing build-dir in $site_conf" >&2
  exit 1
}
[ -d "$site_root/cgi" ] || {
  printf '%s\n' "deployment build did not stage repo-owned cgi code" >&2
  exit 1
}
[ -d "$site_root/site" ] || {
  printf '%s\n' "deployment build did not stage repo-owned site assets" >&2
  exit 1
}
[ ! -e "$site_root/cgi/blog-prerender-nostr-page-bootstraps" ] || {
  printf '%s\n' "deployment build left the prerender helper enabled during the nested build" >&2
  exit 1
}
[ "$(cat "$site_root/site/pages/index.md")" = "filtered writing prerender" ] || {
  printf '%s\n' "deployment build did not refresh the prerender before the nested build" >&2
  exit 1
}
cmp -s "$template_dir/cgi/pre-build" "$site_root/cgi/pre-build" || {
  printf '%s\n' "deployment build staged the wrong cgi code" >&2
  exit 1
}
[ -f "$site_root/site/lodestone/pages/blog.stone.html" ] || {
  printf '%s\n' "deployment build staged the wrong site asset tree" >&2
  exit 1
}
[ "$(readlink "$WEB_WIZARDRY_ROOT/.sitedata/$site_name")" = "$WIZARDRY_SITES_DATA_DIR/$site_name" ] || {
  printf '%s\n' "deployment build did not mount live site data into the staged site root" >&2
  exit 1
}
[ "$(awk -F= '$1 == "blog_legacy_asset_mode" { value=$0; sub(/^[^=]*=/, "", value); print value; exit }' "$site_conf")" = "manifest" ] || {
  printf '%s\n' "deployment build did not configure manifest-mode legacy assets" >&2
  exit 1
}
[ "$(awk -F= '$1 == "blog_public_file_alias_mode" { value=$0; sub(/^[^=]*=/, "", value); print value; exit }' "$site_conf")" = "manifest" ] || {
  printf '%s\n' "deployment build did not configure manifest-mode public file aliases" >&2
  exit 1
}
[ "$(awk -F= '$1 == "blog_legacy_assets_dir" { value=$0; sub(/^[^=]*=/, "", value); print value; exit }' "$site_conf")" = "$WIZARDRY_SITES_DATA_DIR/$site_name/files/legacy-assets" ] || {
  printf '%s\n' "deployment build did not point legacy assets at live site data" >&2
  exit 1
}
[ "$(awk -F= '$1 == "nostr_page_prerender_enabled" { value=$0; sub(/^[^=]*=/, "", value); print value; exit }' "$site_conf")" = "false" ] || {
  printf '%s\n' "deployment build did not disable prerender for deployments" >&2
  exit 1
}
[ "$mode" = "--full" ] || {
  printf '%s\n' "expected --full build mode" >&2
  exit 1
}
mkdir -p "$build_dir/pages"
cat > "$build_dir/pages/blog.html" <<EOFHTML
site=$site_name
template=$template_dir
post=$post_title
EOFHTML
printf 'fixture-public.pdf\t%s\t11\t0\n' "$WIZARDRY_SITES_DATA_DIR/$site_name/files/fixture-public.pdf" > "$build_dir/.file-aliases.manifest"
printf 'essay\t%s\n' "$WIZARDRY_SITES_DATA_DIR/$site_name/files/legacy-assets/root/essay" > "$build_dir/.legacy-asset-aliases.manifest"
EOFBUILD
chmod +x "$wizardry_dir/spells/web/build"

DEPLOYMENTS_RELEASE_DIR="$release_dir" \
WIZARDRY_DIR="$wizardry_dir" \
DEPLOYMENTS_BUILD_MANIFEST="$manifest_path" \
"$ROOT_DIR/scripts/deployments-build" "$build_dir"

[ -f "$build_dir/pages/blog.html" ] || {
  printf '%s\n' "deployment build did not create blog page" >&2
  exit 1
}
grep -Fq 'site=example.test' "$build_dir/pages/blog.html" || {
  printf '%s\n' "deployment build used the wrong site name" >&2
  exit 1
}
grep -Fq "template=$release_dir_real" "$build_dir/pages/blog.html" || {
  printf '%s\n' "deployment build did not resolve the template-backed site" >&2
  exit 1
}
grep -Fq 'post=Fixture Post' "$build_dir/pages/blog.html" || {
  printf '%s\n' "deployment build did not use live site data" >&2
  exit 1
}
[ ! -e "$release_dir/site.conf" ] || {
  printf '%s\n' "deployment build left a synthetic site.conf in the template repo" >&2
  exit 1
}
cmp -s "$original_site_conf" "$site_root/site.conf" || {
  printf '%s\n' "deployment build did not restore the live site.conf" >&2
  exit 1
}
[ -L "$build_dir/static/legacy-assets" ] || {
  printf '%s\n' "deployment build did not link legacy assets from site data" >&2
  exit 1
}
[ "$(readlink "$build_dir/static/legacy-assets")" = "$site_data_root/files/legacy-assets" ] || {
  printf '%s\n' "legacy assets symlink points to the wrong site data directory" >&2
  exit 1
}
[ -L "$build_dir/oeuvre/ultramemes.mkv" ] || {
  printf '%s\n' "deployment build did not link the oeuvre video alias" >&2
  exit 1
}
[ -L "$build_dir/fixture-public.pdf" ] || {
  printf '%s\n' "deployment build did not link manifest-mode public file aliases" >&2
  exit 1
}
[ "$(readlink "$build_dir/fixture-public.pdf")" = "$site_data_root/files/fixture-public.pdf" ] || {
  printf '%s\n' "manifest-mode public file alias points to the wrong source file" >&2
  exit 1
}
[ -L "$build_dir/essay" ] || {
  printf '%s\n' "deployment build did not link legacy clean-url aliases from the manifest" >&2
  exit 1
}
[ "$(readlink "$build_dir/essay")" = "$site_data_root/files/legacy-assets/root/essay" ] || {
  printf '%s\n' "legacy clean-url alias points to the wrong source file" >&2
  exit 1
}
grep -Fq '"site_name":"example.test"' "$manifest_path" || {
  printf '%s\n' "deployment manifest did not record the resolved site name" >&2
  exit 1
}

printf '%s\n' 'deployment template-site resolution tests passed'
