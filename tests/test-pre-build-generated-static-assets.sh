#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/pre-build-generated-static.XXXXXX")
cleanup() {
  rm -rf "$tmp_root"
}
trap 'cleanup' EXIT INT TERM

export HOME="$tmp_root/home"
export XDG_STATE_HOME="$tmp_root/xdg-state"
export WIZARDRY_SITES_DIR="$HOME/git/sites"
export WIZARDRY_SITE_NAME="example.test"

site_root="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
canonical_root="$site_root/site"
site_data_root="$XDG_STATE_HOME/gazeta/sites-data/$WIZARDRY_SITE_NAME"
generated_root="$XDG_STATE_HOME/gazeta/generated/$WIZARDRY_SITE_NAME"

mkdir -p "$site_root"
cp -R "$ROOT_DIR/cgi" "$site_root/"
mkdir -p \
  "$canonical_root/includes" \
  "$canonical_root/pages" \
  "$canonical_root/static/themes" \
  "$canonical_root/static/textures" \
  "$site_data_root"

cat > "$site_root/site.conf" <<'EOFCONF'
template=blog
site_title=Generated Static Fixture
append_site_title_to_page_title=false
EOFCONF

cat > "$canonical_root/includes/head.html" <<'EOFHEAD'
<script defer src="/static/site-bootstrap.js"></script>
EOFHEAD

cat > "$canonical_root/includes/nav.md" <<'EOFNAV'
<nav class="site-nav">Fixture Nav</nav>
EOFNAV

cat > "$canonical_root/includes/footer.md" <<'EOFFOOT'
<footer class="site-footer">Fixture Footer</footer>
EOFFOOT

cat > "$canonical_root/static/style.css" <<'EOFSTYLE'
body { color: #123456; }
--post-tag-type-bg: #dff4d7;
--post-tag-year-bg: #dcecff;
EOFSTYLE

cat > "$canonical_root/static/themes/lapidarist.css" <<'EOFTHEME'
/* generated static theme fixture */
:root { --fixture-theme: "lapidarist"; }
EOFTHEME

printf '%s\n' 'fixture-texture' > "$canonical_root/static/textures/lapidarist-parchment.webp"

mkdir -p "$tmp_root/bin"
cat > "$tmp_root/bin/config-get" <<'EOFCONFIG'
#!/bin/sh
set -eu
file=$1
key=$2
awk -F= -v wanted="$key" '
  $1 == wanted {
    value=$0
    sub(/^[^=]*=/, "", value)
    print value
    found=1
    exit
  }
  END {
    if (!found) {
      exit 1
    }
  }
' "$file"
EOFCONFIG
chmod +x "$tmp_root/bin/config-get"
PATH="$tmp_root/bin:$PATH"
export PATH

. "$site_root/cgi/blog-lib.sh"
. "$site_root/cgi/blog-list-common.sh"
. "$site_root/cgi/blog-public-ranking-common.sh"
. "$site_root/cgi/blog-nostr-pages-common.sh"

blog_init
blog_nostr_pages_save_json '{"pages":[]}'

"$site_root/cgi/pre-build"

[ -f "$generated_root/static/themes/lapidarist.css" ] || {
  printf '%s\n' "missing generated theme stylesheet mirror" >&2
  exit 1
}
[ -f "$generated_root/static/style.css" ] || {
  printf '%s\n' "missing generated base stylesheet mirror" >&2
  exit 1
}
[ -f "$generated_root/build-static/style.css" ] || {
  printf '%s\n' "missing build-static base stylesheet mirror" >&2
  exit 1
}
[ -f "$generated_root/build-static/themes/lapidarist.css" ] || {
  printf '%s\n' "missing build-static theme stylesheet mirror" >&2
  exit 1
}
[ -f "$generated_root/static/textures/lapidarist-parchment.webp" ] || {
  printf '%s\n' "missing generated parchment texture mirror" >&2
  exit 1
}
[ -f "$generated_root/build-static/textures/lapidarist-parchment.webp" ] || {
  printf '%s\n' "missing build-static parchment texture mirror" >&2
  exit 1
}
[ -f "$generated_root/static/navbar-pages.json" ] || {
  printf '%s\n' "missing generated navbar bootstrap artifact" >&2
  exit 1
}
[ -f "$generated_root/build-static/site-bootstrap.js" ] || {
  printf '%s\n' "missing build-static site bootstrap artifact" >&2
  exit 1
}

grep -Fq 'theme: "lapidarist"' "$generated_root/static/site-bootstrap.js" || {
  printf '%s\n' "generated bootstrap did not default to the Lapidarist theme" >&2
  exit 1
}
grep -Fq 'theme: "lapidarist"' "$generated_root/build-static/site-bootstrap.js" || {
  printf '%s\n' "build-static bootstrap did not default to the Lapidarist theme" >&2
  exit 1
}
grep -Fq 'fixture-theme' "$generated_root/static/themes/lapidarist.css" || {
  printf '%s\n' "generated theme stylesheet content mismatch" >&2
  exit 1
}
cmp -s "$canonical_root/static/style.css" "$generated_root/static/style.css" || {
  printf '%s\n' "generated base stylesheet content mismatch" >&2
  exit 1
}
cmp -s "$canonical_root/static/style.css" "$generated_root/build-static/style.css" || {
  printf '%s\n' "build-static base stylesheet content mismatch" >&2
  exit 1
}
grep -Fq 'fixture-texture' "$generated_root/static/textures/lapidarist-parchment.webp" || {
  printf '%s\n' "generated parchment texture content mismatch" >&2
  exit 1
}

printf '%s\n' 'generated static asset mirroring tests passed'
