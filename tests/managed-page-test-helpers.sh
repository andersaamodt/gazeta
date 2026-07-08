#!/bin/sh

managed_page_title_shell_html() {
  title_id=$1
  title_text=$2
  actions_id=$3
  actions_class=${4-list-page-title-actions}
  printf '%s' "<h1 id=\"$title_id\"><span class=\"list-page-title-text\">$title_text</span><span id=\"$actions_id\" class=\"$actions_class\"></span><span data-page-nav-title-host=\"true\" class=\"list-page-nav-title-row-wrap\"></span></h1>"
}

require_managed_page_title_shell() {
  file=$1
  title_id=$2
  title_text=$3
  actions_id=$4
  label=$5
  actions_class=${6-list-page-title-actions}
  expected=$(managed_page_title_shell_html "$title_id" "$title_text" "$actions_id" "$actions_class")
  if grep -Fq -- "$expected" "$file"; then
    return 0
  fi
  : "$label"
  return 1
}

assert_managed_page_title_shell() {
  file=$1
  title_id=$2
  title_text=$3
  actions_id=$4
  label=$5
  actions_class=${6-list-page-title-actions}
  expected=$(managed_page_title_shell_html "$title_id" "$title_text" "$actions_id" "$actions_class")
  if grep -Fq -- "$expected" "$file"; then
    pass
  else
    fail "$label (missing: $expected in $file)"
  fi
}
