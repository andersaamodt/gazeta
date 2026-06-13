#!/bin/sh
# Shared path helpers for Gazeta local tooling.

set -eu

gazeta_state_dir() {
  if [ -n "${GAZETA_STATE_DIR:-}" ]; then
    printf '%s\n' "$GAZETA_STATE_DIR"
    return 0
  fi
  xdg_state_home=${XDG_STATE_HOME:-$HOME/.local/state}
  printf '%s/gazeta\n' "$xdg_state_home"
}

gazeta_cargo_target_dir() {
  if [ -n "${CARGO_TARGET_DIR:-}" ]; then
    printf '%s\n' "$CARGO_TARGET_DIR"
    return 0
  fi
  printf '%s/cargo-target\n' "$(gazeta_state_dir)"
}

gazeta_runtime_path() {
  profile=$1
  binary=$2
  printf '%s/%s/%s\n' "$(gazeta_cargo_target_dir)" "$profile" "$binary"
}
