#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

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

"$site_root/cgi/pre-build"

grep -Fq 'data-lodestone-root="page"' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing lodestone render root" >&2
  exit 1
}

grep -Fq 'data-prerender-painted="true"' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing prerender data from lodestone render" >&2
  exit 1
}

grep -Fq '/static/compose-shared.js?v=20260403-compose1' "$site_root/site/pages/blog.md" || {
  printf '%s\n' "blog page missing script from lodestone source" >&2
  exit 1
}

grep -Fq 'gazeta-lodestone" render-md "$lodestone_template"' "$site_root/cgi/blog-nostr-pages-common.sh" || {
  printf '%s\n' "blog prerender branch does not render through lodestone" >&2
  exit 1
}

grep -Fq 'v0.7.4' "$ROOT_DIR/site/includes/footer.md" || {
  printf '%s\n' "footer version was not incremented" >&2
  exit 1
}

printf '%s\n' "ok"
