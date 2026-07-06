#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-lodestone-projections.XXXXXX")
trap 'rm -rf "$tmp_root"' EXIT INT TERM

mkdir -p \
  "$tmp_root/cgi" \
  "$tmp_root/scripts" \
  "$tmp_root/site/lodestone/pages/embed" \
  "$tmp_root/site/pages/embed"

cp "$ROOT_DIR/scripts/sync-lodestone-page-projections" "$tmp_root/scripts/"
chmod +x "$tmp_root/scripts/sync-lodestone-page-projections"

cat > "$tmp_root/cgi/blog-nostr-pages-common.sh" <<'EOFVARS'
#!/bin/sh
blog_page_js_version='fixture-version'
EOFVARS
chmod +x "$tmp_root/cgi/blog-nostr-pages-common.sh"

cat > "$tmp_root/cgi/gazeta-lodestone" <<'EOFLODE'
#!/bin/sh
set -eu
action=${1-}
source_file=${2-}
[ "$action" = "render-md" ] || {
  printf '%s\n' "fake gazeta-lodestone only supports render-md" >&2
  exit 1
}
[ -f "$source_file" ] || {
  printf '%s\n' "missing source file: $source_file" >&2
  exit 1
}
cat "$source_file"
EOFLODE
chmod +x "$tmp_root/cgi/gazeta-lodestone"

for projection_rel in \
  admin.md \
  artificer.md \
  blog.md \
  cart.md \
  checkout.md \
  embed/video-chat.md \
  login-security.md \
  search.md
do
  stone_path="$tmp_root/site/lodestone/pages/${projection_rel%.md}.stone.html"
  projection_path="$tmp_root/site/pages/$projection_rel"
  mkdir -p "$(dirname "$stone_path")" "$(dirname "$projection_path")"
  printf '%s\n' "fixture ${projection_rel%.md}" > "$stone_path"
  cp "$stone_path" "$projection_path"
done

"$tmp_root/scripts/sync-lodestone-page-projections" --check

printf '\n<!-- stale projection -->\n' >> "$tmp_root/site/pages/blog.md"
if "$tmp_root/scripts/sync-lodestone-page-projections" --check; then
  printf '%s\n' "projection check unexpectedly passed after drift" >&2
  exit 1
fi

"$tmp_root/scripts/sync-lodestone-page-projections" sync >/dev/null
"$tmp_root/scripts/sync-lodestone-page-projections" --check

if grep -Fq 'stale projection' "$tmp_root/site/pages/blog.md"; then
  printf '%s\n' "projection sync did not restore blog.md" >&2
  exit 1
fi

printf '%s\n' "lodestone page projection sync ok"
