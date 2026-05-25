#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
STYLE_FILE="$ROOT_DIR/site/static/style.css"

if awk '
  /\.nav-cart-toggle\[hidden\][[:space:]]*\{/ { in_rule = 1 }
  in_rule && /display:[[:space:]]*none[[:space:]]*!important/ { found = 1 }
  in_rule && /\}/ { in_rule = 0 }
  END { exit found ? 0 : 1 }
' "$STYLE_FILE"; then
  printf 'PASS cart toggle hidden CSS wins before cart hydration\n'
else
  printf 'FAIL cart toggle hidden CSS rule missing\n' >&2
  exit 1
fi
