#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
SIMPLEX_WEB_ROOT=${SIMPLEX_WEB_ROOT:-"$ROOT_DIR/../simplex-web"}

if [ ! -d "$SIMPLEX_WEB_ROOT/src" ]; then
  printf 'simplex-web source root not found: %s\n' "$SIMPLEX_WEB_ROOT" >&2
  exit 1
fi

copy_file() {
  src=$1
  dest=$2
  if [ ! -f "$src" ]; then
    printf 'missing source file: %s\n' "$src" >&2
    exit 1
  fi
  cp "$src" "$dest"
}

copy_file "$SIMPLEX_WEB_ROOT/src/default-chat.js" "$ROOT_DIR/site/static/simplex-web-default-chat.js"
copy_file "$SIMPLEX_WEB_ROOT/src/session-store.js" "$ROOT_DIR/site/static/simplex-web-session-store.js"

printf 'ok\n'
