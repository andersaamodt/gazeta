#!/bin/sh
# Shared helpers for the server-backed Overworld game.

set -eu

blog_overworld_dir() {
  printf '%s/overworld\n' "$blog_state_dir"
}

blog_overworld_sandbox_dir() {
  printf '%s/sandbox\n' "$(blog_overworld_dir)"
}

blog_overworld_guests_dir() {
  printf '%s/guests\n' "$(blog_overworld_dir)"
}

blog_overworld_config_bool() {
  key=$1
  default_value=$2
  raw=$(config-get "$blog_site_conf" "$key" 2>/dev/null || printf '')
  case "$raw" in
    true|1|yes|on) printf 'true\n' ;;
    false|0|no|off) printf 'false\n' ;;
    '') printf '%s\n' "$default_value" ;;
    *) printf '%s\n' "$default_value" ;;
  esac
}

blog_overworld_anonymous_enabled() {
  blog_overworld_config_bool overworld_anonymous_enabled true
}

blog_overworld_show_hidden() {
  blog_overworld_config_bool overworld_show_hidden false
}

blog_overworld_access_mode() {
  raw=$(config-get "$blog_site_conf" overworld_access_mode 2>/dev/null || printf '')
  case "$raw" in
    web) printf 'web\n' ;;
    *) printf 'player\n' ;;
  esac
}

blog_overworld_anonymous_time_limit_seconds() {
  raw=$(config-get "$blog_site_conf" overworld_anonymous_time_limit_seconds 2>/dev/null || printf '')
  case "$raw" in
    ''|*[!0-9]*) raw=900 ;;
  esac
  if [ "$raw" -lt 60 ]; then
    raw=60
  fi
  if [ "$raw" -gt 86400 ]; then
    raw=86400
  fi
  printf '%s\n' "$raw"
}

blog_overworld_canonical_path() {
  raw_path=${1-}
  [ -n "$raw_path" ] || return 1
  clean_path=$(printf '%s' "$raw_path" | tr -d '\r\n')
  [ "$clean_path" = "$raw_path" ] || return 1
  case "$raw_path" in
    /*) ;;
    *) return 1 ;;
  esac
  python3 - "$raw_path" <<'PY'
import os
import sys

print(os.path.realpath(sys.argv[1]))
PY
}

blog_overworld_setup() {
  game_dir=$(blog_overworld_dir)
  sandbox_dir=$(blog_overworld_sandbox_dir)
  guests_dir=$(blog_overworld_guests_dir)
  mkdir -p "$game_dir" "$sandbox_dir" "$guests_dir"
  chmod 755 "$game_dir" "$sandbox_dir" "$guests_dir" 2>/dev/null || true

  if [ ! -f "$sandbox_dir/.room" ]; then
    {
      printf 'title=Server Gate\n'
      printf 'description=The first room is safe. Log in with Nostr to walk through doors into the server.\n'
    } > "$sandbox_dir/.room"
    chmod 644 "$sandbox_dir/.room" 2>/dev/null || true
  fi

  if [ ! -e "$sandbox_dir/website" ]; then
    ln -s "$blog_site_root" "$sandbox_dir/website" 2>/dev/null || true
  fi
}

blog_overworld_start_path() {
  configured=$(config-get "$blog_site_conf" overworld_start_path 2>/dev/null || printf '')
  if [ -n "$configured" ]; then
    canonical=$(blog_overworld_canonical_path "$configured" 2>/dev/null || printf '')
    if [ -n "$canonical" ] && [ -d "$canonical" ]; then
      printf '%s\n' "$canonical"
      return 0
    fi
  fi
  blog_overworld_canonical_path "$(blog_overworld_sandbox_dir)"
}

blog_overworld_user_profile() {
  username=$1
  blog_user_profile "$username"
}

blog_overworld_account_username_for_user() {
  username=$1
  digest=$(printf '%s:%s' "$blog_site_name" "$username" | blog_sha256 | cut -c1-12)
  printf 'ow%s\n' "$digest"
}

blog_overworld_helper_path() {
  configured=$(config-get "$blog_site_conf" overworld_helper_path 2>/dev/null || printf '')
  case "$configured" in
    /*) printf '%s\n' "$configured" ;;
    *) printf '%s\n' '/usr/local/libexec/overworld-site-helper' ;;
  esac
}

blog_overworld_run_helper() {
  helper=$(blog_overworld_helper_path)
  [ -x "$helper" ] || return 127
  if [ "$(id -u)" = "0" ]; then
    "$helper" "$@"
    return $?
  fi
  command -v sudo >/dev/null 2>&1 || return 127
  sudo -n "$helper" "$@"
}

blog_overworld_get_profile_value() {
  username=$1
  key=$2
  profile=$(blog_overworld_user_profile "$username")
  config-get "$profile" "$key" 2>/dev/null || printf ''
}

blog_overworld_set_profile_value() {
  username=$1
  key=$2
  value=$3
  dir=$(blog_user_dir "$username")
  profile=$(blog_overworld_user_profile "$username")
  mkdir -p "$dir/delegates"
  config-set "$profile" username "$username"
  config-set "$profile" "$key" "$value"
  config-set "$profile" updated_at "$(blog_now_iso)"
}

blog_overworld_validate_account_name() {
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

blog_overworld_normalize_public_key() {
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
    *)
      return 1
      ;;
  esac

  case "$key_body" in
    *[!A-Za-z0-9+/=]*)
      return 1
      ;;
  esac

  printf '%s\n' "$normalized"
}

blog_overworld_account_home() {
  account=${1-}
  blog_overworld_validate_account_name "$account" || return 1
  home=
  if command -v getent >/dev/null 2>&1; then
    home=$(getent passwd "$account" 2>/dev/null | awk -F: 'NR==1 {print $6}')
  elif command -v dscl >/dev/null 2>&1; then
    home=$(dscl . -read "/Users/$account" NFSHomeDirectory 2>/dev/null | awk 'NR==1 {print $2}')
  fi
  case "$home" in
    /*) ;;
    *) return 1 ;;
  esac
  [ -d "$home" ] || return 1
  blog_overworld_canonical_path "$home"
}

blog_overworld_account_group() {
  account=${1-}
  blog_overworld_validate_account_name "$account" || return 1
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

blog_overworld_sync_authorized_key() {
  username=${1-}
  account=${2-}
  blog_overworld_validate_account_name "$account" || return 1
  blog_overworld_account_exists "$account" || return 1

  ssh_public_key=$(blog_overworld_get_profile_value "$username" ssh_public_key)
  ssh_public_key=$(blog_overworld_normalize_public_key "$ssh_public_key" 2>/dev/null || printf '')
  if [ -z "$ssh_public_key" ]; then
    blog_overworld_set_profile_value "$username" overworld_ssh_key_status no_key
    return 0
  fi

  account_home=$(blog_overworld_account_home "$account" 2>/dev/null || printf '')
  [ -n "$account_home" ] || return 1
  account_group=$(blog_overworld_account_group "$account")
  tmp_key=$(mktemp "${TMPDIR:-/tmp}/overworld-authorized-key.XXXXXX")
  printf '%s\n' "$ssh_public_key" > "$tmp_key"

  if blog_overworld_run_helper sync-key "$account" "$tmp_key" >/dev/null 2>&1; then
    rm -f "$tmp_key"
    blog_overworld_set_profile_value "$username" overworld_ssh_key_status installed
    return 0
  fi

  if [ "$(id -u)" = "0" ]; then
    install -d -m 700 -o "$account" -g "$account_group" "$account_home/.ssh"
    install -m 600 -o "$account" -g "$account_group" "$tmp_key" "$account_home/.ssh/authorized_keys"
    rm -f "$tmp_key"
    blog_overworld_set_profile_value "$username" overworld_ssh_key_status installed
    return 0
  fi

  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    sudo -n install -d -m 700 -o "$account" -g "$account_group" "$account_home/.ssh"
    sudo -n install -m 600 -o "$account" -g "$account_group" "$tmp_key" "$account_home/.ssh/authorized_keys"
    rm -f "$tmp_key"
    blog_overworld_set_profile_value "$username" overworld_ssh_key_status installed
    return 0
  fi

  rm -f "$tmp_key"
  blog_overworld_set_profile_value "$username" overworld_ssh_key_status needs_server_setup
  return 1
}

blog_overworld_account_exists() {
  account=${1-}
  blog_overworld_validate_account_name "$account" || return 1
  id "$account" >/dev/null 2>&1
}

blog_overworld_try_create_account() {
  account=$1
  username=$2
  blog_overworld_validate_account_name "$account" || return 1
  if blog_overworld_account_exists "$account"; then
    return 0
  fi
  if blog_overworld_run_helper ensure-account "$account" "$username" >/dev/null 2>&1; then
    return 0
  fi
  if command -v useradd >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
    useradd -m -s /bin/sh -c "Overworld player $username" "$account" >/dev/null 2>&1 || return 1
    return 0
  fi
  if command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    if command -v useradd >/dev/null 2>&1; then
      sudo -n useradd -m -s /bin/sh -c "Overworld player $username" "$account" >/dev/null 2>&1 || return 1
      return 0
    fi
  fi
  return 1
}

blog_overworld_ensure_user_account() {
  username=$1
  pubkey=$(blog_get_nostr_pubkey "$username" 2>/dev/null || printf '')
  if [ -z "$pubkey" ]; then
    blog_overworld_set_profile_value "$username" overworld_ssh_account_status nostr_required
    return 1
  fi

  account=$(blog_overworld_get_profile_value "$username" overworld_ssh_username)
  if [ -z "$account" ] || ! blog_overworld_validate_account_name "$account"; then
    account=$(blog_overworld_account_username_for_user "$username")
    blog_overworld_set_profile_value "$username" overworld_ssh_username "$account"
  fi

  if blog_overworld_account_exists "$account"; then
    blog_overworld_run_helper ensure-account "$account" "$username" >/dev/null 2>&1 || true
    blog_overworld_sync_authorized_key "$username" "$account" >/dev/null 2>&1 || true
    blog_overworld_set_profile_value "$username" overworld_ssh_account_status active
    printf '%s\n' "$account"
    return 0
  fi

  if blog_overworld_try_create_account "$account" "$username"; then
    blog_overworld_sync_authorized_key "$username" "$account" >/dev/null 2>&1 || true
    blog_overworld_set_profile_value "$username" overworld_ssh_account_status active
    printf '%s\n' "$account"
    return 0
  fi

  blog_overworld_set_profile_value "$username" overworld_ssh_account_status needs_server_setup
  printf '%s\n' "$account"
  return 1
}

blog_overworld_can_run_as_account() {
  account=${1-}
  blog_overworld_validate_account_name "$account" || return 1
  blog_overworld_account_exists "$account" || return 1
  if blog_overworld_run_helper can-run "$account" >/dev/null 2>&1; then
    return 0
  fi
  command -v sudo >/dev/null 2>&1 || return 1
  sudo -n -u "$account" true >/dev/null 2>&1
}

blog_overworld_path_is_start() {
  target_path=$1
  start_path=$2
  [ "$target_path" = "$start_path" ]
}

blog_overworld_can_enter_path() {
  target_path=$1
  start_path=$2
  account=${3-}
  mode=$(blog_overworld_access_mode)

  [ -d "$target_path" ] || return 1

  case "$mode" in
    web)
      [ -r "$target_path" ] && [ -x "$target_path" ]
      return $?
      ;;
  esac

  if [ -n "$account" ] && blog_overworld_can_run_as_account "$account"; then
    if blog_overworld_run_helper can-enter "$account" "$target_path" >/dev/null 2>&1; then
      return 0
    fi
    sudo -n -u "$account" test -d "$target_path" >/dev/null 2>&1 || return 1
    sudo -n -u "$account" test -r "$target_path" >/dev/null 2>&1 || return 1
    sudo -n -u "$account" test -x "$target_path" >/dev/null 2>&1 || return 1
    return 0
  fi

  blog_overworld_path_is_start "$target_path" "$start_path" || return 1
  [ -r "$target_path" ] && [ -x "$target_path" ]
}

blog_overworld_effective_access_mode() {
  account=${1-}
  configured=$(blog_overworld_access_mode)
  if [ "$configured" = "web" ]; then
    printf 'web_process\n'
    return 0
  fi
  if [ -n "$account" ] && blog_overworld_can_run_as_account "$account"; then
    printf 'player_account\n'
    return 0
  fi
  printf 'start_room_only\n'
}

blog_overworld_new_guest_id() {
  printf 'owg-%s\n' "$(blog_random_token 12)"
}

blog_overworld_validate_guest_id() {
  guest_id=${1-}
  case "$guest_id" in
    owg-[abcdefghijklmnopqrstuvwxyz0123456789]*)
      case "$guest_id" in
        *[!abcdefghijklmnopqrstuvwxyz0123456789-]*) return 1 ;;
      esac
      ;;
    *) return 1 ;;
  esac
  count=$(printf '%s' "$guest_id" | wc -c | tr -d ' ')
  [ "$count" -le 80 ]
}

blog_overworld_guest_file() {
  guest_id=$1
  blog_overworld_validate_guest_id "$guest_id" || return 1
  printf '%s/%s.conf\n' "$(blog_overworld_guests_dir)" "$guest_id"
}

blog_overworld_guest_expires_at() {
  guest_id=$1
  limit_seconds=$(blog_overworld_anonymous_time_limit_seconds)
  file=$(blog_overworld_guest_file "$guest_id") || return 1
  created_at=$(config-get "$file" created_at 2>/dev/null || printf '')
  case "$created_at" in
    ''|*[!0-9]*) created_at=$(blog_now_epoch); config-set "$file" created_at "$created_at" ;;
  esac
  printf '%s\n' $((created_at + limit_seconds))
}

blog_overworld_guest_expired() {
  guest_id=$1
  expires_at=$(blog_overworld_guest_expires_at "$guest_id" 2>/dev/null || printf '0')
  now=$(blog_now_epoch)
  [ "$now" -gt "$expires_at" ]
}

blog_overworld_get_or_create_guest_id() {
  raw_guest_id=${1-}
  if blog_overworld_validate_guest_id "$raw_guest_id" 2>/dev/null; then
    guest_id=$raw_guest_id
  else
    guest_id=$(blog_overworld_new_guest_id)
  fi
  file=$(blog_overworld_guest_file "$guest_id")
  if [ ! -f "$file" ]; then
    config-set "$file" guest_id "$guest_id"
    config-set "$file" created_at "$(blog_now_epoch)"
  fi
  printf '%s\n' "$guest_id"
}

blog_overworld_room_json() {
  room_path=$1
  account=${2-}
  start_path=${3:-$room_path}
  show_hidden=$(blog_overworld_show_hidden)
  max_entries=$(config-get "$blog_site_conf" overworld_max_entries 2>/dev/null || printf '')
  case "$max_entries" in
    ''|*[!0-9]*) max_entries=96 ;;
  esac
  if [ "$max_entries" -lt 8 ]; then
    max_entries=8
  fi
  if [ "$max_entries" -gt 300 ]; then
    max_entries=300
  fi

  include_parent=false
  parent_path=$(blog_overworld_canonical_path "$room_path/.." 2>/dev/null || printf '')
  if [ -n "$parent_path" ] && [ "$parent_path" != "$room_path" ]; then
    if blog_overworld_can_enter_path "$parent_path" "$start_path" "$account"; then
      include_parent=true
    fi
  fi

  if [ -n "$account" ] && [ "$(blog_overworld_effective_access_mode "$account")" = "player_account" ]; then
    if blog_overworld_run_helper room-json "$account" "$show_hidden" "$max_entries" "$include_parent" "$room_path"; then
      return 0
    fi
    if sudo -n -u "$account" env OVERWORLD_SHOW_HIDDEN="$show_hidden" OVERWORLD_MAX_ENTRIES="$max_entries" OVERWORLD_INCLUDE_PARENT="$include_parent" python3 - "$room_path" <<'PY' 2>/dev/null
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
    then
      return 0
    fi
    printf '{"path":"%s","title":"%s","description":"","parent_path":"","entries":[],"error":"player_account_unavailable"}\n' \
      "$(blog_json_escape "$room_path")" "$(blog_json_escape "${room_path##*/}")"
    return 0
  fi

  env OVERWORLD_SHOW_HIDDEN="$show_hidden" OVERWORLD_MAX_ENTRIES="$max_entries" OVERWORLD_INCLUDE_PARENT="$include_parent" python3 - "$room_path" <<'PY'
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
}

blog_overworld_public_room_json() {
  room_json=$1
  public_path=${2:-/overworld/start}
  printf '%s\n' "$room_json" | jq -c --arg public_path "$public_path" '
    .path = $public_path
    | .parent_path = ""
    | .entries = ((.entries // []) | map(
        {
          name: ((.name // "") | tostring),
          kind: ((.kind // "file") | tostring)
        }
        + (if ((.kind // "") | tostring) == "door" then
            {
              path: ("overworld-locked://" + (((.name // "door") | tostring) | @uri)),
              locked: true
            }
          else
            {
              size: ((.size // 0) | tonumber? // 0)
            }
          end)
      ))
  '
}
