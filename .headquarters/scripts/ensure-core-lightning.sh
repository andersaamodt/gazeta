#!/bin/sh
set -eu

CLN_VERSION=${CLN_VERSION:-v25.12.1}
CLN_REPO_URL=${CLN_REPO_URL:-https://github.com/ElementsProject/lightning.git}

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

ensure_uv() {
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  command -v uv >/dev/null 2>&1
}

installed_version() {
  lightningd --version 2>/dev/null | awk 'NR == 1 { print; exit }'
}

check_status() {
  if command -v lightningd >/dev/null 2>&1 && command -v lightning-cli >/dev/null 2>&1; then
    version=$(installed_version 2>/dev/null || printf '%s' "$CLN_VERSION")
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet lightningd 2>/dev/null; then
      status_ok "Core Lightning is installed ($version) and the lightningd service is active."
    else
      status_ok "Core Lightning is installed ($version)."
    fi
    return 0
  fi
  status_bad "Core Lightning is not installed on this server."
  return 0
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

if command -v lightningd >/dev/null 2>&1 && command -v lightning-cli >/dev/null 2>&1; then
  check_status
  exit 0
fi

case "$(uname -s 2>/dev/null || printf '')" in
  Linux) ;;
  *)
    status_bad "Core Lightning installer only supports Linux hosts."
    exit 1
    ;;
esac

run_root env DEBIAN_FRONTEND=noninteractive apt-get update
run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y \
  autoconf \
  automake \
  build-essential \
  ca-certificates \
  curl \
  gettext \
  git \
  jq \
  libffi-dev \
  libsodium-dev \
  libsqlite3-dev \
  libtool \
  lowdown \
  net-tools \
  python3 \
  python3-pip \
  python3-venv \
  zlib1g-dev

ensure_uv

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/core-lightning-install.XXXXXX")
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

git clone --branch "$CLN_VERSION" --depth 1 "$CLN_REPO_URL" "$tmp_dir/lightning"

jobs=1
if command -v nproc >/dev/null 2>&1; then
  jobs=$(nproc)
fi

(
  cd "$tmp_dir/lightning"
  uv sync --all-extras --all-groups --frozen
  ./configure --disable-rust
  uv run make -j"$jobs"
  run_root make install
)

if command -v ldconfig >/dev/null 2>&1; then
  run_root ldconfig || true
fi

check_status
