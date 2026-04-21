#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}

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

require_site_context() {
  [ -n "$site_user" ] || {
    status_bad "HQ_SITE_USER is required for support tool provisioning."
    exit 1
  }
}

site_home() {
  printf '/home/%s\n' "$site_user"
}

site_wizardry_dir() {
  printf '%s/.wizardry\n' "$(site_home)"
}

run_site_wizardry_spell() {
  spell_rel=$1
  runtime=$(site_wizardry_dir)
  spell="$runtime/$spell_rel"
  [ -x "$spell" ] || return 1
  run_root sh -eu -c '
runtime=$1
spell=$2
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WIZARDRY_DIR=$runtime
export WIZARDRY_DIR
. "$runtime/spells/.imps/sys/invoke-wizardry" >/dev/null 2>&1 || true
if command -v yes >/dev/null 2>&1; then
  yes "" | "$spell"
else
  printf "\n\n\n\n\n" | "$spell"
fi
' sh "$runtime" "$spell"
}

have_tools() {
  command -v jq >/dev/null 2>&1 &&
    command -v pandoc >/dev/null 2>&1 &&
    command -v nostril >/dev/null 2>&1 &&
    command -v nak >/dev/null 2>&1
}

check_status() {
  require_site_context
  command -v jq >/dev/null 2>&1 || {
    status_bad "jq is not installed on this server."
    return 0
  }
  command -v pandoc >/dev/null 2>&1 || {
    status_bad "pandoc is not installed on this server."
    return 0
  }
  command -v nostril >/dev/null 2>&1 || {
    status_bad "nostril is not installed on this server."
    return 0
  }
  command -v nak >/dev/null 2>&1 || {
    status_bad "nak is not installed on this server."
    return 0
  }
  status_ok "jq, pandoc, nostril, and nak are installed for $site_user."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context

if ! command -v jq >/dev/null 2>&1; then
  run_site_wizardry_spell 'spells/web/install-jq' || {
    status_bad "jq is missing and could not be installed."
    exit 1
  }
fi

if ! command -v pandoc >/dev/null 2>&1; then
  run_site_wizardry_spell 'spells/web/install-pandoc' || {
    status_bad "pandoc is missing and could not be installed."
    exit 1
  }
fi

if ! command -v nostril >/dev/null 2>&1 || ! command -v nak >/dev/null 2>&1; then
  run_site_wizardry_spell 'spells/web/install-nostril' || {
    status_bad "nostril tooling is missing and could not be installed."
    exit 1
  }
fi

if ! have_tools; then
  status_bad "Support tool installation finished but jq, pandoc, nostril, and nak are not all available."
  exit 1
fi

status_ok "jq, pandoc, nostril, and nak are installed for $site_user."
