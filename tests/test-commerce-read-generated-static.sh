#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-commerce-generated.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT HUP INT TERM

export HOME="$TMP_ROOT/home"
export XDG_STATE_HOME="$TMP_ROOT/xdg-state"
export WIZARDRY_SITES_DIR="$HOME/git/sites"
export WIZARDRY_SITE_NAME="example.test"
export GAZETA_THEURGY_ALLOW_CARGO=1
export RUSTUP_TOOLCHAIN="${RUSTUP_TOOLCHAIN:-stable-aarch64-apple-darwin}"

SITE_ROOT="$WIZARDRY_SITES_DIR/$WIZARDRY_SITE_NAME"
SITE_DATA="$XDG_STATE_HOME/gazeta/sites-data/$WIZARDRY_SITE_NAME"
GENERATED_ROOT="$XDG_STATE_HOME/gazeta/generated/$WIZARDRY_SITE_NAME"

mkdir -p "$SITE_ROOT" "$SITE_DATA" "$GENERATED_ROOT/static"

cat > "$GENERATED_ROOT/static/product-index.json" <<'JSON'
{"success":true,"products":[{"slug":"generated-product","title":"Generated Product","price":"9.99","currency":"USD"}]}
JSON

output=$(REQUEST_METHOD=GET QUERY_STRING='slug=generated-product' /bin/sh "$ROOT_DIR/cgi/blog-get-product")
json=$(printf '%s\n' "$output" | sed -n '/^{/,$p')

printf '%s\n' "$json" | jq -e '.success == true' >/dev/null
printf '%s\n' "$json" | jq -e '.product.slug == "generated-product" and .product.price == "9.99"' >/dev/null

printf '%s\n' 'commerce generated static tests passed'
