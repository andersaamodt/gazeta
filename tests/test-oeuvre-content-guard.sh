#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

assert_jq() {
  json=$1
  filter=$2
  label=$3
  if printf '%s\n' "$json" | jq -e "$filter" >/dev/null 2>&1; then
    pass
  else
    fail "$label"
  fi
}

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/oeuvre-content-guard.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export WIZARDRY_SITE_NAME=testsite
mkdir -p "$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME/site/pages" "$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"

# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-lib.sh"
# shellcheck disable=SC1091
. "$ROOT_DIR/cgi/blog-list-common.sh"

missing_recent_link_state='{
  "slug": "oeuvre",
  "group_by": "year",
  "elements": [
    {"type":"entry","date":"2026","markdown":"[Pieplate](https://andersaamodt.com/pieplate/)"},
    {"type":"entry","date":"2025","markdown":"Libertywave music genre"},
    {"type":"entry","date":"2025","markdown":"Doing Nothing on Purpose (Semanthesis essay)"},
    {"type":"entry","date":"2024","markdown":"[/r/sorceryofthespectacle Subreddit Quest](https://www.reddit.com/r/sorceryofthespectacle/comments/1jr7udd/quest_note_b_some_notes_on_the_subreddit_quest/)"}
  ]
}'

messages=$(blog_list_oeuvre_protected_content_messages_json "$missing_recent_link_state")
assert_jq "$messages" 'length == 1 and (.[0] | contains("Libertywave music genre"))' 'Oeuvre guard flags unlinked protected 2024-2026 content'
validation=$(blog_list_validate_and_enrich_state_json "$missing_recent_link_state" true)
assert_jq "$validation" '.can_publish == false and (.errors[] | contains("Libertywave music genre"))' 'Oeuvre validation blocks publishing when protected recent links disappear'

fixed_recent_links_state='{
  "slug": "oeuvre",
  "group_by": "year",
  "elements": [
    {"type":"entry","date":"2026","markdown":"[Pieplate](https://andersaamodt.com/pieplate/)"},
    {"type":"entry","date":"2025","markdown":"[Libertywave music genre](https://suno.com/playlist/6a853492-6af4-4141-aae0-faa48715b1e1)"},
    {"type":"entry","date":"2025","markdown":"Doing Nothing on Purpose (Semanthesis essay)"},
    {"type":"entry","date":"2024","markdown":"[/r/sorceryofthespectacle Subreddit Quest](https://www.reddit.com/r/sorceryofthespectacle/comments/1jr7udd/quest_note_b_some_notes_on_the_subreddit_quest/)"}
  ]
}'

messages=$(blog_list_oeuvre_protected_content_messages_json "$fixed_recent_links_state")
assert_jq "$messages" 'length == 0' 'Oeuvre guard allows linked 2024-2026 content and the Semanthesis exception'
validation=$(blog_list_validate_and_enrich_state_json "$fixed_recent_links_state" true)
assert_jq "$validation" '.can_publish == true' 'Oeuvre validation allows publishing when protected recent links are intact'

new_domain_state=$(printf '%s\n' "$fixed_recent_links_state" | jq -c '.elements[0].markdown = "[Pieplate](https://new.andersaamodt.com/pieplate/)"')
messages=$(blog_list_oeuvre_protected_content_messages_json "$new_domain_state")
assert_jq "$messages" 'length == 1 and (.[0] | contains("new.andersaamodt.com"))' 'Oeuvre guard rejects links to new.andersaamodt.com'

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf '%s passed, %s failed\n' "$PASS_COUNT" "$FAIL_COUNT" >&2
  exit 1
fi

printf '%s passed\n' "$PASS_COUNT"
