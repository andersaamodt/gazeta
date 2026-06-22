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
  extras_after: "<nostr-sync-pill slug=\"projects\"></nostr-sync-pill>"
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

printf '%s\n' "ranking vote counting ok"
