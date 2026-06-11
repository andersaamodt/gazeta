#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-commerce-read-adapter.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

export GAZETA_COMMERCE_READ_RUNTIME=/bin/echo
export WIZARDRY_SITES_DIR="$TMP_ROOT/sites"
export WIZARDRY_SITE_NAME="example.test"

mkdir -p "$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"

output=$(/bin/sh "$ROOT_DIR/cgi/blog-get-product")
[ "$output" = "blog-get-product" ]

bad_output=$(/bin/sh "$ROOT_DIR/cgi/gazeta-commerce-read-runtime-adapter" invalid-action)
printf '%s\n' "$bad_output" | grep '"success":false' >/dev/null
printf '%s\n' "$bad_output" | grep '"code":"bad_action"' >/dev/null

printf '%s\n' 'gazeta commerce read adapter tests passed'
