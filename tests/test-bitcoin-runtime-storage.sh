#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
ROOT_DIR=$(dirname "$SCRIPT_DIR")

node_script="$ROOT_DIR/.headquarters/scripts/ensure-site-bitcoin-node.sh"
snapshot_script="$ROOT_DIR/.headquarters/scripts/ensure-site-bitcoin-assumeutxo.sh"
lightning_script="$ROOT_DIR/.headquarters/scripts/ensure-site-lightning-node.sh"

assert_contains() {
  file=$1
  needle=$2
  label=$3
  grep -Fq -- "$needle" "$file" || {
    printf 'FAIL: %s (missing: %s in %s)\n' "$label" "$needle" "$file" >&2
    exit 1
  }
}

assert_not_contains() {
  file=$1
  needle=$2
  label=$3
  if grep -Fq -- "$needle" "$file"; then
    printf 'FAIL: %s (unexpected: %s in %s)\n' "$label" "$needle" "$file" >&2
    exit 1
  fi
}

assert_contains "$node_script" "printf '/var/lib/gazeta/%s/bitcoin" 'Bitcoin node uses host-local state'
assert_contains "$node_script" 'migrate_legacy_directory "$(legacy_bitcoin_data_dir)" "$(bitcoin_data_dir)"' 'Legacy blockchain data is migrated'
assert_contains "$node_script" 'migrate_legacy_directory "$(legacy_bitcoin_snapshot_dir)" "$(bitcoin_snapshot_dir)"' 'Legacy snapshots are migrated'
assert_contains "$node_script" '-pid=$(bitcoin_pid_file)' 'Bitcoin PID is host-local'
assert_contains "$snapshot_script" "printf '/var/lib/gazeta/%s/bitcoin" 'AssumeUTXO uses host-local state'
assert_contains "$lightning_script" "printf '/var/lib/gazeta/%s/bitcoin/data" 'Lightning reads host-local Bitcoin state'

assert_not_contains "$node_script" 'printf '\''%s/data\\n'\'' "$(bitcoin_root)"' 'Bitcoin node must not write chain data into site data'
assert_not_contains "$snapshot_script" 'printf '\''%s/snapshots\\n'\'' "$(bitcoin_root)"' 'AssumeUTXO must not write snapshots into site data'
assert_not_contains "$lightning_script" 'printf '\''%s/data\\n'\'' "$(bitcoin_root)"' 'Lightning must not depend on Bitcoin chain data in site data'

TMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/bitcoin-storage-test.XXXXXX")
trap 'rm -rf "$TMP_ROOT"' EXIT INT TERM
legacy_dir="$TMP_ROOT/legacy"
state_dir="$TMP_ROOT/state"
mkdir -p "$legacy_dir"
printf 'block data\n' > "$legacy_dir/blk00000.dat"

run_root() {
  "$@"
}

status_bad() {
  printf 'status=bad\n' >&2
}

eval "$(awk '
  /^directory_has_entries\(\)/ { capture = 1 }
  /^ensure_bitcoin_storage\(\)/ { capture = 0 }
  capture { print }
' "$node_script")"

migrate_legacy_directory "$legacy_dir" "$state_dir" 'test data'
[ ! -e "$legacy_dir" ] || {
  printf 'FAIL: migration left the legacy directory behind\n' >&2
  exit 1
}
[ "$(cat "$state_dir/blk00000.dat")" = 'block data' ] || {
  printf 'FAIL: migration did not preserve blockchain data\n' >&2
  exit 1
}

printf 'Bitcoin runtime storage regression checks passed.\n'
