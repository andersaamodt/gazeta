#!/bin/sh
# Shared helpers for the private Desk API.

set -eu

blog_desk_root() {
  configured=$(config-get "$blog_site_conf" desk_root_path 2>/dev/null || printf '')
  case "$configured" in
    /*)
      printf '%s\n' "$configured"
      ;;
    *)
      printf '%s/desk/office\n' "$blog_site_data"
      ;;
  esac
}

blog_desk_state_dir() {
  printf '%s/desk/.state\n' "$blog_site_data"
}

blog_desk_normalized_owner_pubkeys() {
  raw=$(config-get "$blog_site_conf" desk_owner_pubkeys 2>/dev/null || printf '')
  if [ -z "$raw" ]; then
    raw=$(config-get "$blog_site_conf" desk_owner_pubkey 2>/dev/null || printf '')
  fi
  printf '%s\n' "$raw" \
    | tr ',;\t\r ' '\n\n\n\n\n' \
    | awk 'NF { print tolower($0) }'
}

blog_desk_pubkey_in_lines() {
  pubkey=$1
  lines=$2
  [ -n "$pubkey" ] || return 1
  printf '%s\n' "$lines" | grep -Fqx "$pubkey"
}

blog_desk_session_is_owner() {
  session_pubkey=$(blog_validate_nostr_pubkey "${BLOG_SESSION_USER_PUBKEY-}" 2>/dev/null || printf '')
  [ -n "$session_pubkey" ] || return 1

  configured_owners=$(blog_desk_normalized_owner_pubkeys)
  if [ -n "$configured_owners" ]; then
    blog_desk_pubkey_in_lines "$session_pubkey" "$configured_owners"
    return $?
  fi

  author_lines=$(blog_nostr_list_file_lines "$blog_nostr_authors_file" 2>/dev/null | awk 'NF { print tolower($0) }' || printf '')
  author_count=$(printf '%s\n' "$author_lines" | awk 'NF { count += 1 } END { print count + 0 }')
  if [ "${author_count:-0}" -gt 0 ]; then
    blog_desk_pubkey_in_lines "$session_pubkey" "$author_lines"
    return $?
  fi

  # Secure bootstrap fallback for local/private sites that have not configured
  # an author allowlist yet. Once Desk owner pubkeys or Nostr authors exist,
  # they become the authority.
  [ "${BLOG_SESSION_IS_ADMIN-}" = "true" ]
}

blog_desk_require_owner() {
  if ! blog_require_session false false; then
    return 1
  fi
  if ! blog_desk_session_is_owner; then
    blog_json_error "Desk is private to the site owner's Nostr identity." "owner_required"
    return 1
  fi
  return 0
}
