#!/bin/sh
set -eu

BITCOIN_VERSION=${BITCOIN_VERSION:-31.0}

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

installed_version() {
  bitcoind --version 2>/dev/null | awk '
    NR == 1 {
      gsub(/^Bitcoin Core daemon version /, "", $0)
      gsub(/^v/, "", $0)
      print
      exit
    }
  '
}

check_status() {
  if command -v bitcoind >/dev/null 2>&1 && command -v bitcoin-cli >/dev/null 2>&1; then
    version=$(installed_version 2>/dev/null || printf '%s' "$BITCOIN_VERSION")
    if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet bitcoind 2>/dev/null; then
      status_ok "Bitcoin Core $version is installed and the bitcoind service is active."
    else
      status_ok "Bitcoin Core $version is installed."
    fi
    return 0
  fi
  status_bad "Bitcoin Core is not installed on this server."
  return 0
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

if command -v bitcoind >/dev/null 2>&1 && command -v bitcoin-cli >/dev/null 2>&1; then
  check_status
  exit 0
fi

case "$(uname -s 2>/dev/null || printf '')" in
  Linux) ;;
  *)
    status_bad "Bitcoin Core installer only supports Linux hosts."
    exit 1
    ;;
esac

case "$(uname -m 2>/dev/null || printf '')" in
  x86_64) archive="bitcoin-$BITCOIN_VERSION-x86_64-linux-gnu.tar.gz" ;;
  aarch64|arm64) archive="bitcoin-$BITCOIN_VERSION-aarch64-linux-gnu.tar.gz" ;;
  *)
    status_bad "Unsupported CPU architecture for Bitcoin Core install."
    exit 1
    ;;
esac

run_root env DEBIAN_FRONTEND=noninteractive apt-get update
run_root env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl tar xz-utils

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/bitcoin-core-install.XXXXXX")
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

url="https://bitcoincore.org/bin/bitcoin-core-$BITCOIN_VERSION/$archive"
archive_path="$tmp_dir/$archive"
curl -fsSLo "$archive_path" "$url"
tar -xzf "$archive_path" -C "$tmp_dir"

extract_dir="$tmp_dir/bitcoin-$BITCOIN_VERSION"
[ -d "$extract_dir/bin" ] || {
  status_bad "Bitcoin Core archive layout was not recognized."
  exit 1
}

for tool in "$extract_dir"/bin/*; do
  [ -f "$tool" ] || continue
  run_root install -m 0755 -o root -g root "$tool" "/usr/local/bin/$(basename "$tool")"
done

check_status
