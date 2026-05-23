#!/bin/sh
set -eu

site_user=${HQ_SITE_USER-}
helper_path=/usr/local/libexec/overworld-site-helper
helper_config=/etc/overworld-site-helper.conf

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
    status_bad "HQ_SITE_USER is required for Overworld server account provisioning."
    exit 1
  }
  case "$site_user" in
    *[!abcdefghijklmnopqrstuvwxyz0123456789_-]*|[!abcdefghijklmnopqrstuvwxyz_]*)
      status_bad "HQ_SITE_USER is not a safe system username."
      exit 1
      ;;
  esac
}

sudoers_file() {
  printf '/etc/sudoers.d/headquarters-overworld-%s\n' "$site_user"
}

player_group() {
  printf 'overworld_%s\n' "$site_user" | tr '-' '_'
}

write_helper() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/overworld-site-helper.XXXXXX")
  cat > "$tmp" <<'EOF_HELPER'
#!/bin/sh
set -eu

PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH

useradd_bin=${OVERWORLD_USERADD:-/usr/sbin/useradd}
usermod_bin=${OVERWORLD_USERMOD:-/usr/sbin/usermod}
runuser_bin=${OVERWORLD_RUNUSER:-/usr/sbin/runuser}
python_bin=${OVERWORLD_PYTHON:-/usr/bin/python3}
helper_config=${OVERWORLD_HELPER_CONFIG:-/etc/overworld-site-helper.conf}

fail_usage() {
  printf 'usage error\n' >&2
  exit 64
}

validate_account() {
  account=${1-}
  count=$(printf '%s' "$account" | wc -c | tr -d ' ')
  [ "$count" -eq 14 ] || return 1
  case "$account" in
    ow[abcdefghijklmnopqrstuvwxyz0123456789]*)
      case "$account" in
        *[!abcdefghijklmnopqrstuvwxyz0123456789]*) return 1 ;;
      esac
      ;;
    *) return 1 ;;
  esac
}

validate_bool() {
  case "${1-}" in
    true|false) return 0 ;;
    *) return 1 ;;
  esac
}

validate_int_range() {
  value=${1-}
  min=${2-}
  max=${3-}
  case "$value" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$value" -ge "$min" ] && [ "$value" -le "$max" ]
}

validate_abs_path() {
  path_value=${1-}
  [ -n "$path_value" ] || return 1
  clean=$(printf '%s' "$path_value" | tr -d '\r\n')
  [ "$clean" = "$path_value" ] || return 1
  case "$path_value" in
    /*) return 0 ;;
    *) return 1 ;;
  esac
}

normalize_public_key() {
  raw_key=${1-}
  normalized=$(printf '%s' "$raw_key" | tr '\r\n\t' '   ' | awk '{$1=$1; print}')
  [ -n "$normalized" ] || return 1
  upper=$(printf '%s' "$normalized" | tr '[:lower:]' '[:upper:]')
  case "$upper" in
    *"BEGIN OPENSSH PRIVATE KEY"*|*"BEGIN RSA PRIVATE KEY"*|*"BEGIN EC PRIVATE KEY"*|*"BEGIN DSA PRIVATE KEY"*|*"BEGIN PRIVATE KEY"*|*"PUTTY-USER-KEY-FILE-"*)
      return 1
      ;;
  esac
  key_type=$(printf '%s' "$normalized" | awk '{print $1}')
  key_body=$(printf '%s' "$normalized" | awk '{print $2}')
  [ -n "$key_type" ] && [ -n "$key_body" ] || return 1
  case "$key_type" in
    ssh-ed25519|ssh-rsa|ssh-dss|ecdsa-sha2-*|sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-*)
      ;;
    *) return 1 ;;
  esac
  case "$key_body" in
    *[!A-Za-z0-9+/=]*) return 1 ;;
  esac
  printf '%s\n' "$normalized"
}

account_home() {
  account=$1
  validate_account "$account" || return 1
  home=$(getent passwd "$account" 2>/dev/null | awk -F: 'NR==1 {print $6}')
  case "$home" in
    /*) ;;
    *) return 1 ;;
  esac
  [ -d "$home" ] || return 1
  printf '%s\n' "$home"
}

account_group() {
  account=$1
  group=$(id -gn "$account" 2>/dev/null || printf '')
  case "$group" in
    ''|*[!abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-]*)
      printf '%s\n' "$account"
      ;;
    *)
      printf '%s\n' "$group"
      ;;
  esac
}

player_group_for_caller() {
  caller=${SUDO_USER:-${OVERWORLD_SITE_USER:-}}
  case "$caller" in
    ''|*[!abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-]*)
      return 1
      ;;
  esac
  [ -f "$helper_config" ] || return 1
  awk -v site_user="$caller" '
    $1 == site_user && $2 ~ /^[A-Za-z0-9_.-]+$/ { print $2; exit }
  ' "$helper_config"
}

add_player_to_site_group() {
  account=$1
  group=$(player_group_for_caller 2>/dev/null || printf '')
  [ -n "$group" ] || return 0
  getent group "$group" >/dev/null 2>&1 || return 0
  "$usermod_bin" -a -G "$group" "$account"
}

action=${1-}
case "$action" in
  check)
    [ -x "$useradd_bin" ] || exit 1
    [ -x "$usermod_bin" ] || exit 1
    [ -x "$runuser_bin" ] || exit 1
    [ -x "$python_bin" ] || exit 1
    exit 0
    ;;
  ensure-account)
    [ "$#" -eq 3 ] || fail_usage
    account=$2
    raw_label=$3
    validate_account "$account" || fail_usage
    if id "$account" >/dev/null 2>&1; then
      add_player_to_site_group "$account"
      exit 0
    fi
    label=$(printf '%s' "$raw_label" | tr -cd 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._- ' | cut -c1-48)
    [ -n "$label" ] || label="$account"
    "$useradd_bin" -m -s /bin/sh -c "Overworld player $label" "$account"
    add_player_to_site_group "$account"
    exit 0
    ;;
  can-run)
    [ "$#" -eq 2 ] || fail_usage
    account=$2
    validate_account "$account" || fail_usage
    id "$account" >/dev/null 2>&1
    exit $?
    ;;
  can-enter)
    [ "$#" -eq 3 ] || fail_usage
    account=$2
    target_path=$3
    validate_account "$account" || fail_usage
    validate_abs_path "$target_path" || fail_usage
    "$runuser_bin" -u "$account" -- test -d "$target_path"
    "$runuser_bin" -u "$account" -- test -r "$target_path"
    "$runuser_bin" -u "$account" -- test -x "$target_path"
    exit 0
    ;;
  sync-key)
    [ "$#" -eq 3 ] || fail_usage
    account=$2
    key_file=$3
    validate_account "$account" || fail_usage
    validate_abs_path "$key_file" || fail_usage
    [ -f "$key_file" ] || exit 1
    key_size=$(wc -c < "$key_file" | tr -d ' ')
    case "$key_size" in
      ''|*[!0-9]*) exit 1 ;;
    esac
    [ "$key_size" -le 8192 ] || exit 1
    public_key=$(normalize_public_key "$(cat "$key_file")") || exit 1
    home=$(account_home "$account")
    group=$(account_group "$account")
    tmp_key=$(mktemp "${TMPDIR:-/tmp}/overworld-helper-key.XXXXXX")
    printf '%s\n' "$public_key" > "$tmp_key"
    install -d -m 700 -o "$account" -g "$group" "$home/.ssh"
    install -m 600 -o "$account" -g "$group" "$tmp_key" "$home/.ssh/authorized_keys"
    rm -f "$tmp_key"
    exit 0
    ;;
  room-json)
    [ "$#" -eq 6 ] || fail_usage
    account=$2
    show_hidden=$3
    max_entries=$4
    include_parent=$5
    room_path=$6
    validate_account "$account" || fail_usage
    validate_bool "$show_hidden" || fail_usage
    validate_bool "$include_parent" || fail_usage
    validate_int_range "$max_entries" 8 300 || fail_usage
    validate_abs_path "$room_path" || fail_usage
    OVERWORLD_SHOW_HIDDEN="$show_hidden" OVERWORLD_MAX_ENTRIES="$max_entries" OVERWORLD_INCLUDE_PARENT="$include_parent" \
      "$runuser_bin" -u "$account" -- "$python_bin" - "$room_path" <<'PY'
import json
import os
import stat
import sys

root = os.path.realpath(sys.argv[1])
show_hidden = os.environ.get("OVERWORLD_SHOW_HIDDEN") == "true"
include_parent = os.environ.get("OVERWORLD_INCLUDE_PARENT") == "true"
try:
    max_entries = max(8, min(300, int(os.environ.get("OVERWORLD_MAX_ENTRIES", "96"))))
except ValueError:
    max_entries = 96
scan_limit = max_entries * 5

def room_meta(path):
    meta = {"title": os.path.basename(path) or "/", "description": ""}
    room_file = os.path.join(path, ".room")
    try:
        with open(room_file, "r", encoding="utf-8", errors="replace") as handle:
            for raw in handle.read(4096).splitlines():
                key, sep, value = raw.rstrip("\n").partition("=")
                if sep and key in meta:
                    meta[key] = value.strip()
    except OSError:
        pass
    return meta

entries = []
truncated = False
try:
    with os.scandir(root) as scanner:
        for entry in scanner:
            name = entry.name
            if not show_hidden and name.startswith("."):
                continue
            try:
                st = entry.stat(follow_symlinks=True)
                is_dir = stat.S_ISDIR(st.st_mode)
            except OSError:
                continue
            if len(entries) >= scan_limit:
                truncated = True
                break
            entries.append({
                "name": name,
                "path": os.path.realpath(entry.path),
                "kind": "door" if is_dir else "file",
                "size": 0 if is_dir else st.st_size,
                "mode": oct(stat.S_IMODE(st.st_mode)),
            })
except OSError as exc:
    print(json.dumps({"path": root, "title": os.path.basename(root) or "/", "description": "", "entries": [], "error": str(exc)}))
    raise SystemExit(0)

entries.sort(key=lambda item: (item["kind"] != "door", item["name"].lower(), item["name"]))
meta = room_meta(root)
parent_path = os.path.realpath(os.path.join(root, ".."))
print(json.dumps({
    "path": root,
    "title": meta["title"],
    "description": meta["description"],
    "parent_path": parent_path if include_parent and parent_path != root else "",
    "entries": entries[:max_entries],
    "truncated": truncated or len(entries) > max_entries,
}))
PY
    exit 0
    ;;
  *)
    fail_usage
    ;;
esac
EOF_HELPER
  run_root install -d -m 0755 "$(dirname "$helper_path")"
  run_root install -o root -g root -m 0755 "$tmp" "$helper_path"
  rm -f "$tmp"
}

write_sudoers() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/overworld-sudoers.XXXXXX")
  {
    printf 'Defaults:%s !requiretty\n' "$site_user"
    printf '%s ALL=(root) NOPASSWD: %s *\n' "$site_user" "$helper_path"
  } > "$tmp"
  run_root visudo -cf "$tmp" >/dev/null
  run_root install -o root -g root -m 0440 "$tmp" "$(sudoers_file)"
  rm -f "$tmp"
}

ensure_player_group() {
  group=$(player_group)
  if ! run_root getent group "$group" >/dev/null 2>&1; then
    run_root groupadd --system "$group"
  fi
  tmp=$(mktemp "${TMPDIR:-/tmp}/overworld-helper-config.XXXXXX")
  if run_root test -f "$helper_config"; then
    run_root awk -v site_user="$site_user" '$1 != site_user { print }' "$helper_config" > "$tmp"
  fi
  printf '%s %s\n' "$site_user" "$group" >> "$tmp"
  run_root install -o root -g root -m 0644 "$tmp" "$helper_config"
  rm -f "$tmp"
}

apply_overworld_acl() {
  group=$(player_group)
  command -v setfacl >/dev/null 2>&1 || {
    status_bad "setfacl is required for Overworld directory permissions."
    exit 1
  }

  site_home=/home/$site_user
  site_data=$site_home/.sitedata
  site_state=$site_data/site
  overworld_state=$site_state/overworld
  active_site=$site_home/site

  for path in "$site_home" "$site_data" "$site_state"; do
    if run_root test -d "$path"; then
      run_root setfacl -m "g:$group:--x" "$path"
    fi
  done

  if run_root test -d "$overworld_state"; then
    run_root find "$overworld_state" -type d -exec setfacl -m "g:$group:rx" {} +
  fi
  if run_root test -d "$active_site"; then
    active_real=$(run_root readlink -f "$active_site")
    run_root setfacl -m "g:$group:--x" "$site_home/releases" 2>/dev/null || true
    run_root find "$active_real" -type d -exec setfacl -m "g:$group:rx" {} +
  fi
}

check_status() {
  require_site_context
  run_root test -x "$helper_path" || {
    status_bad "The Overworld account helper is not installed."
    return 0
  }
  run_root getent group "$(player_group)" >/dev/null 2>&1 || {
    status_bad "The Overworld player group is missing."
    return 0
  }
  run_root "$helper_path" check >/dev/null 2>&1 || {
    status_bad "The Overworld account helper cannot find required system tools."
    return 0
  }
  run_root test -f "$(sudoers_file)" || {
    status_bad "The Overworld sudoers rule is missing."
    return 0
  }
  run_root sudo -n -u "$site_user" sudo -n "$helper_path" check >/dev/null 2>&1 || {
    status_bad "The site user cannot run the Overworld account helper."
    return 0
  }
  status_ok "Overworld server accounts can be created and checked through the constrained helper."
}

case "${1-}" in
  --check)
    check_status
    exit 0
    ;;
esac

require_site_context
write_helper
ensure_player_group
write_sudoers
apply_overworld_acl
check_status
