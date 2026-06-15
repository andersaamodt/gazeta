#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
script="$ROOT_DIR/cgi/blog-manage-noster"

sh -n "$script"

if grep -nE '\$local_root/target/(debug|release)|/target/(debug|release)' "$script" >/tmp/gazeta-stonr-target-grep.$$; then
  cat /tmp/gazeta-stonr-target-grep.$$ >&2
  rm -f /tmp/gazeta-stonr-target-grep.$$
  printf '%s\n' "Stonr control path must not use repo-local cargo target output" >&2
  exit 1
fi
rm -f /tmp/gazeta-stonr-target-grep.$$

if grep -nE 'brew[[:space:]]+install|command[[:space:]]+-v[[:space:]]+brew' "$script" >/tmp/gazeta-stonr-brew-grep.$$; then
  cat /tmp/gazeta-stonr-brew-grep.$$ >&2
  rm -f /tmp/gazeta-stonr-brew-grep.$$
  printf '%s\n' "Gazeta must not use Homebrew as an installer fallback" >&2
  exit 1
fi
rm -f /tmp/gazeta-stonr-brew-grep.$$

printf '%s\n' "stonr install path checks passed"
