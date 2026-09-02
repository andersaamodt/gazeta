#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")
TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/gazeta-runtime-cache.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM

mkdir -p "$TMP_ROOT/bin"
cat > "$TMP_ROOT/bin/cargo" <<'EOF'
#!/bin/sh
set -eu
count_file=${GAZETA_TEST_CARGO_COUNT:?}
count=$(cat "$count_file" 2>/dev/null || printf '0')
printf '%s\n' "$((count + 1))" > "$count_file"
mkdir -p "$CARGO_TARGET_DIR/release"
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--bin" ] && [ "$#" -ge 2 ]; then
    shift
    : > "$CARGO_TARGET_DIR/release/$1"
    chmod +x "$CARGO_TARGET_DIR/release/$1"
  fi
  shift
done
EOF
chmod +x "$TMP_ROOT/bin/cargo"

export PATH="$TMP_ROOT/bin:$PATH"
export GAZETA_STATE_DIR="$TMP_ROOT/state"
export GAZETA_TEST_CARGO_COUNT="$TMP_ROOT/cargo-count"

"$ROOT_DIR/cgi/install-theurgy-runtime" >/dev/null
"$ROOT_DIR/cgi/install-theurgy-runtime" >/dev/null

[ "$(cat "$GAZETA_TEST_CARGO_COUNT")" = "1" ] || {
  printf '%s\n' "unchanged Gazeta runtime sources were compiled more than once" >&2
  exit 1
}

printf '%s\n' "stale" > "$GAZETA_STATE_DIR/cargo-target/.gazeta-runtime-source-signature"
"$ROOT_DIR/cgi/install-theurgy-runtime" >/dev/null
[ "$(cat "$GAZETA_TEST_CARGO_COUNT")" = "2" ] || {
  printf '%s\n' "changed Gazeta runtime signature did not trigger a rebuild" >&2
  exit 1
}

printf '%s\n' "ok"
