#!/bin/sh
set -eu

check_script_then_marked() {
  file=$1
  local_script=$2
  local_line=$(awk -v needle="$local_script" 'index($0, needle) { print NR; exit }' "$file")
  [ -n "$local_line" ] || {
    printf '%s\n' "missing $local_script in $file" >&2
    return 1
  }
  start_line=$((local_line - 3))
  end_line=$((local_line + 3))
  if [ "$start_line" -lt 1 ]; then
    start_line=1
  fi
  marked_nearby=$(sed -n "${start_line},${end_line}p" "$file" | awk '/marked@11\.0\.0\/marked\.min\.js/ { print "yes"; exit }')
  [ "$marked_nearby" = "yes" ] || {
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

check_generated_public_ranking_shell() {
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

  . /Users/andersaamodt/git/nostr-blog/cgi/blog-lib.sh
  . /Users/andersaamodt/git/nostr-blog/cgi/blog-nostr-pages-common.sh

  blog_init
  blog_nostr_pages_save_json '{"pages":[{"slug":"assignments","type":"public-ranking","show_in_nav":true,"placeholder_title":"Assignments","path":"/assignments"}]}'
  blog_nostr_page_ensure_source_page "assignments" "public-ranking"

  generated_file="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME/content/pages/assignments.md"
  [ -f "$generated_file" ] || {
    printf '%s\n' "generated public-ranking page missing: $generated_file" >&2
    return 1
  }
  check_script_then_marked "$generated_file" '/static/public-ranking-page.js'

  rm -rf "$tmp_root"
  trap - EXIT INT TERM
}

check_script_present /Users/andersaamodt/git/nostr-blog/pages/index.md '/static/blog-page.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/pages/about.md '/static/nip23-page.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/pages/list.md '/static/list-page.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/pages/oeuvre.md '/static/list-page.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/cgi/blog-nostr-pages-common.sh '/static/nip23-page.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/cgi/blog-nostr-pages-common.sh '/static/public-ranking-page.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/cgi/blog-nostr-pages-common.sh '/static/list-page.js'
check_generated_public_ranking_shell

printf '%s\n' 'ok'
