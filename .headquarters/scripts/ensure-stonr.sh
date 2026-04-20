#!/bin/sh
set -eu

STONR_REPO_URL=${STONR_REPO_URL:-https://github.com/andersaamodt/stonr.git}
STONR_COMMIT=${STONR_COMMIT:-b020dc1e1b1799910f329f531b60a5d2b714ea41}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
    return 0
  fi
  if [ -n "${HQ_REMOTE_SUDO_PASSWORD-}" ] && command -v sudo >/dev/null 2>&1; then
    printf '%s\n' "$HQ_REMOTE_SUDO_PASSWORD" | sudo -S -p '' "$@"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
    return $?
  fi
  "$@"
}

status_ok() {
  printf 'status=ok\n'
  printf 'summary=%s\n' "$1"
}

status_bad() {
  printf 'status=bad\n'
  printf 'summary=%s\n' "$1"
}

ensure_rust() {
  if command -v cargo >/dev/null 2>&1 && command -v rustc >/dev/null 2>&1; then
    return 0
  fi
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  export PATH="$HOME/.cargo/bin:$PATH"
  command -v cargo >/dev/null 2>&1
  command -v rustc >/dev/null 2>&1
}

installed_version() {
  stonr --version 2>/dev/null | awk 'NR == 1 { print; exit }'
}

check_status() {
  if command -v stonr >/dev/null 2>&1; then
    version=$(installed_version 2>/dev/null || printf 'stonr installed')
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet stonr 2>/dev/null; then
      status_ok "Stonr is installed ($version) and the stonr service is active."
    else
      status_ok "Stonr is installed ($version)."
    fi
    return 0
  fi
  status_bad "Stonr is not installed on this server."
  return 0
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

if command -v stonr >/dev/null 2>&1; then
  check_status
  exit 0
fi

case "$(uname -s 2>/dev/null || printf '')" in
  Linux) ;;
  *)
    status_bad "Stonr installer only supports Linux hosts."
    exit 1
    ;;
esac

run_root env DEBIAN_FRONTEND=noninteractive apt-get update
run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
  build-essential \
  ca-certificates \
  curl \
  git \
  libssl-dev \
  pkg-config

ensure_rust
export PATH="$HOME/.cargo/bin:$PATH"

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/stonr-install.XXXXXX")
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

git clone "$STONR_REPO_URL" "$tmp_dir/stonr"
(
  cd "$tmp_dir/stonr"
  git checkout "$STONR_COMMIT"
  cargo build --release -p stonr
  run_root install -m 0755 -o root -g root "target/release/stonr" /usr/local/bin/stonr
)

check_status
