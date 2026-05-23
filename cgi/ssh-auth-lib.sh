#!/bin/sh
# Shared helpers for SSH + WebAuthn auth endpoints.

set -eu

if [ -z "${SCRIPT_DIR+x}" ]; then
  SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)
fi
. "$SCRIPT_DIR/blog-lib.sh"

ssh_auth_registration_enabled() {
  enabled=$(config-get "$blog_site_conf" registration_enabled 2>/dev/null || printf 'true')
  [ "$enabled" != "false" ]
}

ssh_auth_compute_fingerprint() {
  ssh_key=${1-}
  printf '%s' "$ssh_key" | blog_sha256
}

ssh_auth_normalize_public_key() {
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

ssh_auth_user_home() {
  username=${1-}
  if [ -z "$username" ]; then
    return 1
  fi
  blog_validate_username "$username" || return 1
  case "$username" in
    .|..|-*)
      return 1
      ;;
  esac

  # Try shell expansion first.
  if eval "home=~$username" 2>/dev/null; then
    if [ -d "$home" ]; then
      printf '%s\n' "$home"
      return 0
    fi
  fi

  # Linux passwd database fallback.
  if command -v getent >/dev/null 2>&1; then
    home=$(getent passwd "$username" 2>/dev/null | awk -F: 'NR==1 {print $6}')
    if [ -n "$home" ] && [ -d "$home" ]; then
      printf '%s\n' "$home"
      return 0
    fi
  fi

  # macOS fallback.
  if command -v dscl >/dev/null 2>&1; then
    home=$(dscl . -read "/Users/$username" NFSHomeDirectory 2>/dev/null | awk '{print $2}')
    if [ -n "$home" ] && [ -d "$home" ]; then
      printf '%s\n' "$home"
      return 0
    fi
  fi

  return 1
}

ssh_auth_read_authorized_key() {
  username=${1-}
  home=$(ssh_auth_user_home "$username" 2>/dev/null || printf '')
  if [ -z "$home" ]; then
    return 1
  fi

  auth_keys="$home/.ssh/authorized_keys"
  if [ ! -f "$auth_keys" ]; then
    return 1
  fi

  awk 'NF && $1 !~ /^#/ {print $1" "$2; exit}' "$auth_keys"
}

ssh_auth_profile_path() {
  username=$1
  blog_user_profile "$username"
}

ssh_auth_set_registration_challenge() {
  username=$1
  profile=$(ssh_auth_profile_path "$username")
  challenge_b64=$(openssl rand -base64 32 | tr -d '\n')
  config-set "$profile" registration_challenge "$challenge_b64"
  config-set "$profile" registration_challenge_created "$(blog_now_epoch)"
  printf '%s\n' "$challenge_b64"
}

ssh_auth_set_login_challenge() {
  username=$1
  profile=$(ssh_auth_profile_path "$username")
  challenge_b64=$(openssl rand -base64 32 | tr -d '\n')
  config-set "$profile" login_challenge "$challenge_b64"
  config-set "$profile" login_challenge_created "$(blog_now_epoch)"
  printf '%s\n' "$challenge_b64"
}

ssh_auth_clear_login_challenge() {
  username=$1
  profile=$(ssh_auth_profile_path "$username")
  config-set "$profile" login_challenge ""
  config-set "$profile" login_challenge_created "0"
}

ssh_auth_login_request_dir() {
  printf '%s/login-requests\n' "$blog_auth_dir"
}

ssh_auth_create_login_request() {
  # args: [username]
  username=${1-}
  req_dir=$(ssh_auth_login_request_dir)
  mkdir -p "$req_dir"
  request_id=$(blog_random_token 12)
  request_file="$req_dir/$request_id.conf"
  challenge_b64=$(openssl rand -base64 32 | tr -d '\n')
  config-set "$request_file" challenge "$challenge_b64"
  config-set "$request_file" created_at "$(blog_now_epoch)"
  config-set "$request_file" username "$username"
  printf '%s;%s\n' "$request_id" "$challenge_b64"
}

ssh_auth_validate_login_request_id() {
  blog_validate_hex_token "${1-}" 24
}

ssh_auth_get_login_request_challenge() {
  request_id=${1-}
  ssh_auth_validate_login_request_id "$request_id" || return 1
  request_file="$(ssh_auth_login_request_dir)/$request_id.conf"
  [ -f "$request_file" ] || return 1
  config-get "$request_file" challenge 2>/dev/null || return 1
}

ssh_auth_clear_login_request() {
  request_id=${1-}
  ssh_auth_validate_login_request_id "$request_id" || return 0
  request_file="$(ssh_auth_login_request_dir)/$request_id.conf"
  rm -f "$request_file"
}

ssh_auth_extract_json_field() {
  json=$1
  key=$2
  printf '%s' "$json" | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p"
}

ssh_auth_expected_client_challenge() {
  challenge_b64=$1
  blog_to_base64url "$challenge_b64"
}

ssh_auth_verify_client_data() {
  # args: client_data_json_b64 expected_challenge_b64 type_expected
  client_b64=$1
  expected_b64=$2
  expected_type=$3

  tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/ssh-auth-cd.XXXXXX")
  trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

  client_file="$tmp_dir/client.json"
  if ! blog_b64_to_file "$client_b64" "$client_file"; then
    trap - EXIT HUP INT TERM
    rm -rf "$tmp_dir"
    return 1
  fi

  json=$(cat "$client_file" 2>/dev/null || printf '')
  got_type=$(ssh_auth_extract_json_field "$json" type)
  got_challenge=$(ssh_auth_extract_json_field "$json" challenge)
  got_origin=$(ssh_auth_extract_json_field "$json" origin)

  if [ "$got_type" != "$expected_type" ]; then
    trap - EXIT HUP INT TERM
    rm -rf "$tmp_dir"
    return 1
  fi

  expected_challenge=$(ssh_auth_expected_client_challenge "$expected_b64")
  if [ "$got_challenge" != "$expected_challenge" ]; then
    trap - EXIT HUP INT TERM
    rm -rf "$tmp_dir"
    return 1
  fi

  host=${HTTP_HOST:-${SERVER_NAME:-}}
  if [ -n "$host" ] && [ -n "$got_origin" ]; then
    case "$got_origin" in
      "https://$host"|"http://$host") ;;
      *)
        trap - EXIT HUP INT TERM
        rm -rf "$tmp_dir"
        return 1
        ;;
    esac
  fi

  trap - EXIT HUP INT TERM
  rm -rf "$tmp_dir"
  return 0
}

ssh_auth_delegate_dir() {
  username=$1
  printf '%s/delegates\n' "$(blog_user_dir "$username")"
}

ssh_auth_validate_delegate_id() {
  blog_validate_hex_token "${1-}" 20
}

ssh_auth_find_delegate_by_credential() {
  username=$1
  credential_id=$2
  delegates=$(ssh_auth_delegate_dir "$username")
  [ -d "$delegates" ] || return 1

  for file in "$delegates"/*.conf; do
    [ -f "$file" ] || continue
    existing=$(config-get "$file" credential_id 2>/dev/null || printf '')
    if [ "$existing" = "$credential_id" ]; then
      printf '%s\n' "$file"
      return 0
    fi
  done

  return 1
}

ssh_auth_find_delegate_any_user() {
  credential_id=${1-}
  [ -n "$credential_id" ] || return 1
  [ -d "$blog_users_dir" ] || return 1

  for user_dir in "$blog_users_dir"/*; do
    [ -d "$user_dir" ] || continue
    username=$(basename "$user_dir")
    delegate_file=$(ssh_auth_find_delegate_by_credential "$username" "$credential_id" 2>/dev/null || printf '')
    if [ -n "$delegate_file" ] && [ -f "$delegate_file" ]; then
      printf '%s;%s\n' "$username" "$delegate_file"
      return 0
    fi
  done

  return 1
}

ssh_auth_verify_assertion_signature() {
  # args: delegate_conf auth_data_b64 client_data_b64 signature_b64
  delegate_file=$1
  auth_data_b64=$2
  client_data_b64=$3
  signature_b64=$4

  tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/ssh-auth-verify.XXXXXX")
  trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

  auth_file="$tmp_dir/auth.bin"
  client_file="$tmp_dir/client.bin"
  sig_file="$tmp_dir/sig.bin"
  pub_der="$tmp_dir/pub.der"
  pub_pem="$tmp_dir/pub.pem"
  hash_file="$tmp_dir/client.hash"
  signed_file="$tmp_dir/signed.bin"

  public_key_b64=$(config-get "$delegate_file" public_key_b64 2>/dev/null || printf '')
  if [ -z "$public_key_b64" ]; then
    trap - EXIT HUP INT TERM
    rm -rf "$tmp_dir"
    return 1
  fi

  blog_b64_to_file "$auth_data_b64" "$auth_file" || { trap - EXIT HUP INT TERM; rm -rf "$tmp_dir"; return 1; }
  blog_b64_to_file "$client_data_b64" "$client_file" || { trap - EXIT HUP INT TERM; rm -rf "$tmp_dir"; return 1; }
  blog_b64_to_file "$signature_b64" "$sig_file" || { trap - EXIT HUP INT TERM; rm -rf "$tmp_dir"; return 1; }
  blog_b64_to_file "$public_key_b64" "$pub_der" || { trap - EXIT HUP INT TERM; rm -rf "$tmp_dir"; return 1; }

  if ! openssl pkey -pubin -inform DER -in "$pub_der" -out "$pub_pem" >/dev/null 2>&1; then
    trap - EXIT HUP INT TERM
    rm -rf "$tmp_dir"
    return 1
  fi

  if ! openssl dgst -sha256 -binary "$client_file" > "$hash_file" 2>/dev/null; then
    trap - EXIT HUP INT TERM
    rm -rf "$tmp_dir"
    return 1
  fi

  cat "$auth_file" "$hash_file" > "$signed_file"

  if ! openssl dgst -sha256 -verify "$pub_pem" -signature "$sig_file" "$signed_file" >/dev/null 2>&1; then
    trap - EXIT HUP INT TERM
    rm -rf "$tmp_dir"
    return 1
  fi

  # Verify RP ID hash in authenticatorData.
  rp_id=${SERVER_NAME:-${HTTP_HOST:-}}
  if [ -n "$rp_id" ]; then
    rp_hash_actual=$(od -An -tx1 -N32 "$auth_file" | tr -d ' \n')
    rp_hash_expected=$(printf '%s' "$rp_id" | openssl dgst -sha256 -binary | od -An -tx1 | tr -d ' \n')
    if [ -n "$rp_hash_actual" ] && [ -n "$rp_hash_expected" ] && [ "$rp_hash_actual" != "$rp_hash_expected" ]; then
      trap - EXIT HUP INT TERM
      rm -rf "$tmp_dir"
      return 1
    fi
  fi

  # Update sign counter when available.
  sign_hex=$(od -An -tx1 -j33 -N4 "$auth_file" | tr -d ' \n')
  if [ -n "$sign_hex" ]; then
    sign_count=$((16#$sign_hex))
  else
    sign_count=0
  fi

  prev=$(config-get "$delegate_file" sign_count 2>/dev/null || printf '0')
  case "$prev" in ''|*[!0-9]*) prev=0 ;; esac

  # Allow zero-only authenticators, otherwise require monotonic increase.
  if [ "$sign_count" -gt 0 ] && [ "$prev" -gt 0 ] && [ "$sign_count" -le "$prev" ]; then
    trap - EXIT HUP INT TERM
    rm -rf "$tmp_dir"
    return 1
  fi

  if [ "$sign_count" -gt "$prev" ]; then
    config-set "$delegate_file" sign_count "$sign_count"
  fi
  config-set "$delegate_file" last_used_at "$(blog_now_iso)"

  trap - EXIT HUP INT TERM
  rm -rf "$tmp_dir"
  return 0
}
