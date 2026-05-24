#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
SITE_SOURCE_ROOT="$ROOT_DIR/site"

check_script_then_marked() {
  file=$1
  local_script=$2
  matched_lines=$(awk -v needle="$local_script" 'index($0, needle) { print NR }' "$file")
  [ -n "$matched_lines" ] || {
    printf '%s\n' "missing $local_script in $file" >&2
    return 1
  }

  found_nearby=no
  for local_line in $matched_lines; do
    start_line=$((local_line - 3))
    end_line=$((local_line + 3))
    if [ "$start_line" -lt 1 ]; then
      start_line=1
    fi
    marked_nearby=$(sed -n "${start_line},${end_line}p" "$file" | awk '/marked@11\.0\.0\/marked\.min\.js/ { print "yes"; exit }')
    if [ "$marked_nearby" = "yes" ]; then
      found_nearby=yes
      break
    fi
  done

  [ "$found_nearby" = "yes" ] || {
    printf '%s\n' "expected marked include adjacent to $local_script in $file" >&2
    return 1
  }
}

check_script_present() {
  file=$1
  local_script=$2
  local_line=$(awk -v needle="$local_script" 'index($0, needle) { print NR; exit }' "$file")
  [ -n "$local_line" ] || {
    printf '%s\n' "missing $local_script in $file" >&2
    return 1
  }
}

check_generated_shell() {
  slug=$1
  page_type=$2
  local_script=$3
  marked_required=${4-yes}
  tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/nostr-page-shell-test.XXXXXX")
  trap 'rm -rf "$tmp_root"' EXIT INT TERM

  export WIZARDRY_SITES_DIR="$tmp_root/sites"
  export WIZARDRY_SITE_NAME="testsite"
  mkdir -p "$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME/site/pages"
  mkdir -p "$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"
  mkdir -p "$tmp_root/bin"
  cat > "$tmp_root/bin/config-get" <<'EOS'
#!/bin/sh
exit 1
EOS
  chmod +x "$tmp_root/bin/config-get"
  PATH="$tmp_root/bin:$PATH"
  export PATH

  . "$ROOT_DIR/cgi/blog-lib.sh"
  . "$ROOT_DIR/cgi/blog-nostr-pages-common.sh"

  blog_init
  blog_nostr_page_ensure_source_page "$slug" "$page_type"

  generated_file="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME/content/pages/$slug.md"
  [ -f "$generated_file" ] || {
    printf '%s\n' "generated $page_type page missing: $generated_file" >&2
    return 1
  }
  if [ "$marked_required" = "yes" ]; then
    check_script_then_marked "$generated_file" "$local_script"
  else
    check_script_present "$generated_file" "$local_script"
  fi

  rm -rf "$tmp_root"
  trap - EXIT INT TERM
}

check_generated_shell "blog" "blog" '/static/blog-page.js' no
check_generated_shell "about" "nip23" '/static/nip23-page.js' yes
check_generated_shell "list" "list" '/static/list-page.js' yes
check_script_then_marked "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/contact-page.js'
check_script_then_marked "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/nip23-page.js'
check_script_then_marked "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/public-ranking-page.js'
check_script_then_marked "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/list-page.js'
check_script_present "$ROOT_DIR/cgi/blog-nostr-pages-common.sh" '/static/nostr-page-bootstrap/$slug.js'
check_script_present "$ROOT_DIR/cgi/pre-build" 'blog-prerender-nostr-page-bootstraps'
check_generated_shell "assignments" "public-ranking" '/static/public-ranking-page.js' yes

printf '%s\n' 'ok'
