#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

tmp_root=$(mktemp -d "${TMPDIR:-/tmp}/ranking-vote-counting.XXXXXX")
cleanup() {
  rm -rf "$tmp_root"
}
trap 'cleanup' EXIT INT TERM

export WIZARDRY_SITES_DIR="$tmp_root/sites"
export WIZARDRY_SITE_NAME="testsite"
site_root="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
state_root="$WIZARDRY_SITES_DIR/.sitedata/$WIZARDRY_SITE_NAME"

mkdir -p "$site_root/site/pages" "$state_root"

. "$ROOT_DIR/cgi/blog-lib.sh"
. "$ROOT_DIR/cgi/blog-list-common.sh"
. "$ROOT_DIR/cgi/blog-public-ranking-common.sh"
. "$ROOT_DIR/cgi/blog-nostr-pages-common.sh"

blog_init

state_json='{"slug":"reading-list","title":"Reading list","allow_signed_in_votes":true}'
validation_json='{"elements":[{"type":"entry","markdown":"Book"}],"entries":[{"type":"entry","markdown":"Book"}],"errors":[],"warnings":[],"can_publish":true}'
votes_path=$(blog_list_public_votes_path reading-list)
cat > "$votes_path" <<'EOFVOTES'
{"entry_id":"entry-0","voter":"alice","value":1,"created_at":1000}
{"entry_id":"entry-0","voter":"alice","value":1,"created_at":1001}
{"entry_id":"entry-0","voter":"bob","value":1,"created_at":1002}
EOFVOTES

merged=$(blog_list_merge_public_activity_json "$state_json" "$validation_json" "alice")
list_score=$(printf '%s\n' "$merged" | jq -r '.elements[0].list_score')
viewer_total=$(printf '%s\n' "$merged" | jq -r '.elements[0].viewer_vote_total')

[ "$list_score" = "3" ] || {
  printf 'expected list score to count every stored vote, got %s\n' "$list_score" >&2
  exit 1
}
[ "$viewer_total" = "2" ] || {
  printf 'expected viewer total to count every stored viewer vote, got %s\n' "$viewer_total" >&2
  exit 1
}

if grep -Fq 'group_by(.target, .pubkey' "$ROOT_DIR/cgi/blog-public-ranking-common.sh"; then
  printf '%s\n' 'public-ranking vote scoring still collapses votes per voter' >&2
  exit 1
fi
if ! grep -Fq 'support: length' "$ROOT_DIR/cgi/blog-public-ranking-common.sh"; then
  printf '%s\n' 'public-ranking support metric is not counting total votes' >&2
  exit 1
fi

contaminated_state=$(jq -cn '{
  title: "Projects",
  content: "<div data-lodestone-root=\"page\"><section id=\"public-ranking-root\"><h1>Projects</h1></section></div>",
  extras_after: "<gazeta-sync-pill slug=\"projects\"></gazeta-sync-pill>"
}')
normalized_ranking=$(blog_public_ranking_normalize_state_json projects "$contaminated_state")
normalized_content=$(printf '%s\n' "$normalized_ranking" | jq -r '.content')
normalized_after=$(printf '%s\n' "$normalized_ranking" | jq -r '.extras_after')
[ -z "$normalized_content" ] || {
  printf '%s\n' 'public-ranking normalization preserved generated page shell content' >&2
  exit 1
}
[ -z "$normalized_after" ] || {
  printf '%s\n' 'public-ranking normalization preserved generated sync shell content' >&2
  exit 1
}

book_club_pubkey=$(printf 'a%.0s' $(seq 1 64))
work_event_id=$(printf 'b%.0s' $(seq 1 64))
list_event_id=$(printf 'c%.0s' $(seq 1 64))
vote_event_id=$(printf 'd%.0s' $(seq 1 64))
other_pubkey=$(printf 'e%.0s' $(seq 1 64))
other_list_event_id=$(printf 'f%.0s' $(seq 1 64))
work_identifier='dev.wizardry.canon:work:the-left-hand-of-darkness'
work_coordinate="30078:$book_club_pubkey:$work_identifier"

mkdir -p \
  "$blog_nostr_events_dir/$book_club_pubkey/30078" \
  "$blog_nostr_events_dir/$book_club_pubkey/30004" \
  "$blog_nostr_events_dir/$book_club_pubkey/7" \
  "$blog_nostr_events_dir/$other_pubkey/30004"

jq -cn --arg pubkey "$book_club_pubkey" '{pages:[{
  slug:"reading-list", type:"list", owner_pubkey:$pubkey,
  placeholder_title:"Reading list", path:"/reading-list", show_in_nav:true
}]}' > "$blog_state_dir/nostr-pages.json"

jq -cn \
  --arg id "$work_event_id" \
  --arg pubkey "$book_club_pubkey" \
  --arg d "$work_identifier" \
  '{
    id:$id, pubkey:$pubkey, kind:30078, created_at:100,
    content:({
      id:"the-left-hand-of-darkness", title:"The Left Hand of Darkness",
      creators:["Ursula K. Le Guin"], workType:"Book", category:"Science fiction",
      isPublished:true, publicationDate:"1969", description:"A novel of estrangement and kinship.",
      identifiers:[], sourceLinks:[], preserveCase:""
    } | tojson),
    tags:[["d",$d],["L","dev.wizardry.canon"],["l","work","dev.wizardry.canon"]]
  }' > "$blog_nostr_events_dir/$book_club_pubkey/30078/$work_event_id.json"

jq -cn \
  --arg id "$list_event_id" \
  --arg pubkey "$book_club_pubkey" \
  --arg coordinate "$work_coordinate" \
  '{
    id:$id, pubkey:$pubkey, kind:30004, created_at:101, content:"",
    tags:[["d","reading-list"],["title","Reading list"],["bookclub-list","want-to-read"],["a",$coordinate]]
  }' > "$blog_nostr_events_dir/$book_club_pubkey/30004/$list_event_id.json"

jq -cn \
  --arg id "$other_list_event_id" \
  --arg pubkey "$other_pubkey" \
  '{
    id:$id, pubkey:$pubkey, kind:30004, created_at:999, content:"",
    tags:[["d","reading-list"],["title","Someone else’s list"]]
  }' > "$blog_nostr_events_dir/$other_pubkey/30004/$other_list_event_id.json"

shared_list_event=$(blog_nostr_list_latest_event_json reading-list 30004)
[ "$(printf '%s\n' "$shared_list_event" | jq -r '.pubkey')" = "$book_club_pubkey" ] || {
  printf '%s\n' 'reading-list did not stay bound to its configured Book Club owner' >&2
  exit 1
}
shared_list_state=$(blog_list_state_from_event_json reading-list "$shared_list_event")
[ "$(printf '%s\n' "$shared_list_state" | jq -r '.elements[0].entry_id')" = "$work_coordinate" ] || {
  printf '%s\n' 'reading-list did not retain the Canon Work coordinate as its stable entry id' >&2
  exit 1
}
[ "$(printf '%s\n' "$shared_list_state" | jq -r '.elements[0].markdown')" = 'The Left Hand of Darkness by Ursula K. Le Guin' ] || {
  printf '%s\n' 'reading-list did not hydrate its display from the Canon Work event' >&2
  exit 1
}

jq -cn \
  --arg id "$vote_event_id" \
  --arg pubkey "$book_club_pubkey" \
  --arg target "$other_list_event_id" \
  --arg coordinate "$work_coordinate" \
  '{
    id:$id, pubkey:$pubkey, kind:7, created_at:102, content:"+",
    tags:[["e",$target],["a",$coordinate],["k","30078"]]
  }' > "$blog_nostr_events_dir/$book_club_pubkey/7/$vote_event_id.json"

shared_validation=$(blog_list_validate_and_enrich_state_json "$shared_list_state" false)
shared_merged=$(blog_list_merge_public_activity_json "$shared_list_state" "$shared_validation" "$book_club_pubkey")
[ "$(printf '%s\n' "$shared_merged" | jq -r '.elements[0].list_score')" = '1' ] || {
  printf '%s\n' 'reading-list did not count the coordinate-bound Work reaction as its hype score' >&2
  exit 1
}

grep -Fq 'set -- nak req -k 7 -k 30023 -k 30004 -k 30078' "$ROOT_DIR/cgi/blog-lib.sh" || {
  printf '%s\n' 'Nostr mirror does not fetch Book Club lists, Works, and reactions together' >&2
  exit 1
}
grep -Fq 'aria-label="Book Club reading-list owner pubkey"' "$ROOT_DIR/site/static/admin.js" || {
  printf '%s\n' 'reading-list owner cannot be configured from Gazeta admin' >&2
  exit 1
}

printf '%s\n' "ranking vote counting ok"
