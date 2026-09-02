#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-lodestone-compatibility.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

cat > "$TMP_ROOT/lodestone-old" <<'EOF'
#!/bin/sh
case "${1-}" in
  --help) printf '%s\n' 'Usage: lodestone render FILE'; exit 0 ;;
esac
printf '%s\n' "$*"
EOF
chmod +x "$TMP_ROOT/lodestone-old"

old_args=$(GAZETA_LODESTONE="$TMP_ROOT/lodestone-old" "$ROOT_DIR/cgi/gazeta-lodestone" render-md fixture.stone.html --set title=Fixture)
case "$old_args" in
  *--component-command*)
    printf '%s\n' "Gazeta passed an unsupported component option to old Lodestone" >&2
    exit 1
    ;;
esac

cat > "$TMP_ROOT/lodestone-new" <<'EOF'
#!/bin/sh
case "${1-}" in
  --help) printf '%s\n' 'Usage: lodestone render FILE --component-command PATH'; exit 0 ;;
esac
printf '%s\n' "$*"
EOF
chmod +x "$TMP_ROOT/lodestone-new"

new_args=$(GAZETA_LODESTONE="$TMP_ROOT/lodestone-new" "$ROOT_DIR/cgi/gazeta-lodestone" render-md fixture.stone.html --set title=Fixture)
case "$new_args" in
  *--component-command*) ;;
  *)
    printf '%s\n' "Gazeta did not supply its component renderer to current Lodestone" >&2
    exit 1
    ;;
esac

grep -Fq '{@html post_list_html}' "$ROOT_DIR/site/lodestone/pages/blog.stone.html" || {
  printf '%s\n' "Blog template is missing its old-Lodestone post-list fallback" >&2
  exit 1
}

printf '%s\n' "ok"
