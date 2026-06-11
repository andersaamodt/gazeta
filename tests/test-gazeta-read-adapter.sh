#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-read-adapter.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

export GAZETA_READ_RUNTIME=/bin/echo
export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export WIZARDRY_SITE_NAME="example.test"

mkdir -p "$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"

for endpoint in \
  "blog-list-public-posts list-public-posts" \
  "blog-list-navbar-pages list-navbar-pages" \
  "blog-btc-usd-rate btc-usd-rate" \
  "blog-archive blog-archive" \
  "blog-index blog-index" \
  "blog-tags blog-tags"
do
  set -- $endpoint
  output=$(/bin/sh "$ROOT_DIR/cgi/$1")
  [ "$output" = "$2" ]
done

bad_output=$(/bin/sh "$ROOT_DIR/cgi/gazeta-read-runtime-adapter" invalid-action)
printf '%s\n' "$bad_output" | grep '"success":false' >/dev/null
printf '%s\n' "$bad_output" | grep '"code":"bad_action"' >/dev/null

printf '%s\n' 'gazeta read adapter tests passed'
