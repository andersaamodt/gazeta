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
  marked_after=$(sed -n "$((local_line + 1)),$((local_line + 3))p" "$file" | awk '/marked@11\.0\.0\/marked\.min\.js/ { print "yes"; exit }')
  [ "$marked_after" = "yes" ] || {
    printf '%s\n' "expected marked include immediately after $local_script in $file" >&2
    return 1
  }
}

check_script_then_marked /Users/andersaamodt/git/nostr-blog/pages/index.md '/static/nip23-page.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/pages/about.md '/static/nip23-page.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/pages/list.md '/static/oeuvre.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/pages/oeuvre.md '/static/oeuvre.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/cgi/blog-nostr-pages-common.sh '/static/nip23-page.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/cgi/blog-nostr-pages-common.sh '/static/public-ranking-page.js'
check_script_then_marked /Users/andersaamodt/git/nostr-blog/cgi/blog-nostr-pages-common.sh '/static/oeuvre.js'

printf '%s\n' 'ok'
