#!/bin/sh
# Shared helpers for blog CGI scripts.

set -eu

blog_site_name=${WIZARDRY_SITE_NAME:-default}
blog_sites_dir=${WIZARDRY_SITES_DIR:-$HOME/sites}
blog_site_root="$blog_sites_dir/$blog_site_name"
blog_site_data="$blog_sites_dir/.sitedata/$blog_site_name"
blog_site_conf="$blog_site_root/site.conf"
blog_posts_dir="$blog_site_root/site/pages/posts"
blog_posts_store_dir="$blog_site_data/blog/posts"
blog_auth_dir="$blog_site_data/ssh-auth"
blog_users_dir="$blog_auth_dir/users"
blog_sessions_dir="$blog_auth_dir/sessions"
blog_nostr_login_requests_dir="$blog_auth_dir/nostr-login-requests"
blog_nostr_delegations_dir="$blog_auth_dir/nostr-delegations"
blog_nostr_rate_limits_dir="$blog_auth_dir/rate-limits"
blog_nostr_delegation_revocations_file="$blog_auth_dir/nostr-delegation-revocations.txt"
blog_state_dir="$blog_site_data/blog"
blog_drafts_dir="$blog_state_dir/drafts"
blog_lists_dir="$blog_state_dir/lists"
blog_uploads_dir="$blog_site_data/uploads"
blog_nostr_dir="$blog_site_root/site/nostr"
blog_nostr_state_dir="$blog_nostr_dir/state"
blog_nostr_events_dir="$blog_nostr_dir/events"
blog_nostr_derived_dir="$blog_nostr_dir/derived"
blog_nostr_authors_file="$blog_nostr_state_dir/authors"
blog_nostr_relays_file="$blog_nostr_state_dir/relays"
blog_nostr_blocklist_file="$blog_nostr_state_dir/blocklist"
blog_nostr_authors_file_legacy="$blog_nostr_state_dir/authors.txt"
blog_nostr_relays_file_legacy="$blog_nostr_state_dir/relays.txt"
blog_nostr_blocklist_file_legacy="$blog_nostr_state_dir/blocklist.txt"
blog_nostr_hidden_posts_file="$blog_nostr_state_dir/hidden_posts.txt"
blog_nostr_secret_key_file="$blog_nostr_state_dir/secret.key"
blog_nostr_posts_index="$blog_nostr_derived_dir/posts.json"
blog_nostr_comments_index="$blog_nostr_derived_dir/comments.json"
blog_nostr_rebuild_lock_dir="$blog_nostr_state_dir/rebuild.lock"
blog_nostr_mirror_lock_dir="$blog_nostr_state_dir/mirror.lock"

BLOG_REQUEST_BODY=${BLOG_REQUEST_BODY-}
BLOG_SESSION_USERNAME=${BLOG_SESSION_USERNAME-}
BLOG_SESSION_FINGERPRINT=${BLOG_SESSION_FINGERPRINT-}
BLOG_SESSION_IS_ADMIN=${BLOG_SESSION_IS_ADMIN-}
BLOG_SESSION_TOKEN=${BLOG_SESSION_TOKEN-}
BLOG_SESSION_CSRF=${BLOG_SESSION_CSRF-}
BLOG_SESSION_USER_PUBKEY=${BLOG_SESSION_USER_PUBKEY-}
BLOG_SESSION_SIGNER_PUBKEY=${BLOG_SESSION_SIGNER_PUBKEY-}
BLOG_SESSION_DELEGATION_ID=${BLOG_SESSION_DELEGATION_ID-}
BLOG_SESSION_AUTH_METHOD=${BLOG_SESSION_AUTH_METHOD-}
BLOG_SESSION_FORCE_INTERACTIVE=${BLOG_SESSION_FORCE_INTERACTIVE-}

blog_ensure_posts_mount() {
  pages_dir=$(dirname "$blog_posts_dir")
  mkdir -p "$pages_dir" "$blog_posts_store_dir"

  if [ -L "$blog_posts_dir" ]; then
    target=$(readlink "$blog_posts_dir" 2>/dev/null || printf '')
    if [ "$target" = "$blog_posts_store_dir" ]; then
      return 0
    fi
    rm -f "$blog_posts_dir"
  fi

  if [ -e "$blog_posts_dir" ] && [ ! -L "$blog_posts_dir" ]; then
    rm -rf "$blog_posts_dir"
  fi

  if [ ! -e "$blog_posts_dir" ]; then
    ln -s "$blog_posts_store_dir" "$blog_posts_dir"
  fi
}

blog_init() {
  mkdir -p "$blog_auth_dir" "$blog_users_dir" "$blog_sessions_dir" "$blog_nostr_login_requests_dir" "$blog_nostr_delegations_dir" "$blog_nostr_rate_limits_dir" "$blog_state_dir" "$blog_drafts_dir" "$blog_lists_dir" "$blog_uploads_dir" "$blog_posts_store_dir"
  blog_ensure_posts_mount
  mkdir -p "$blog_nostr_state_dir" "$blog_nostr_events_dir" "$blog_nostr_derived_dir"
  [ -f "$blog_nostr_delegation_revocations_file" ] || : > "$blog_nostr_delegation_revocations_file"
  if [ ! -f "$blog_nostr_authors_file" ] && [ -f "$blog_nostr_authors_file_legacy" ]; then
    cp "$blog_nostr_authors_file_legacy" "$blog_nostr_authors_file" 2>/dev/null || : > "$blog_nostr_authors_file"
  fi
  if [ ! -f "$blog_nostr_relays_file" ] && [ -f "$blog_nostr_relays_file_legacy" ]; then
    cp "$blog_nostr_relays_file_legacy" "$blog_nostr_relays_file" 2>/dev/null || : > "$blog_nostr_relays_file"
  fi
  if [ ! -f "$blog_nostr_blocklist_file" ] && [ -f "$blog_nostr_blocklist_file_legacy" ]; then
    cp "$blog_nostr_blocklist_file_legacy" "$blog_nostr_blocklist_file" 2>/dev/null || : > "$blog_nostr_blocklist_file"
  fi
  [ -f "$blog_nostr_authors_file" ] || : > "$blog_nostr_authors_file"
  [ -f "$blog_nostr_relays_file" ] || : > "$blog_nostr_relays_file"
  [ -f "$blog_nostr_blocklist_file" ] || : > "$blog_nostr_blocklist_file"
  [ -f "$blog_nostr_hidden_posts_file" ] || : > "$blog_nostr_hidden_posts_file"
  if [ -f "$blog_nostr_secret_key_file" ]; then
    chmod 600 "$blog_nostr_secret_key_file" 2>/dev/null || true
  fi
}

blog_now_epoch() {
  date +%s
}

blog_now_iso() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

blog_iso_to_epoch() {
  iso=${1-}
  if [ -z "$iso" ]; then
    printf '0\n'
    return 0
  fi

  if date -u -d "$iso" +%s >/dev/null 2>&1; then
    date -u -d "$iso" +%s
    return 0
  fi

  if date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s >/dev/null 2>&1; then
    date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s
    return 0
  fi

  printf '0\n'
}

blog_month_name() {
  month=${1-}
  case "$month" in
    01) printf 'January\n' ;;
    02) printf 'February\n' ;;
    03) printf 'March\n' ;;
    04) printf 'April\n' ;;
    05) printf 'May\n' ;;
    06) printf 'June\n' ;;
    07) printf 'July\n' ;;
    08) printf 'August\n' ;;
    09) printf 'September\n' ;;
    10) printf 'October\n' ;;
    11) printf 'November\n' ;;
    12) printf 'December\n' ;;
    *) printf 'Unknown\n' ;;
  esac
}

blog_iso_to_human_date() {
  iso=${1-}
  if [ -z "$iso" ]; then
    printf 'Unknown date\n'
    return 0
  fi

  if date -u -d "$iso" '+%B %e, %Y' >/dev/null 2>&1; then
    date -u -d "$iso" '+%B %e, %Y' | sed 's/  / /g'
    return 0
  fi

  if date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$iso" '+%B %e, %Y' >/dev/null 2>&1; then
    date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$iso" '+%B %e, %Y' | sed 's/  / /g'
    return 0
  fi

  date_only=${iso%%T*}
  year=$(printf '%s' "$date_only" | cut -d- -f1)
  month=$(printf '%s' "$date_only" | cut -d- -f2)
  day=$(printf '%s' "$date_only" | cut -d- -f3 | sed 's/^0//')
  month_name=$(blog_month_name "$month")
  if [ -n "$year" ] && [ -n "$month" ] && [ -n "$day" ]; then
    printf '%s %s, %s\n' "$month_name" "$day" "$year"
    return 0
  fi

  printf '%s\n' "$date_only"
}

blog_word_count() {
  text=${1-}
  printf '%s' "$text" | tr -cs '[:alnum:]' '\n' | awk 'NF { c++ } END { print c + 0 }'
}

blog_estimated_read_minutes() {
  words=${1-0}
  case "$words" in ''|*[!0-9]*) words=0 ;; esac
  minutes=$(( (words + 199) / 200 ))
  if [ "$minutes" -lt 1 ]; then
    minutes=1
  fi
  printf '%s\n' "$minutes"
}

blog_json_escape() {
  printf '%s' "${1-}" | awk 'BEGIN{ORS=""} {
    gsub(/\\/, "\\\\");
    gsub(/"/, "\\\"");
    gsub(/\t/, "\\t");
    gsub(/\r/, "\\r");
    if (NR > 1) {
      printf "\\n";
    }
    printf "%s", $0;
  }'
}

blog_html_escape() {
  printf '%s' "${1-}" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g' -e "s/'/\&#39;/g"
}

blog_url_encode() {
  # URL-encode common path/query characters without external deps.
  printf '%s' "${1-}" | sed \
    -e 's/%/%25/g' \
    -e 's/ /%20/g' \
    -e 's/#/%23/g' \
    -e 's/?/%3F/g' \
    -e 's/&/%26/g' \
    -e 's/=/%3D/g' \
    -e 's/+/%2B/g' \
    -e 's/:/%3A/g' \
    -e 's/;/%3B/g' \
    -e 's/@/%40/g' \
    -e 's/,/%2C/g'
}

blog_yaml_escape() {
  printf '%s' "${1-}" | sed 's/"/\\"/g'
}

blog_slugify() {
  text=${1-}
  slug=$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]/-/g' -e 's/-\{2,\}/-/g' -e 's/^-//' -e 's/-$//')
  if [ -z "$slug" ]; then
    slug="post"
  fi
  printf '%s\n' "$slug"
}

blog_random_token() {
  bytes=${1:-24}
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
    return 0
  fi
  dd if=/dev/urandom bs="$bytes" count=1 2>/dev/null | od -An -tx1 | tr -d ' \n'
  printf '\n'
}

blog_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
    return 0
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
    return 0
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 | awk '{print $NF}'
    return 0
  fi
  printf '0000000000000000000000000000000000000000000000000000000000000000\n'
}

blog_b64_to_file() {
  # blog_b64_to_file BASE64 OUTPUT_FILE
  b64=${1-}
  out=${2-}
  if [ -z "$out" ]; then
    return 1
  fi

  if command -v base64 >/dev/null 2>&1; then
    if printf '%s' "$b64" | base64 --decode > "$out" 2>/dev/null; then
      return 0
    fi
    if printf '%s' "$b64" | base64 -d > "$out" 2>/dev/null; then
      return 0
    fi
    if printf '%s' "$b64" | base64 -D > "$out" 2>/dev/null; then
      return 0
    fi
  fi

  if command -v openssl >/dev/null 2>&1; then
    printf '%s' "$b64" | openssl base64 -d -A > "$out" 2>/dev/null
    return $?
  fi

  return 1
}

blog_to_base64url() {
  printf '%s' "${1-}" | tr '+/' '-_' | tr -d '='
}

blog_from_base64url() {
  in=${1-}
  raw=$(printf '%s' "$in" | tr '-_' '+/')
  mod=$(( ${#raw} % 4 ))
  case "$mod" in
    0) ;;
    2) raw="${raw}==" ;;
    3) raw="${raw}=" ;;
    *) ;;
  esac
  printf '%s\n' "$raw"
}

blog_client_ip() {
  forwarded=${HTTP_X_FORWARDED_FOR-}
  if [ -n "$forwarded" ]; then
    printf '%s' "$forwarded" | awk -F',' '{gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); print $1}'
    return 0
  fi
  if [ -n "${REMOTE_ADDR-}" ]; then
    printf '%s\n' "$REMOTE_ADDR"
    return 0
  fi
  printf 'unknown\n'
}

blog_rate_limit_key_path() {
  scope=${1-}
  key=${2-}
  [ -n "$scope" ] || return 1
  [ -n "$key" ] || return 1
  digest=$(printf '%s' "$scope:$key" | blog_sha256)
  printf '%s/%s-%s.conf\n' "$blog_nostr_rate_limits_dir" "$scope" "$digest"
}

blog_rate_limit_check() {
  # args: scope key limit window_seconds
  scope=${1-}
  key=${2-}
  limit=${3-0}
  window=${4-0}
  case "$limit" in ''|*[!0-9]*) limit=0 ;; esac
  case "$window" in ''|*[!0-9]*) window=0 ;; esac
  if [ "$limit" -le 0 ] || [ "$window" -le 0 ] || [ -z "$scope" ] || [ -z "$key" ]; then
    return 0
  fi

  path=$(blog_rate_limit_key_path "$scope" "$key")
  now=$(blog_now_epoch)
  started=0
  count=0
  if [ -f "$path" ]; then
    started=$(config-get "$path" started_at 2>/dev/null || printf '0')
    count=$(config-get "$path" count 2>/dev/null || printf '0')
  fi
  case "$started" in ''|*[!0-9]*) started=0 ;; esac
  case "$count" in ''|*[!0-9]*) count=0 ;; esac

  if [ "$started" -le 0 ] || [ "$((now - started))" -ge "$window" ]; then
    started=$now
    count=0
  fi

  if [ "$count" -ge "$limit" ]; then
    return 1
  fi

  count=$((count + 1))
  config-set "$path" started_at "$started"
  config-set "$path" count "$count"
  config-set "$path" updated_at "$now"
  return 0
}

blog_read_request_body() {
  BLOG_REQUEST_BODY=""
  method=${REQUEST_METHOD-GET}
  if [ "$method" != "POST" ]; then
    return 0
  fi

  cl=${CONTENT_LENGTH-0}
  case "$cl" in
    ''|*[!0-9]*) cl=0 ;;
  esac

  if [ "$cl" -gt 0 ]; then
    BLOG_REQUEST_BODY=$(dd bs=1 count="$cl" 2>/dev/null || true)
    return 0
  fi

  BLOG_REQUEST_BODY=$(cat 2>/dev/null || true)
}

blog_param() {
  key=${1-}
  val=$(get-query-param "$key" "${QUERY_STRING-}" 2>/dev/null || printf '')
  if [ -n "${BLOG_REQUEST_BODY-}" ]; then
    body_val=$(get-query-param "$key" "$BLOG_REQUEST_BODY" 2>/dev/null || printf '')
    if [ -n "$body_val" ]; then
      val=$body_val
    fi
  fi
  printf '%s\n' "$val"
}

blog_send_json_headers() {
  http-status 200 "OK"
  http-header "Content-Type" "application/json"
  http-end-headers
}

blog_send_html_headers() {
  http-ok-html
}

blog_json_error() {
  msg=${1-Unknown error}
  code=${2-false}
  esc=$(blog_json_escape "$msg")
  printf '{"success":false,"error":"%s","code":"%s"}\n' "$esc" "$code"
}

blog_nostr_bridge_enabled() {
  enabled=$(config-get "$blog_site_conf" nostr_bridge_enabled 2>/dev/null || printf 'false')
  case "$enabled" in
    true|1|yes|on) return 0 ;;
  esac
  return 1
}

blog_nostr_bridge_disabled_json() {
  blog_json_error "Nostr bridge is disabled for this site" "nostr_disabled"
}

blog_nostr_list_file_lines() {
  file=${1-}
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    return 0
  fi
  sed -e 's/#.*$//' -e 's/[[:space:]]\+$//' -e 's/^[[:space:]]*//' "$file" | awk 'NF'
}

blog_nostr_list_file_to_json_array() {
  file=${1-}
  json_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-list.XXXXXX")
  blog_nostr_list_file_lines "$file" | awk '{
    gsub(/\\/,"\\\\");
    gsub(/"/,"\\\"");
    printf "\"%s\"\n", $0;
  }' > "$json_tmp"
  if [ ! -s "$json_tmp" ]; then
    rm -f "$json_tmp"
    printf '[]'
    return 0
  fi
  printf '['
  first=1
  while IFS= read -r line || [ -n "$line" ]; do
    if [ "$first" -eq 0 ]; then
      printf ','
    fi
    first=0
    printf '%s' "$line"
  done < "$json_tmp"
  printf ']'
  rm -f "$json_tmp"
}

blog_nostr_list_has_value() {
  file=${1-}
  value=${2-}
  [ -n "$file" ] || return 1
  [ -n "$value" ] || return 1
  blog_nostr_list_file_lines "$file" | grep -Fqx "$value"
}

blog_nostr_list_add_value() {
  file=${1-}
  value=${2-}
  [ -n "$file" ] || return 1
  [ -n "$value" ] || return 1
  if blog_nostr_list_has_value "$file" "$value"; then
    return 0
  fi
  printf '%s\n' "$value" >> "$file"
}

blog_nostr_list_remove_value() {
  file=${1-}
  value=${2-}
  [ -n "$file" ] || return 1
  [ -n "$value" ] || return 1
  tmp_file=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-list-remove.XXXXXX")
  blog_nostr_list_file_lines "$file" | awk -v remove="$value" '{
    if ($0 != remove) {
      print $0;
    }
  }' > "$tmp_file"
  mv "$tmp_file" "$file"
  chmod 644 "$file" 2>/dev/null || true
}

blog_nostr_event_uri() {
  kind=${1-}
  pubkey=${2-}
  dtag=${3-}
  printf 'nostr:%s:%s:%s\n' "$kind" "$pubkey" "$dtag"
}

blog_nostr_event_address() {
  kind=${1-}
  pubkey=${2-}
  dtag=${3-}
  printf '%s:%s:%s\n' "$kind" "$pubkey" "$dtag"
}

blog_post_nostr_address_for_file() {
  file=${1-}
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    printf '\n'
    return 0
  fi

  addr=$(blog_read_front_matter_value "$file" nostr_address 2>/dev/null || printf '')
  if [ -n "$addr" ]; then
    printf '%s\n' "$addr"
    return 0
  fi

  pubkey=$(blog_read_front_matter_value "$file" nostr_pubkey 2>/dev/null || printf '')
  kind=$(blog_read_front_matter_value "$file" nostr_kind 2>/dev/null || printf '')
  dtag=$(blog_read_front_matter_value "$file" nostr_d 2>/dev/null || printf '')
  if [ -n "$pubkey" ] && [ -n "$kind" ] && [ -n "$dtag" ]; then
    blog_nostr_event_address "$kind" "$pubkey" "$dtag"
    return 0
  fi

  if [ -f "$blog_nostr_posts_index" ]; then
    rel=${file#"$blog_site_root/site/pages/"}
    idx_addr=$(jq -r --arg rel "$rel" '.[] | select(.md_path == $rel) | .address' "$blog_nostr_posts_index" 2>/dev/null | head -n 1)
    if [ -n "$idx_addr" ]; then
      printf '%s\n' "$idx_addr"
      return 0
    fi
  fi

  printf '\n'
}

blog_nostr_comment_counts_build() {
  out_file=${1-}
  [ -n "$out_file" ] || return 1
  : > "$out_file"
  if ! blog_nostr_bridge_enabled; then
    return 0
  fi
  if [ ! -f "$blog_nostr_comments_index" ]; then
    blog_nostr_rebuild_derived >/dev/null 2>&1 || true
  fi
  if [ ! -f "$blog_nostr_comments_index" ]; then
    return 0
  fi

  jq -r '.[] | (.a_refs // [])[]?' "$blog_nostr_comments_index" 2>/dev/null | awk 'NF' | sort | uniq -c | awk '{c=$1; $1=""; sub(/^ +/, "", $0); printf "%s\t%s\n", $0, c }' > "$out_file"
}

blog_nostr_comment_count_lookup() {
  counts_file=${1-}
  address=${2-}
  if [ -z "$counts_file" ] || [ -z "$address" ] || [ ! -f "$counts_file" ]; then
    printf '0\n'
    return 0
  fi
  count=$(awk -F'\t' -v addr="$address" '$1==addr {print $2; exit}' "$counts_file" 2>/dev/null || printf '')
  case "$count" in ''|*[!0-9]*) count=0 ;; esac
  printf '%s\n' "$count"
}

blog_validate_username() {
  name=${1-}
  case "$name" in
    ''|*[!a-zA-Z0-9._-]*) return 1 ;;
    *) return 0 ;;
  esac
}

blog_validate_player_name() {
  name=$(printf '%s' "${1-}" | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//')
  [ -n "$name" ] || return 1
  len=$(printf '%s' "$name" | wc -c | tr -d ' ')
  [ "$len" -le 40 ] || return 1
  printf '%s\n' "$name" | grep -Eq '^[A-Za-z0-9._ -]+$'
}

blog_auto_summary_from_content() {
  content=${1-}
  if [ -z "$content" ]; then
    printf '%s\n' ''
    return 0
  fi
  # Strip common markdown syntax and collapse whitespace.
  plain=$(
    printf '%s\n' "$content" \
      | sed -E 's/```[^`]*```/ /g; s/`([^`]*)`/\1/g; s/!\[[^]]*\]\([^)]*\)/ /g; s/\[([^]]*)\]\([^)]*\)/\1/g; s/^[[:space:]]{0,3}[#>*-]+[[:space:]]*//g; s/[*_~]+//g' \
      | tr '\n' ' ' \
      | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//'
  )
  if [ -z "$plain" ]; then
    printf '%s\n' ''
    return 0
  fi
  max_words=28
  summary=$(printf '%s\n' "$plain" | awk -v n="$max_words" '{ for (i=1; i<=NF && i<=n; i++) { printf "%s%s", $i, (i<n && i<NF ? " " : "") } }')
  if [ -n "$summary" ] && [ "$(printf '%s\n' "$plain" | wc -w | tr -d ' ')" -gt "$max_words" ]; then
    summary="$summary..."
  fi
  printf '%s\n' "$summary"
}

blog_validate_nostr_pubkey() {
  pubkey=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
  case "$pubkey" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*)
      if [ "${#pubkey}" -eq 64 ]; then
        printf '%s\n' "$pubkey"
        return 0
      fi
      ;;
  esac
  return 1
}

blog_new_users_are_admins_enabled() {
  enabled=$(config-get "$blog_site_conf" new_users_are_admins 2>/dev/null || printf 'false')
  [ "$enabled" = "true" ]
}

blog_user_dir() {
  printf '%s/%s\n' "$blog_users_dir" "$1"
}

blog_user_profile() {
  printf '%s/profile.conf\n' "$(blog_user_dir "$1")"
}

blog_user_rank_value() {
  rank_user=${1-}
  [ -n "$rank_user" ] || {
    printf '0\n'
    return 0
  }
  rank_profile=$(blog_user_profile "$rank_user")
  if [ ! -f "$rank_profile" ]; then
    printf '0\n'
    return 0
  fi
  rank=$(config-get "$rank_profile" user_rank 2>/dev/null || printf '0')
  case "$rank" in
    ''|*[!0-9]*) rank=0 ;;
  esac
  printf '%s\n' "$rank"
}

blog_next_user_rank() {
  max=0
  for next_profile in "$blog_users_dir"/*/profile.conf; do
    [ -f "$next_profile" ] || continue
    rank=$(config-get "$next_profile" user_rank 2>/dev/null || printf '0')
    case "$rank" in ''|*[!0-9]*) rank=0 ;; esac
    if [ "$rank" -gt "$max" ]; then
      max=$rank
    fi
  done
  printf '%s\n' $((max + 1))
}

blog_ensure_user_rank() {
  ensure_user=${1-}
  [ -n "$ensure_user" ] || return 1
  ensure_profile=$(blog_user_profile "$ensure_user")
  [ -f "$ensure_profile" ] || return 1
  rank=$(config-get "$ensure_profile" user_rank 2>/dev/null || printf '0')
  case "$rank" in
    ''|*[!0-9]*) rank=0 ;;
  esac
  if [ "$rank" -gt 0 ]; then
    printf '%s\n' "$rank"
    return 0
  fi
  ensure_rank=$(blog_next_user_rank)
  config-set "$ensure_profile" user_rank "$ensure_rank"
  printf '%s\n' "$ensure_rank"
}

blog_users_reindex() {
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-users-reindex.XXXXXX")

  for re_profile in "$blog_users_dir"/*/profile.conf; do
    [ -f "$re_profile" ] || continue
    re_username=$(config-get "$re_profile" username 2>/dev/null || printf '')
    if [ -z "$re_username" ]; then
      re_username=$(basename "$(dirname "$re_profile")")
      config-set "$re_profile" username "$re_username"
    fi
    re_rank=$(config-get "$re_profile" user_rank 2>/dev/null || printf '0')
    case "$re_rank" in ''|*[!0-9]*) re_rank=0 ;; esac
    if [ "$re_rank" -le 0 ]; then
      re_rank=999999999
    fi
    printf '%s\t%s\t%s\n' "$re_rank" "$re_username" "$re_profile" >> "$tmp"
  done

  if [ -s "$tmp" ]; then
    sorted=$(mktemp "${TMPDIR:-/tmp}/blog-users-reindex-sorted.XXXXXX")
    sort -n -k1,1 -k2,2 "$tmp" > "$sorted"
    seq=1
    while IFS="$(printf '\t')" read -r _rank _username re_sorted_profile || [ -n "$re_sorted_profile" ]; do
      [ -n "$re_sorted_profile" ] || continue
      config-set "$re_sorted_profile" user_rank "$seq"
      seq=$((seq + 1))
    done < "$sorted"
    rm -f "$sorted"
  fi

  rm -f "$tmp"
}

blog_users_sorted_usernames() {
  blog_users_reindex
  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-users-sorted.XXXXXX")
  for sorted_profile in "$blog_users_dir"/*/profile.conf; do
    [ -f "$sorted_profile" ] || continue
    sorted_username=$(config-get "$sorted_profile" username 2>/dev/null || printf '')
    [ -n "$sorted_username" ] || sorted_username=$(basename "$(dirname "$sorted_profile")")
    sorted_rank=$(config-get "$sorted_profile" user_rank 2>/dev/null || printf '0')
    case "$sorted_rank" in ''|*[!0-9]*) sorted_rank=0 ;; esac
    printf '%s\t%s\n' "$sorted_rank" "$sorted_username" >> "$tmp"
  done
  sort -n -k1,1 -k2,2 "$tmp" | awk -F '\t' '{print $2}'
  rm -f "$tmp"
}

blog_users_apply_order_file() {
  order_file=${1-}
  [ -n "$order_file" ] || return 1
  [ -f "$order_file" ] || return 1
  seq=1
  while IFS= read -r order_username || [ -n "$order_username" ]; do
    [ -n "$order_username" ] || continue
    order_profile=$(blog_user_profile "$order_username")
    [ -f "$order_profile" ] || continue
    config-set "$order_profile" user_rank "$seq"
    seq=$((seq + 1))
  done < "$order_file"
}

blog_users_move_before() {
  move_target=${1-}
  move_before=${2-}
  [ -n "$move_target" ] || return 1
  [ -n "$move_before" ] || return 1
  [ "$move_target" != "$move_before" ] || return 0

  src=$(mktemp "${TMPDIR:-/tmp}/blog-users-move-src.XXXXXX")
  dst=$(mktemp "${TMPDIR:-/tmp}/blog-users-move-dst.XXXXXX")
  blog_users_sorted_usernames > "$src"
  inserted=0
  while IFS= read -r move_username || [ -n "$move_username" ]; do
    [ -n "$move_username" ] || continue
    if [ "$move_username" = "$move_target" ]; then
      continue
    fi
    if [ "$move_username" = "$move_before" ] && [ "$inserted" -eq 0 ]; then
      printf '%s\n' "$move_target" >> "$dst"
      inserted=1
    fi
    printf '%s\n' "$move_username" >> "$dst"
  done < "$src"
  if [ "$inserted" -eq 0 ]; then
    printf '%s\n' "$move_target" >> "$dst"
  fi
  blog_users_apply_order_file "$dst"
  rm -f "$src" "$dst"
}

blog_users_move_after() {
  move_target=${1-}
  move_after=${2-}
  [ -n "$move_target" ] || return 1
  [ -n "$move_after" ] || return 1
  [ "$move_target" != "$move_after" ] || return 0

  src=$(mktemp "${TMPDIR:-/tmp}/blog-users-move-src.XXXXXX")
  dst=$(mktemp "${TMPDIR:-/tmp}/blog-users-move-dst.XXXXXX")
  blog_users_sorted_usernames > "$src"
  inserted=0
  while IFS= read -r move_username || [ -n "$move_username" ]; do
    [ -n "$move_username" ] || continue
    if [ "$move_username" = "$move_target" ]; then
      continue
    fi
    printf '%s\n' "$move_username" >> "$dst"
    if [ "$move_username" = "$move_after" ] && [ "$inserted" -eq 0 ]; then
      printf '%s\n' "$move_target" >> "$dst"
      inserted=1
    fi
  done < "$src"
  if [ "$inserted" -eq 0 ]; then
    printf '%s\n' "$move_target" >> "$dst"
  fi
  blog_users_apply_order_file "$dst"
  rm -f "$src" "$dst"
}

blog_users_move_up_one() {
  move_target=${1-}
  [ -n "$move_target" ] || return 1
  src=$(mktemp "${TMPDIR:-/tmp}/blog-users-move-up-src.XXXXXX")
  dst=$(mktemp "${TMPDIR:-/tmp}/blog-users-move-up-dst.XXXXXX")
  blog_users_sorted_usernames > "$src"
  awk -v t="$move_target" '
    { a[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) {
        if (a[i] == t && i > 1) {
          tmp = a[i - 1]
          a[i - 1] = a[i]
          a[i] = tmp
          break
        }
      }
      for (i = 1; i <= NR; i++) {
        print a[i]
      }
    }
  ' "$src" > "$dst"
  blog_users_apply_order_file "$dst"
  rm -f "$src" "$dst"
}

blog_users_move_down_one() {
  move_target=${1-}
  [ -n "$move_target" ] || return 1
  src=$(mktemp "${TMPDIR:-/tmp}/blog-users-move-down-src.XXXXXX")
  dst=$(mktemp "${TMPDIR:-/tmp}/blog-users-move-down-dst.XXXXXX")
  blog_users_sorted_usernames > "$src"
  awk -v t="$move_target" '
    { a[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) {
        if (a[i] == t && i < NR) {
          tmp = a[i + 1]
          a[i + 1] = a[i]
          a[i] = tmp
          break
        }
      }
      for (i = 1; i <= NR; i++) {
        print a[i]
      }
    }
  ' "$src" > "$dst"
  blog_users_apply_order_file "$dst"
  rm -f "$src" "$dst"
}

blog_get_nostr_pubkey() {
  username=${1-}
  [ -n "$username" ] || return 1
  profile=$(blog_user_profile "$username")
  [ -f "$profile" ] || return 1
  pubkey=$(config-get "$profile" nostr_pubkey 2>/dev/null || printf '')
  pubkey=$(blog_validate_nostr_pubkey "$pubkey" 2>/dev/null || printf '')
  [ -n "$pubkey" ] || return 1
  printf '%s\n' "$pubkey"
}

blog_find_username_by_nostr_pubkey() {
  pubkey=$(blog_validate_nostr_pubkey "${1-}" 2>/dev/null || printf '')
  if [ -z "$pubkey" ] || [ ! -d "$blog_users_dir" ]; then
    return 1
  fi
  find "$blog_users_dir" -mindepth 2 -maxdepth 2 -type f -name profile.conf 2>/dev/null | while IFS= read -r profile; do
    [ -n "$profile" ] || continue
    saved_pubkey=$(config-get "$profile" nostr_pubkey 2>/dev/null || printf '')
    saved_pubkey=$(blog_validate_nostr_pubkey "$saved_pubkey" 2>/dev/null || printf '')
    if [ "$saved_pubkey" = "$pubkey" ]; then
      saved_user=$(config-get "$profile" username 2>/dev/null || printf '')
      if [ -n "$saved_user" ]; then
        printf '%s\n' "$saved_user"
        exit 0
      fi
    fi
  done
}

blog_suggest_username_from_nostr_pubkey() {
  pubkey=$(blog_validate_nostr_pubkey "${1-}" 2>/dev/null || printf '')
  [ -n "$pubkey" ] || return 1
  base="nostr-$(printf '%s' "$pubkey" | cut -c1-6)"
  candidate=$base
  n=1
  while [ -e "$(blog_user_profile "$candidate")" ]; do
    n=$((n + 1))
    candidate="$base-$n"
  done
  printf '%s\n' "$candidate"
}

blog_set_nostr_pubkey() {
  username=${1-}
  pubkey=$(blog_validate_nostr_pubkey "${2-}" 2>/dev/null || printf '')
  [ -n "$username" ] || return 1
  [ -n "$pubkey" ] || return 1
  dir=$(blog_user_dir "$username")
  profile="$dir/profile.conf"
  mkdir -p "$dir/delegates"
  config-set "$profile" username "$username"
  config-set "$profile" nostr_pubkey "$pubkey"
  config-set "$profile" updated_at "$(blog_now_iso)"
}

blog_set_user_ssh_key() {
  username=${1-}
  ssh_public_key=${2-}
  ssh_fingerprint=${3-}
  [ -n "$username" ] || return 1
  [ -n "$ssh_public_key" ] || return 1
  dir=$(blog_user_dir "$username")
  profile="$dir/profile.conf"
  mkdir -p "$dir/delegates"
  config-set "$profile" username "$username"
  config-set "$profile" ssh_public_key "$ssh_public_key"
  config-set "$profile" ssh_fingerprint "$ssh_fingerprint"
  config-set "$profile" updated_at "$(blog_now_iso)"
}

blog_get_player_name() {
  username=${1-}
  if [ -z "$username" ]; then
    return 1
  fi
  profile=$(blog_user_profile "$username")
  player_name=""
  if [ -f "$profile" ]; then
    player_name=$(config-get "$profile" player_name 2>/dev/null || printf '')
  fi
  if [ -z "$player_name" ]; then
    player_name=$username
  fi
  printf '%s\n' "$player_name"
}

blog_set_player_name() {
  username=${1-}
  player_name=${2-}
  if [ -z "$username" ] || [ -z "$player_name" ]; then
    return 1
  fi
  dir=$(blog_user_dir "$username")
  profile=$(blog_user_profile "$username")
  mkdir -p "$dir/delegates"
  previous_name="$username"
  if [ -f "$profile" ]; then
    previous_name=$(config-get "$profile" player_name 2>/dev/null || printf '')
    if [ -z "$previous_name" ]; then
      previous_name="$username"
    fi
  fi
  history_csv=$(config-get "$profile" player_name_history 2>/dev/null || printf '')
  if [ -n "$previous_name" ] && [ "$previous_name" != "$player_name" ]; then
    found=0
    old_ifs=$IFS
    IFS=','
    for item in $history_csv; do
      if [ "$item" = "$previous_name" ]; then
        found=1
        break
      fi
    done
    IFS=$old_ifs
    if [ "$found" -eq 0 ]; then
      if [ -n "$history_csv" ]; then
        history_csv="$history_csv,$previous_name"
      else
        history_csv="$previous_name"
      fi
    fi
  fi
  config-set "$profile" username "$username"
  config-set "$profile" player_name "$player_name"
  if [ -n "$history_csv" ]; then
    config-set "$profile" player_name_history "$history_csv"
  fi
  config-set "$profile" updated_at "$(blog_now_iso)"
}

blog_player_name_aliases() {
  username=${1-}
  if [ -z "$username" ]; then
    return 1
  fi
  profile=$(blog_user_profile "$username")
  current_name=$(blog_get_player_name "$username" 2>/dev/null || printf '%s' "$username")
  history_csv=$(config-get "$profile" player_name_history 2>/dev/null || printf '')
  unique_list=""
  add_alias() {
    val=${1-}
    [ -n "$val" ] || return 0
    case "
$unique_list
" in
*"
$val
"*)
      return 0
      ;;
    esac
    if [ -z "$unique_list" ]; then
      unique_list="$val"
    else
      unique_list="$unique_list
$val"
    fi
  }
  add_alias "$username"
  add_alias "$current_name"
  old_ifs=$IFS
  IFS=','
  for item in $history_csv; do
    add_alias "$item"
  done
  IFS=$old_ifs
  printf '%s\n' "$unique_list"
}

blog_author_display_name() {
  raw_author=${1-}
  if [ -z "$raw_author" ]; then
    printf '%s\n' ''
    return 0
  fi
  if blog_validate_username "$raw_author"; then
    profile=$(blog_user_profile "$raw_author")
    if [ -f "$profile" ]; then
      blog_get_player_name "$raw_author" 2>/dev/null || printf '%s\n' "$raw_author"
      return 0
    fi
  fi
  printf '%s\n' "$raw_author"
}

blog_rename_authored_posts() {
  old_author=${1-}
  new_author=${2-}
  if [ -z "$old_author" ] || [ -z "$new_author" ] || [ "$old_author" = "$new_author" ]; then
    printf '0\n'
    return 0
  fi
  mkdir -p "$blog_posts_dir"
  renamed=0
  escaped_new=$(blog_yaml_escape "$new_author")
  for file in "$blog_posts_dir"/*.md; do
    [ -f "$file" ] || continue
    author=$(blog_read_front_matter_value "$file" author 2>/dev/null || printf '')
    if [ "$author" != "$old_author" ]; then
      continue
    fi
    tmp=$(mktemp "${TMPDIR:-/tmp}/blog-author-rename.XXXXXX")
    if awk -v repl="author: \"$escaped_new\"" '
      BEGIN { in_fm = 0; fm_closed = 0; replaced = 0; }
      {
        if (fm_closed == 0 && $0 == "---") {
          if (in_fm == 0) {
            in_fm = 1;
            print $0;
            next;
          }
          in_fm = 0;
          fm_closed = 1;
          print $0;
          next;
        }
        if (in_fm == 1 && replaced == 0 && $0 ~ /^author:[[:space:]]*/) {
          print repl;
          replaced = 1;
          next;
        }
        print $0;
      }
    ' "$file" > "$tmp"; then
      mv "$tmp" "$file"
      renamed=$((renamed + 1))
    else
      rm -f "$tmp"
    fi
  done
  printf '%s\n' "$renamed"
}

blog_count_authored_posts_by_author() {
  author_name=${1-}
  if [ -z "$author_name" ]; then
    printf '0\n'
    return 0
  fi
  mkdir -p "$blog_posts_dir"
  count=0
  for file in "$blog_posts_dir"/*.md; do
    [ -f "$file" ] || continue
    author=$(blog_read_front_matter_value "$file" author 2>/dev/null || printf '')
    if [ "$author" = "$author_name" ]; then
      count=$((count + 1))
    fi
  done
  printf '%s\n' "$count"
}

blog_find_username_by_fingerprint() {
  fingerprint=${1-}
  if [ -z "$fingerprint" ] || [ ! -d "$blog_users_dir" ]; then
    return 1
  fi

  find "$blog_users_dir" -mindepth 2 -maxdepth 2 -type f -name profile.conf 2>/dev/null | while IFS= read -r profile; do
    [ -n "$profile" ] || continue
    saved_fp=$(config-get "$profile" fingerprint 2>/dev/null || printf '')
    if [ "$saved_fp" = "$fingerprint" ]; then
      saved_user=$(config-get "$profile" username 2>/dev/null || printf '')
      if [ -n "$saved_user" ]; then
        printf '%s\n' "$saved_user"
        exit 0
      fi
    fi
  done
}

blog_user_is_admin_direct() {
  username=${1-}
  if [ -z "$username" ]; then
    return 1
  fi

  profile=$(blog_user_profile "$username")
  if [ -f "$profile" ]; then
    is_admin=$(config-get "$profile" is_admin 2>/dev/null || printf '')
    if [ "$is_admin" = "true" ]; then
      return 0
    fi
  fi

  if id "$username" >/dev/null 2>&1; then
    if id -nG "$username" 2>/dev/null | grep -Eq '(^|[[:space:]])blog-admin($|[[:space:]])'; then
      return 0
    fi
  fi

  return 1
}

blog_user_is_admin() {
  username=${1-}
  if [ -z "$username" ]; then
    return 1
  fi

  if blog_user_is_admin_direct "$username"; then
    return 0
  fi

  profile=$(blog_user_profile "$username")
  if [ -f "$profile" ]; then
    fingerprint=$(config-get "$profile" fingerprint 2>/dev/null || printf '')
    if [ -n "$fingerprint" ] && [ -d "$blog_users_dir" ]; then
      for alt_profile in "$blog_users_dir"/*/profile.conf; do
        [ -f "$alt_profile" ] || continue
        alt_user=$(config-get "$alt_profile" username 2>/dev/null || printf '')
        [ -n "$alt_user" ] || continue
        if [ "$alt_user" = "$username" ]; then
          continue
        fi
        alt_fingerprint=$(config-get "$alt_profile" fingerprint 2>/dev/null || printf '')
        if [ "$alt_fingerprint" = "$fingerprint" ] && blog_user_is_admin_direct "$alt_user"; then
          return 0
        fi
      done
    fi
  fi

  return 1
}

blog_save_user_profile() {
  username=$1
  fingerprint=$2
  ssh_public_key=$3

  dir=$(blog_user_dir "$username")
  profile="$dir/profile.conf"
  mkdir -p "$dir/delegates"
  config-set "$profile" username "$username"
  config-set "$profile" fingerprint "$fingerprint"
  config-set "$profile" ssh_public_key "$ssh_public_key"
  config-set "$profile" updated_at "$(blog_now_iso)"
  current_admin=$(config-get "$profile" is_admin 2>/dev/null || printf '')
  case "$current_admin" in
    true|false)
      config-set "$profile" is_admin "$current_admin"
      ;;
    *)
      if blog_user_is_admin "$username"; then
        config-set "$profile" is_admin true
      else
        config-set "$profile" is_admin false
      fi
      ;;
  esac
  blog_ensure_user_rank "$username" >/dev/null 2>&1 || true
}

blog_session_path() {
  printf '%s/%s.conf\n' "$blog_sessions_dir" "$1"
}

blog_nostr_login_request_path() {
  request_id=${1-}
  printf '%s/%s.conf\n' "$blog_nostr_login_requests_dir" "$request_id"
}

blog_create_nostr_login_request() {
  # args: [pubkey_hint] [domain] [type]
  pubkey=$(blog_validate_nostr_pubkey "${1-}" 2>/dev/null || printf '')
  domain=${2-${HTTP_HOST:-${SERVER_NAME:-}}}
  request_type=${3-login}
  [ -n "$domain" ] || domain="unknown"
  request_id=$(blog_random_token 16)
  challenge=$(blog_random_token 24)
  now=$(blog_now_epoch)
  expires_at=$((now + 120))
  request_path=$(blog_nostr_login_request_path "$request_id")
  config-set "$request_path" pubkey_hint "$pubkey"
  config-set "$request_path" domain "$domain"
  config-set "$request_path" request_type "$request_type"
  config-set "$request_path" challenge "$challenge"
  config-set "$request_path" created_at "$now"
  config-set "$request_path" expires_at "$expires_at"
  printf '%s;%s;%s\n' "$request_id" "$challenge" "$expires_at"
}

blog_get_nostr_login_request() {
  request_id=${1-}
  request_path=$(blog_nostr_login_request_path "$request_id")
  [ -f "$request_path" ] || return 1
  pubkey=$(config-get "$request_path" pubkey_hint 2>/dev/null || printf '')
  domain=$(config-get "$request_path" domain 2>/dev/null || printf '')
  request_type=$(config-get "$request_path" request_type 2>/dev/null || printf 'login')
  challenge=$(config-get "$request_path" challenge 2>/dev/null || printf '')
  created_at=$(config-get "$request_path" created_at 2>/dev/null || printf '0')
  expires_at=$(config-get "$request_path" expires_at 2>/dev/null || printf '0')
  pubkey=$(blog_validate_nostr_pubkey "$pubkey" 2>/dev/null || printf '')
  case "$created_at" in ''|*[!0-9]*) created_at=0 ;; esac
  case "$expires_at" in ''|*[!0-9]*) expires_at=0 ;; esac
  if [ "$expires_at" -le 0 ]; then
    expires_at=$((created_at + 120))
  fi
  now=$(blog_now_epoch)
  if [ -z "$challenge" ] || [ -z "$domain" ] || [ "$now" -gt "$expires_at" ]; then
    rm -f "$request_path"
    return 1
  fi
  printf '%s;%s;%s;%s;%s\n' "$pubkey" "$challenge" "$domain" "$request_type" "$expires_at"
}

blog_clear_nostr_login_request() {
  request_id=${1-}
  [ -n "$request_id" ] || return 0
  rm -f "$(blog_nostr_login_request_path "$request_id")"
}

blog_nostr_delegation_path() {
  delegation_id=${1-}
  printf '%s/%s.conf\n' "$blog_nostr_delegations_dir" "$delegation_id"
}

blog_nostr_delegation_revoked() {
  key=${1-}
  [ -n "$key" ] || return 1
  [ -f "$blog_nostr_delegation_revocations_file" ] || return 1
  grep -Fqx "$key" "$blog_nostr_delegation_revocations_file" 2>/dev/null
}

blog_nostr_revoke_marker() {
  key=${1-}
  [ -n "$key" ] || return 0
  if blog_nostr_delegation_revoked "$key"; then
    return 0
  fi
  printf '%s\n' "$key" >> "$blog_nostr_delegation_revocations_file"
}

blog_nostr_delegation_activate() {
  # args: delegation_event_json expected_user_pubkey expected_domain
  delegation_json=${1-}
  expected_user_pubkey=$(blog_validate_nostr_pubkey "${2-}" 2>/dev/null || printf '')
  expected_domain=${3-${HTTP_HOST:-${SERVER_NAME:-}}}
  [ -n "$delegation_json" ] || return 1
  [ -n "$expected_user_pubkey" ] || return 1
  [ -n "$expected_domain" ] || return 1
  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  delegation_json=$(printf '%s\n' "$delegation_json" | jq -c '.' 2>/dev/null || printf '')
  [ -n "$delegation_json" ] || return 1
  if ! blog_nostr_verify_event_json "$delegation_json"; then
    return 1
  fi

  delegator=$(printf '%s\n' "$delegation_json" | jq -r '.pubkey // ""' 2>/dev/null || printf '')
  delegator=$(blog_validate_nostr_pubkey "$delegator" 2>/dev/null || printf '')
  if [ "$delegator" != "$expected_user_pubkey" ]; then
    return 1
  fi

  kind=$(printf '%s\n' "$delegation_json" | jq -r '.kind // 0' 2>/dev/null || printf '0')
  if [ "$kind" != "27235" ]; then
    return 1
  fi

  session_pubkey=$(printf '%s\n' "$delegation_json" | jq -r '[.tags[]? | select(type=="array" and length>=2 and .[0]=="session_pubkey") | .[1]] | first // ""' 2>/dev/null || printf '')
  domain=$(printf '%s\n' "$delegation_json" | jq -r '[.tags[]? | select(type=="array" and length>=2 and .[0]=="domain") | .[1]] | first // ""' 2>/dev/null || printf '')
  expires_at=$(printf '%s\n' "$delegation_json" | jq -r '[.tags[]? | select(type=="array" and length>=2 and .[0]=="expires_at") | .[1]] | first // "0"' 2>/dev/null || printf '0')

  session_pubkey=$(blog_validate_nostr_pubkey "$session_pubkey" 2>/dev/null || printf '')
  case "$expires_at" in ''|*[!0-9]*) expires_at=0 ;; esac
  if [ -z "$session_pubkey" ] || [ "$domain" != "$expected_domain" ] || [ "$expires_at" -le 0 ]; then
    return 1
  fi

  now=$(blog_now_epoch)
  min_exp=$((now + 86400))
  max_exp=$((now + 7776000))
  if [ "$expires_at" -lt "$min_exp" ] || [ "$expires_at" -gt "$max_exp" ]; then
    return 1
  fi

  event_id=$(printf '%s\n' "$delegation_json" | jq -r '.id // ""' 2>/dev/null || printf '')
  if [ -n "$event_id" ]; then
    delegation_id=$event_id
  else
    delegation_id=$(printf '%s:%s:%s:%s' "$delegator" "$session_pubkey" "$domain" "$expires_at" | blog_sha256)
  fi
  path=$(blog_nostr_delegation_path "$delegation_id")
  config-set "$path" delegation_id "$delegation_id"
  config-set "$path" user_pubkey "$delegator"
  config-set "$path" session_pubkey "$session_pubkey"
  config-set "$path" domain "$domain"
  config-set "$path" expires_at "$expires_at"
  config-set "$path" created_at "$now"
  config-set "$path" delegation_event_id "$event_id"
  config-set "$path" revoked false
  printf '%s;%s;%s\n' "$delegation_id" "$session_pubkey" "$expires_at"
}

blog_nostr_active_delegation_for_session() {
  # args: session_pubkey expected_domain
  session_pubkey=$(blog_validate_nostr_pubkey "${1-}" 2>/dev/null || printf '')
  expected_domain=${2-${HTTP_HOST:-${SERVER_NAME:-}}}
  [ -n "$session_pubkey" ] || return 1
  [ -n "$expected_domain" ] || return 1
  now=$(blog_now_epoch)
  for file in "$blog_nostr_delegations_dir"/*.conf; do
    [ -f "$file" ] || continue
    delegation_id=$(config-get "$file" delegation_id 2>/dev/null || printf '')
    user_pubkey=$(config-get "$file" user_pubkey 2>/dev/null || printf '')
    deleg_session=$(config-get "$file" session_pubkey 2>/dev/null || printf '')
    domain=$(config-get "$file" domain 2>/dev/null || printf '')
    expires_at=$(config-get "$file" expires_at 2>/dev/null || printf '0')
    revoked=$(config-get "$file" revoked 2>/dev/null || printf 'false')
    user_pubkey=$(blog_validate_nostr_pubkey "$user_pubkey" 2>/dev/null || printf '')
    deleg_session=$(blog_validate_nostr_pubkey "$deleg_session" 2>/dev/null || printf '')
    case "$expires_at" in ''|*[!0-9]*) expires_at=0 ;; esac
    if [ -z "$delegation_id" ] || [ -z "$user_pubkey" ] || [ -z "$deleg_session" ]; then
      continue
    fi
    if [ "$deleg_session" != "$session_pubkey" ] || [ "$domain" != "$expected_domain" ]; then
      continue
    fi
    if [ "$revoked" = "true" ] || [ "$expires_at" -le "$now" ]; then
      continue
    fi
    if blog_nostr_delegation_revoked "$delegation_id" || blog_nostr_delegation_revoked "$deleg_session"; then
      continue
    fi
    printf '%s;%s;%s\n' "$delegation_id" "$user_pubkey" "$expires_at"
    return 0
  done
  return 1
}

blog_nostr_revoke_user_delegations() {
  user_pubkey=$(blog_validate_nostr_pubkey "${1-}" 2>/dev/null || printf '')
  [ -n "$user_pubkey" ] || return 1
  count=0
  for file in "$blog_nostr_delegations_dir"/*.conf; do
    [ -f "$file" ] || continue
    d_user=$(config-get "$file" user_pubkey 2>/dev/null || printf '')
    d_user=$(blog_validate_nostr_pubkey "$d_user" 2>/dev/null || printf '')
    if [ "$d_user" != "$user_pubkey" ]; then
      continue
    fi
    delegation_id=$(config-get "$file" delegation_id 2>/dev/null || printf '')
    session_pubkey=$(config-get "$file" session_pubkey 2>/dev/null || printf '')
    [ -n "$delegation_id" ] || delegation_id=$(basename "$file" .conf)
    blog_nostr_revoke_marker "$delegation_id"
    session_pubkey=$(blog_validate_nostr_pubkey "$session_pubkey" 2>/dev/null || printf '')
    if [ -n "$session_pubkey" ]; then
      blog_nostr_revoke_marker "$session_pubkey"
    fi
    rm -f "$file"
    count=$((count + 1))
  done
  printf '%s\n' "$count"
}

blog_invalidate_user_sessions() {
  username=${1-}
  [ -n "$username" ] || return 1
  count=0
  for file in "$blog_sessions_dir"/*.conf; do
    [ -f "$file" ] || continue
    session_user=$(config-get "$file" username 2>/dev/null || printf '')
    if [ "$session_user" = "$username" ]; then
      rm -f "$file"
      count=$((count + 1))
    fi
  done
  printf '%s\n' "$count"
}

blog_create_session() {
  username=$1
  fingerprint=$2
  user_pubkey=$(blog_validate_nostr_pubkey "${3-}" 2>/dev/null || printf '')
  signer_pubkey=$(blog_validate_nostr_pubkey "${4-}" 2>/dev/null || printf '')
  delegation_id=${5-}
  auth_method=${6-nostr}
  force_interactive=${7-false}
  case "$force_interactive" in
    true|1|yes|on) force_interactive=true ;;
    *) force_interactive=false ;;
  esac

  token=$(blog_random_token 24)
  csrf=$(blog_random_token 16)
  now=$(blog_now_epoch)
  expires=$((now + 43200))
  is_admin=false
  if blog_user_is_admin "$username"; then
    is_admin=true
  fi

  path=$(blog_session_path "$token")
  config-set "$path" username "$username"
  config-set "$path" fingerprint "$fingerprint"
  config-set "$path" csrf_token "$csrf"
  config-set "$path" created_at "$now"
  config-set "$path" expires_at "$expires"
  config-set "$path" is_admin "$is_admin"
  config-set "$path" user_pubkey "$user_pubkey"
  config-set "$path" signer_pubkey "$signer_pubkey"
  config-set "$path" delegation_id "$delegation_id"
  config-set "$path" auth_method "$auth_method"
  config-set "$path" force_interactive "$force_interactive"

  printf '%s;%s;%s\n' "$token" "$csrf" "$is_admin"
}

blog_load_session() {
  load_token=${1-}
  if [ -z "$load_token" ]; then
    return 1
  fi

  load_path=$(blog_session_path "$load_token")
  if [ ! -f "$load_path" ]; then
    return 1
  fi

  load_username=$(config-get "$load_path" username 2>/dev/null || printf '')
  load_fingerprint=$(config-get "$load_path" fingerprint 2>/dev/null || printf '')
  load_csrf=$(config-get "$load_path" csrf_token 2>/dev/null || printf '')
  load_expires=$(config-get "$load_path" expires_at 2>/dev/null || printf '0')
  load_is_admin=$(config-get "$load_path" is_admin 2>/dev/null || printf 'false')
  load_user_pubkey=$(config-get "$load_path" user_pubkey 2>/dev/null || printf '')
  load_signer_pubkey=$(config-get "$load_path" signer_pubkey 2>/dev/null || printf '')
  load_delegation_id=$(config-get "$load_path" delegation_id 2>/dev/null || printf '')
  load_auth_method=$(config-get "$load_path" auth_method 2>/dev/null || printf 'nostr')
  load_force_interactive=$(config-get "$load_path" force_interactive 2>/dev/null || printf 'false')
  case "$load_force_interactive" in
    true|1|yes|on) load_force_interactive=true ;;
    *) load_force_interactive=false ;;
  esac

  if [ -z "$load_username" ] || [ -z "$load_csrf" ]; then
    return 1
  fi

  load_now=$(blog_now_epoch)
  case "$load_expires" in
    ''|*[!0-9]*) load_expires=0 ;;
  esac
  if [ "$load_expires" -le "$load_now" ]; then
    rm -f "$load_path"
    return 1
  fi

  BLOG_SESSION_TOKEN=$load_token
  BLOG_SESSION_USERNAME=$load_username
  BLOG_SESSION_FINGERPRINT=$load_fingerprint
  BLOG_SESSION_CSRF=$load_csrf
  BLOG_SESSION_IS_ADMIN=$load_is_admin
  BLOG_SESSION_USER_PUBKEY=$(blog_validate_nostr_pubkey "$load_user_pubkey" 2>/dev/null || printf '')
  BLOG_SESSION_SIGNER_PUBKEY=$(blog_validate_nostr_pubkey "$load_signer_pubkey" 2>/dev/null || printf '')
  BLOG_SESSION_DELEGATION_ID=$load_delegation_id
  BLOG_SESSION_AUTH_METHOD=$load_auth_method
  BLOG_SESSION_FORCE_INTERACTIVE=$load_force_interactive
  if [ -z "$BLOG_SESSION_USER_PUBKEY" ]; then
    BLOG_SESSION_USER_PUBKEY=$(blog_get_nostr_pubkey "$load_username" 2>/dev/null || printf '')
  fi
  return 0
}

blog_extend_session() {
  if [ -z "${BLOG_SESSION_TOKEN-}" ]; then
    return 0
  fi
  path=$(blog_session_path "$BLOG_SESSION_TOKEN")
  now=$(blog_now_epoch)
  expires=$((now + 43200))
  config-set "$path" expires_at "$expires"
}

blog_require_session() {
  require_admin=${1:-false}
  require_interactive=${2:-false}
  case "$require_interactive" in
    true|1|yes|on) require_interactive=true ;;
    *) require_interactive=false ;;
  esac

  req_token=$(blog_param "session_token")
  req_csrf=$(blog_param "csrf_token")

  if ! blog_load_session "$req_token"; then
    blog_json_error "Not authenticated" "auth_required"
    return 1
  fi

  if [ -z "$req_csrf" ] || [ "$req_csrf" != "$BLOG_SESSION_CSRF" ]; then
    blog_json_error "Invalid CSRF token" "csrf_invalid"
    return 1
  fi

  # Re-check admin dynamically in case group membership changed.
  if blog_user_is_admin "$BLOG_SESSION_USERNAME"; then
    BLOG_SESSION_IS_ADMIN=true
  fi

  if [ "$require_admin" = "true" ] && [ "$BLOG_SESSION_IS_ADMIN" != "true" ]; then
    blog_json_error "Admin permission required" "admin_required"
    return 1
  fi

  if [ "$require_interactive" = "true" ] && [ "$BLOG_SESSION_AUTH_METHOD" = "nostr_delegated" ] && [ "${BLOG_SESSION_FORCE_INTERACTIVE-false}" = "true" ]; then
    blog_json_error "This action requires direct signer approval. Sign in with Login with Nostr or Use phone signer (QR)." "interactive_signature_required"
    return 1
  fi

  blog_extend_session
  return 0
}

blog_read_front_matter_value() {
  file=$1
  key=$2
  awk -v key="$key" '
    BEGIN { in_fm = 0; }
    /^---$/ {
      if (in_fm == 0) { in_fm = 1; next; }
      exit;
    }
    in_fm == 1 {
      if (index($0, key ":") == 1) {
        sub(/^[^:]*:[[:space:]]*/, "", $0);
        gsub(/^"|"$/, "", $0);
        print $0;
        exit;
      }
    }
  ' "$file"
}

blog_read_markdown_body() {
  file=$1
  awk '
    BEGIN { d = 0; }
    /^---$/ { d++; next; }
    d >= 2 { print; }
    d == 0 { print; }
  ' "$file"
}

blog_normalize_tags() {
  tags=${1-}
  printf '%s' "$tags" | tr '\n' ',' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | awk 'NF { if (!seen[$0]++) { if (out != "") out = out ", "; out = out $0; } } END { printf "%s", out }'
}

blog_tags_to_json_array() {
  tags=$(blog_normalize_tags "${1-}")
  if [ -z "$tags" ]; then
    printf '[]'
    return 0
  fi

  printf '['
  first=1
  printf '%s\n' "$tags" | tr ',' '\n' | while IFS= read -r tag || [ -n "$tag" ]; do
    clean=$(printf '%s' "$tag" | sed 's/^ *//;s/ *$//')
    [ -n "$clean" ] || continue
    esc=$(blog_json_escape "$clean")
    if [ "$first" -eq 0 ]; then
      printf ','
    fi
    first=0
    printf '"%s"' "$esc"
  done
  printf ']'
}

blog_tags_to_yaml_array() {
  tags=$(blog_normalize_tags "${1-}")
  if [ -z "$tags" ]; then
    printf '[]'
    return 0
  fi

  out='['
  first=1
  printf '%s\n' "$tags" | tr ',' '\n' | while IFS= read -r tag || [ -n "$tag" ]; do
    clean=$(printf '%s' "$tag" | sed 's/^ *//;s/ *$//')
    [ -n "$clean" ] || continue
    esc=$(blog_yaml_escape "$clean")
    if [ "$first" -eq 0 ]; then
      printf ', '
    fi
    first=0
    printf '"%s"' "$esc"
  done | {
    body=$(cat)
    printf '%s%s]\n' "$out" "$body"
  }
}

blog_nostr_extract_path_slug() {
  path_value=${1-}
  path_value=$(printf '%s' "$path_value" | sed -e 's#^https\{0,1\}://[^/]*/##' -e 's#^/##' -e 's#^pages/posts/##' -e 's#^posts/##')
  case "$path_value" in
    *.html) path_value=${path_value%.html} ;;
    *.md) path_value=${path_value%.md} ;;
  esac
  case "$path_value" in
    *'..'*|*'\\'*|*'//'*|*'/'*)
      printf '\n'
      return 0
      ;;
  esac
  printf '%s\n' "$path_value"
}

blog_nostr_secret_key() {
  if [ ! -f "$blog_nostr_secret_key_file" ]; then
    return 1
  fi
  secret=$(sed -n '1p' "$blog_nostr_secret_key_file" 2>/dev/null | tr -d '\r\n[:space:]')
  if [ -z "$secret" ]; then
    return 1
  fi
  printf '%s\n' "$secret"
}

blog_nostr_relays_args() {
  relays_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-relays.XXXXXX")
  blog_nostr_list_file_lines "$blog_nostr_relays_file" > "$relays_tmp"
  if [ ! -s "$relays_tmp" ]; then
    rm -f "$relays_tmp"
    return 1
  fi
  while IFS= read -r relay || [ -n "$relay" ]; do
    [ -n "$relay" ] || continue
    printf '%s\n' "$relay"
  done < "$relays_tmp"
  rm -f "$relays_tmp"
}

blog_nostr_verify_event_json() {
  event_json=${1-}
  if [ -z "$event_json" ]; then
    return 1
  fi

  # Prefer `nak verify` when available; this is the supported event verifier path.
  if command -v nak >/dev/null 2>&1; then
    if printf '%s\n' "$event_json" | nak verify >/dev/null 2>&1; then
      return 0
    fi
  fi

  # Some nostril variants may expose verification flags; only use when explicitly supported.
  if command -v nostril >/dev/null 2>&1; then
    nostril_help=$(nostril --help 2>/dev/null || printf '')
    case "$nostril_help" in
      *"verify"*|*"--verify"*)
        if printf '%s\n' "$event_json" | nostril verify >/dev/null 2>&1; then
          return 0
        fi
        if printf '%s\n' "$event_json" | nostril --verify >/dev/null 2>&1; then
          return 0
        fi
        ;;
    esac
  fi

  return 1
}

blog_nostr_verifier_available() {
  if command -v nak >/dev/null 2>&1; then
    nak_help=$(nak help 2>/dev/null || nak --help 2>/dev/null || printf '')
    case "$nak_help" in
      *"verify"*) return 0 ;;
    esac
  fi

  if command -v nostril >/dev/null 2>&1; then
    nostril_help=$(nostril --help 2>/dev/null || printf '')
    case "$nostril_help" in
      *"verify"*|*"--verify"*) return 0 ;;
    esac
  fi
  return 1
}

blog_nostr_store_event_json() {
  event_json=${1-}
  if [ -z "$event_json" ]; then
    return 1
  fi

  event_compact=$(printf '%s\n' "$event_json" | jq -c '.' 2>/dev/null || printf '')
  if [ -z "$event_compact" ]; then
    return 1
  fi

  event_id=$(printf '%s\n' "$event_compact" | jq -r '.id // empty' 2>/dev/null || printf '')
  pubkey=$(printf '%s\n' "$event_compact" | jq -r '.pubkey // empty' 2>/dev/null || printf '')
  kind=$(printf '%s\n' "$event_compact" | jq -r '.kind // empty' 2>/dev/null || printf '')
  if [ -z "$event_id" ] || [ -z "$pubkey" ] || [ -z "$kind" ]; then
    return 1
  fi

  event_dir="$blog_nostr_events_dir/$pubkey/$kind"
  event_path="$event_dir/$event_id.json"
  mkdir -p "$event_dir"

  tmp_path=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-event.XXXXXX")
  printf '%s\n' "$event_compact" > "$tmp_path"
  if [ -f "$event_path" ] && cmp -s "$event_path" "$tmp_path"; then
    rm -f "$tmp_path"
    printf '%s\n' "$event_path"
    return 0
  fi
  mv "$tmp_path" "$event_path"
  chmod 644 "$event_path" 2>/dev/null || true
  printf '%s\n' "$event_path"
}

blog_nostr_author_allowed() {
  pubkey=${1-}
  if [ -z "$pubkey" ]; then
    return 1
  fi

  author_count=$(blog_nostr_list_file_lines "$blog_nostr_authors_file" | wc -l | tr -d ' ')
  if [ "${author_count:-0}" -eq 0 ]; then
    return 0
  fi

  if blog_nostr_list_file_lines "$blog_nostr_authors_file" | grep -Fqx "$pubkey"; then
    return 0
  fi
  return 1
}

blog_nostr_append_author_if_missing() {
  pubkey=${1-}
  [ -n "$pubkey" ] || return 1
  if blog_nostr_list_file_lines "$blog_nostr_authors_file" | grep -Fqx "$pubkey"; then
    return 0
  fi
  printf '%s\n' "$pubkey" >> "$blog_nostr_authors_file"
}

blog_nostr_sign_post_event() {
  # args: title tags_csv summary content published_iso
  title=$1
  tags_csv=$2
  summary=$3
  content=$4
  published_iso=$5

  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  secret=$(blog_nostr_secret_key 2>/dev/null || printf '')
  if [ -z "$secret" ]; then
    return 1
  fi

  created_at=$(blog_now_epoch)
  d_tag=$(blog_slugify "$title")
  tags_normalized=$(blog_normalize_tags "$tags_csv")

  sign_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-sign.XXXXXX")
  event_json=''

  if command -v nostril >/dev/null 2>&1; then
    set -- nostril --sec "$secret" --kind 30023 --created-at "$created_at" --content "$content" \
      --tag "d=$d_tag" --tag "title=$title" --tag "published_at=$published_iso"
    if [ -n "$summary" ]; then
      set -- "$@" --tag "summary=$summary"
    fi
    printf '%s\n' "$tags_normalized" | tr ',' '\n' | while IFS= read -r tag || [ -n "$tag" ]; do
      clean=$(printf '%s' "$tag" | sed 's/^ *//;s/ *$//')
      [ -n "$clean" ] || continue
      printf '%s\n' "$clean"
    done > "$sign_tmp.tags"
    while IFS= read -r tag_line || [ -n "$tag_line" ]; do
      [ -n "$tag_line" ] || continue
      set -- "$@" --tag "t=$tag_line"
    done < "$sign_tmp.tags"

    set +e
    "$@" > "$sign_tmp" 2>/dev/null
    nostril_status=$?
    set -e
    rm -f "$sign_tmp.tags"
    if [ "$nostril_status" -eq 0 ]; then
      event_json=$(cat "$sign_tmp" 2>/dev/null || printf '')
    fi
  fi

  rm -f "$sign_tmp"
  if [ -z "$event_json" ]; then
    return 1
  fi
  event_json=$(printf '%s\n' "$event_json" | jq -c '.' 2>/dev/null || printf '')
  if [ -z "$event_json" ]; then
    return 1
  fi
  if ! blog_nostr_verify_event_json "$event_json"; then
    return 1
  fi
  printf '%s\n' "$event_json"
}

blog_nostr_sign_list_event() {
  # args: list_slug content tags_json
  list_slug=$(blog_list_normalize_slug "${1-}")
  content=${2-}
  tags_json=${3-}

  if [ -z "$list_slug" ] || [ -z "$tags_json" ]; then
    return 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi
  if ! command -v nostril >/dev/null 2>&1; then
    return 1
  fi
  if ! printf '%s\n' "$tags_json" | jq -e 'type=="array"' >/dev/null 2>&1; then
    return 1
  fi

  secret=$(blog_nostr_secret_key 2>/dev/null || printf '')
  if [ -z "$secret" ]; then
    return 1
  fi

  created_at=$(blog_now_epoch)
  set -- nostril --sec "$secret" --kind 30004 --created-at "$created_at" --content "$content" --tag d "$list_slug"

  tags_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-tags.XXXXXX")
  refs_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-a-refs.XXXXXX")
  : > "$refs_tmp"
  printf '%s\n' "$tags_json" | jq -c '.[] | select(type=="array" and length>=1)' > "$tags_tmp"
  while IFS= read -r tag_line || [ -n "$tag_line" ]; do
    [ -n "$tag_line" ] || continue
    key=$(printf '%s\n' "$tag_line" | jq -r '.[0] // ""' 2>/dev/null || printf '')
    [ -n "$key" ] || continue
    if [ "$key" = "d" ]; then
      continue
    fi
    if [ "$key" = "entry" ]; then
      e1=$(printf '%s\n' "$tag_line" | jq -r '.[1] // ""' 2>/dev/null || printf '')
      e2=$(printf '%s\n' "$tag_line" | jq -r '.[2] // ""' 2>/dev/null || printf '')
      e3=$(printf '%s\n' "$tag_line" | jq -r '.[3] // ""' 2>/dev/null || printf '')
      e4=$(printf '%s\n' "$tag_line" | jq -r '.[4] // ""' 2>/dev/null || printf '')
      e5=$(printf '%s\n' "$tag_line" | jq -r '.[5] // ""' 2>/dev/null || printf '')
      e6=$(printf '%s\n' "$tag_line" | jq -r '.[6] // ""' 2>/dev/null || printf '')
      set -- "$@" --tagn 7 "entry" "$e1" "$e2" "$e3" "$e4" "$e5" "$e6"
      if [ -n "$e1" ]; then
        ref_record=$(blog_nostr_post_record_for_event_id "$e1" 2>/dev/null || printf '')
        if [ -n "$ref_record" ]; then
          ref_pubkey=$(printf '%s\n' "$ref_record" | jq -r '.pubkey // ""' 2>/dev/null || printf '')
          ref_d=$(printf '%s\n' "$ref_record" | jq -r '.d // ""' 2>/dev/null || printf '')
          if [ -n "$ref_pubkey" ] && [ -n "$ref_d" ]; then
            printf '30023:%s:%s\n' "$ref_pubkey" "$ref_d" >> "$refs_tmp"
          fi
        fi
      fi
      continue
    fi
    value=$(printf '%s\n' "$tag_line" | jq -r '.[1] // ""' 2>/dev/null || printf '')
    set -- "$@" --tag "$key" "$value"
  done < "$tags_tmp"
  rm -f "$tags_tmp"

  if [ -s "$refs_tmp" ]; then
    refs_sorted_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-a-refs-sorted.XXXXXX")
    sort -u "$refs_tmp" > "$refs_sorted_tmp"
    while IFS= read -r aref || [ -n "$aref" ]; do
      [ -n "$aref" ] || continue
      set -- "$@" --tag a "$aref"
    done < "$refs_sorted_tmp"
    rm -f "$refs_sorted_tmp"
  fi
  rm -f "$refs_tmp"

  sign_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-sign.XXXXXX")
  set +e
  "$@" > "$sign_tmp" 2>/dev/null
  sign_status=$?
  set -e
  if [ "$sign_status" -ne 0 ]; then
    rm -f "$sign_tmp"
    return 1
  fi

  event_json=$(cat "$sign_tmp" 2>/dev/null || printf '')
  rm -f "$sign_tmp"
  event_json=$(printf '%s\n' "$event_json" | jq -c '.' 2>/dev/null || printf '')
  if [ -z "$event_json" ]; then
    return 1
  fi
  if ! blog_nostr_verify_event_json "$event_json"; then
    return 1
  fi
  printf '%s\n' "$event_json"
}

blog_nostr_publish_diagnostic() {
  if ! command -v jq >/dev/null 2>&1; then
    printf 'missing dependency: jq.\n'
    return 0
  fi

  if ! command -v nostril >/dev/null 2>&1; then
    printf 'nostril is not installed. Install nostril from the Nostr install menu.\n'
    return 0
  fi

  if ! blog_nostr_secret_key >/dev/null 2>&1; then
    printf 'Nostr signing key is missing at %s.\n' "$blog_nostr_secret_key_file"
    return 0
  fi

  if ! blog_nostr_verifier_available; then
    printf 'Nostr event verification is unavailable. Install a verifier or a nostril build with verify support.\n'
    return 0
  fi

  printf 'signing or policy checks failed (author allowlist, key validity, or event verification).\n'
}

blog_nostr_clear_projection_posts() {
  if [ ! -d "$blog_posts_dir" ]; then
    return 0
  fi
  find -L "$blog_posts_dir" -type f -name '*.md' 2>/dev/null | while IFS= read -r post_file; do
    marker=$(blog_read_front_matter_value "$post_file" nostr_projection 2>/dev/null || printf '')
    if [ "$marker" = "true" ]; then
      rm -f "$post_file"
    fi
  done
}

blog_nostr_write_projection_posts() {
  posts_index=${1-}
  [ -f "$posts_index" ] || return 0

  blog_nostr_clear_projection_posts
  mkdir -p "$blog_posts_dir"

  jq -c '.[]' "$posts_index" 2>/dev/null | while IFS= read -r row || [ -n "$row" ]; do
    [ -n "$row" ] || continue
    slug=$(printf '%s\n' "$row" | jq -r '.slug // empty' 2>/dev/null || printf '')
    [ -n "$slug" ] || continue
    title=$(printf '%s\n' "$row" | jq -r '.title // "Untitled"' 2>/dev/null || printf 'Untitled')
    summary=$(printf '%s\n' "$row" | jq -r '.summary // ""' 2>/dev/null || printf '')
    published_at=$(printf '%s\n' "$row" | jq -r '.published_at // ""' 2>/dev/null || printf '')
    content=$(printf '%s\n' "$row" | jq -r '.content // ""' 2>/dev/null || printf '')
    pubkey=$(printf '%s\n' "$row" | jq -r '.pubkey // ""' 2>/dev/null || printf '')
    event_id=$(printf '%s\n' "$row" | jq -r '.id // ""' 2>/dev/null || printf '')
    event_kind=$(printf '%s\n' "$row" | jq -r '.kind // 30023' 2>/dev/null || printf '30023')
    d_tag=$(printf '%s\n' "$row" | jq -r '.d // ""' 2>/dev/null || printf '')
    uri=$(printf '%s\n' "$row" | jq -r '.uri // ""' 2>/dev/null || printf '')
    tags_csv=$(printf '%s\n' "$row" | jq -r '.tags // [] | join(", ")' 2>/dev/null || printf '')
    tags_yaml=$(blog_tags_to_yaml_array "$tags_csv")
    content_hash=$(printf '%s' "$content" | blog_sha256)
    author_label=$(printf '%s' "$pubkey" | cut -c1-16)

    out_path="$blog_posts_dir/$slug.md"
    {
      printf '%s\n' '---'
      printf 'title: "%s"\n' "$(blog_yaml_escape "$title")"
      printf 'published_at: "%s"\n' "$published_at"
      printf 'content_hash: "%s"\n' "$content_hash"
      printf 'tags: %s\n' "$tags_yaml"
      printf 'author: "%s"\n' "$(blog_yaml_escape "$author_label")"
      if [ -n "$summary" ]; then
        printf 'summary: "%s"\n' "$(blog_yaml_escape "$summary")"
      fi
      printf 'visibility: "public"\n'
      printf 'license: "CC BY 4.0"\n'
      printf 'nostr_projection: "true"\n'
      printf 'nostr_event_id: "%s"\n' "$(blog_yaml_escape "$event_id")"
      printf 'nostr_pubkey: "%s"\n' "$(blog_yaml_escape "$pubkey")"
      printf 'nostr_kind: "%s"\n' "$(blog_yaml_escape "$event_kind")"
      printf 'nostr_d: "%s"\n' "$(blog_yaml_escape "$d_tag")"
      printf 'nostr_address: "%s"\n' "$(blog_yaml_escape "$event_kind:$pubkey:$d_tag")"
      printf 'nostr_uri: "%s"\n' "$(blog_yaml_escape "$uri")"
      printf '%s\n\n' '---'
      printf '%s\n' "$content"
    } > "$out_path"
    chmod 644 "$out_path" 2>/dev/null || true
  done
}

blog_nostr_rebuild_derived() {
  if ! blog_nostr_bridge_enabled; then
    return 0
  fi
  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  if ! mkdir "$blog_nostr_rebuild_lock_dir" 2>/dev/null; then
    return 0
  fi
  trap 'rm -rf "$blog_nostr_rebuild_lock_dir"' EXIT HUP INT TERM

  nostr_events_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-events.XXXXXX")
  nostr_posts_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-posts.XXXXXX")
  nostr_comments_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-comments.XXXXXX")

  find "$blog_nostr_events_dir" -type f -name '*.json' 2>/dev/null | sort | while IFS= read -r event_file; do
    jq -c '.' "$event_file" 2>/dev/null || true
  done > "$nostr_events_tmp"

  hidden_json=$(blog_nostr_list_file_to_json_array "$blog_nostr_hidden_posts_file")
  blocked_json=$(blog_nostr_list_file_to_json_array "$blog_nostr_blocklist_file")

  jq -s --argjson hidden "$hidden_json" '
    map(select(type=="object" and (.kind|type)=="number" and .kind==30023 and (.id|type)=="string" and (.pubkey|type)=="string" and (.tags|type)=="array" and (.content|type)=="string"))
    | map(. + {
        d: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="d") | .[1]] | first) // ""),
        title_tag: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="title") | .[1]] | first) // ""),
        summary_tag: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="summary") | .[1]] | first) // ""),
        published_tag: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="published_at") | .[1]] | first) // ""),
        tag_list: ([.tags[]? | select(type=="array" and length>=2 and .[0]=="t") | .[1]] | map(select(type=="string")))
      })
    | map(select(.d != ""))
    | map(select(((.d as $d | $hidden | index($d)) == null) and (((.pubkey + ":" + .d) as $pair | $hidden | index($pair)) == null)))
    | sort_by(.pubkey, .kind, .d, (.created_at // 0), .id)
    | group_by(.pubkey, .kind, .d)
    | map(last)
    | sort_by((.created_at // 0), .id)
    | reverse
    | map({
        id: .id,
        pubkey: .pubkey,
        kind: .kind,
        d: .d,
        slug: ((.d | ascii_downcase | gsub("[^a-z0-9]+";"-") | gsub("(^-+|-+$)";"")) as $s | if ($s | length) > 0 then $s else "post" end),
        created_at: (.created_at // 0),
        published_at: (if (.published_tag | length) > 0 then .published_tag else ((.created_at // 0) | todateiso8601) end),
        title: (if (.title_tag | length) > 0 then .title_tag else .d end),
        summary: .summary_tag,
        tags: (.tag_list | unique),
        content: .content,
        address: ((.kind | tostring) + ":" + .pubkey + ":" + .d),
        uri: ("nostr:" + (.kind | tostring) + ":" + .pubkey + ":" + .d),
        md_path: ("posts/" + ((.d | ascii_downcase | gsub("[^a-z0-9]+";"-") | gsub("(^-+|-+$)";"")) as $s | if ($s | length) > 0 then $s else "post" end) + ".md"),
        html_path: ("posts/" + ((.d | ascii_downcase | gsub("[^a-z0-9]+";"-") | gsub("(^-+|-+$)";"")) as $s | if ($s | length) > 0 then $s else "post" end) + ".html")
      })
  ' "$nostr_events_tmp" > "$nostr_posts_tmp"

  addresses_json=$(jq -c '[.[].address]' "$nostr_posts_tmp" 2>/dev/null || printf '[]')
  jq -s --argjson addresses "$addresses_json" --argjson blocked "$blocked_json" '
    map(select(type=="object" and (.kind|type)=="number" and .kind==1 and (.id|type)=="string" and (.pubkey|type)=="string" and (.tags|type)=="array" and (.content|type)=="string"))
    | map(. + {a_refs: ([.tags[]? | select(type=="array" and length>=2 and .[0]=="a") | .[1]] | map(select(type=="string")))})
    | map(select((.pubkey as $pk | $blocked | index($pk)) == null))
    | map(select((.a_refs | map(select(($addresses | index(.)) != null)) | length) > 0))
    | sort_by((.created_at // 0), .id)
    | map({
        id: .id,
        pubkey: .pubkey,
        created_at: (.created_at // 0),
        content: .content,
        a_refs: (.a_refs | unique)
      })
  ' "$nostr_events_tmp" > "$nostr_comments_tmp"

  mv "$nostr_posts_tmp" "$blog_nostr_posts_index"
  mv "$nostr_comments_tmp" "$blog_nostr_comments_index"
  chmod 644 "$blog_nostr_posts_index" "$blog_nostr_comments_index" 2>/dev/null || true

  blog_nostr_write_projection_posts "$blog_nostr_posts_index"

  rm -f "$nostr_events_tmp"
  trap - EXIT HUP INT TERM
  rm -rf "$blog_nostr_rebuild_lock_dir"
}

blog_nostr_post_record_for_slug() {
  slug=${1-}
  [ -n "$slug" ] || return 1
  if [ ! -f "$blog_nostr_posts_index" ]; then
    blog_nostr_rebuild_derived >/dev/null 2>&1 || true
  fi
  jq -c --arg slug "$slug" '.[] | select(.slug == $slug) | . ' "$blog_nostr_posts_index" 2>/dev/null | head -n 1
}

blog_nostr_post_record_for_path() {
  requested_path=${1-}
  slug=$(blog_nostr_extract_path_slug "$requested_path")
  if [ -z "$slug" ]; then
    return 1
  fi
  blog_nostr_post_record_for_slug "$slug"
}

blog_nostr_post_record_for_event_id() {
  event_id=${1-}
  [ -n "$event_id" ] || return 1
  if [ ! -f "$blog_nostr_posts_index" ]; then
    blog_nostr_rebuild_derived >/dev/null 2>&1 || true
  fi
  if [ ! -f "$blog_nostr_posts_index" ]; then
    return 1
  fi
  jq -c --arg id "$event_id" '.[] | select(.id == $id) | . ' "$blog_nostr_posts_index" 2>/dev/null | head -n 1
}

blog_list_normalize_slug() {
  raw=${1-}
  slug=$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g; s/-\{2,\}/-/g; s/^-//; s/-$//')
  if [ -z "$slug" ]; then
    slug="list"
  fi
  printf '%s\n' "$slug"
}

blog_list_draft_path() {
  slug=$(blog_list_normalize_slug "${1-}")
  printf '%s/%s.json\n' "$blog_lists_dir" "$slug"
}

blog_nostr_list_latest_event_json() {
  slug=$(blog_list_normalize_slug "${1-}")
  [ -n "$slug" ] || return 1
  [ -d "$blog_nostr_events_dir" ] || return 1

  tmp=$(mktemp "${TMPDIR:-/tmp}/blog-list-events.XXXXXX")
  find "$blog_nostr_events_dir" -type f -path '*/30004/*.json' 2>/dev/null | while IFS= read -r file; do
    [ -f "$file" ] || continue
    jq -c '.' "$file" 2>/dev/null || true
  done > "$tmp"
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    return 1
  fi

  out=$(jq -c --arg slug "$slug" '
    [ .[]
      | select(type=="object" and (.kind|type)=="number" and .kind==30004 and (.tags|type)=="array")
      | . as $ev
      | (([.tags[]? | select(type=="array" and length>=2 and .[0]=="d") | .[1]] | first) // "") as $d
      | select($d == $slug)
    ]
    | sort_by((.created_at // 0), (.id // ""))
    | last // empty
  ' "$tmp" 2>/dev/null || printf '')
  rm -f "$tmp"
  if [ -z "$out" ] || [ "$out" = "null" ]; then
    return 1
  fi
  printf '%s\n' "$out"
}

blog_nostr_comments_for_address_json() {
  address=${1-}
  [ -n "$address" ] || { printf '[]'; return 0; }
  if [ ! -f "$blog_nostr_comments_index" ]; then
    blog_nostr_rebuild_derived >/dev/null 2>&1 || true
  fi
  jq -c --arg address "$address" '
    [ .[] | select((.a_refs // []) | index($address)) ]
  ' "$blog_nostr_comments_index" 2>/dev/null || printf '[]'
}

blog_nostr_mirror_posts() {
  if ! blog_nostr_bridge_enabled; then
    printf '0\n'
    return 0
  fi
  if ! command -v nak >/dev/null 2>&1; then
    return 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  authors_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-authors.XXXXXX")
  relays_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-relays.XXXXXX")
  blog_nostr_list_file_lines "$blog_nostr_authors_file" > "$authors_tmp"
  blog_nostr_list_file_lines "$blog_nostr_relays_file" > "$relays_tmp"
  if [ ! -s "$authors_tmp" ] || [ ! -s "$relays_tmp" ]; then
    rm -f "$authors_tmp" "$relays_tmp"
    printf '0\n'
    return 0
  fi

  out_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-mirror-posts.XXXXXX")
  set -- nak req -k 30023
  while IFS= read -r author || [ -n "$author" ]; do
    [ -n "$author" ] || continue
    set -- "$@" -a "$author"
  done < "$authors_tmp"
  while IFS= read -r relay || [ -n "$relay" ]; do
    [ -n "$relay" ] || continue
    set -- "$@" "$relay"
  done < "$relays_tmp"

  set +e
  "$@" > "$out_tmp" 2>/dev/null
  _status=$?
  set -e
  if [ "$_status" -ne 0 ] && [ ! -s "$out_tmp" ]; then
    rm -f "$authors_tmp" "$relays_tmp" "$out_tmp"
    return 1
  fi

  mirrored=0
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    event_json=$(printf '%s\n' "$line" | jq -c '.' 2>/dev/null || printf '')
    [ -n "$event_json" ] || continue
    if ! blog_nostr_verify_event_json "$event_json"; then
      continue
    fi
    if blog_nostr_store_event_json "$event_json" >/dev/null 2>&1; then
      mirrored=$((mirrored + 1))
    fi
  done < "$out_tmp"

  rm -f "$authors_tmp" "$relays_tmp" "$out_tmp"
  printf '%s\n' "$mirrored"
}

blog_nostr_mirror_comments_for_address() {
  address=${1-}
  if [ -z "$address" ]; then
    printf '0\n'
    return 0
  fi
  if ! blog_nostr_bridge_enabled; then
    printf '0\n'
    return 0
  fi
  if ! command -v nak >/dev/null 2>&1; then
    return 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  relays_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-relays.XXXXXX")
  blog_nostr_list_file_lines "$blog_nostr_relays_file" > "$relays_tmp"
  if [ ! -s "$relays_tmp" ]; then
    rm -f "$relays_tmp"
    printf '0\n'
    return 0
  fi

  out_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-mirror-comments.XXXXXX")
  set -- nak req -k 1 -t "a=$address"
  while IFS= read -r relay || [ -n "$relay" ]; do
    [ -n "$relay" ] || continue
    set -- "$@" "$relay"
  done < "$relays_tmp"

  set +e
  "$@" > "$out_tmp" 2>/dev/null
  _status=$?
  set -e
  if [ "$_status" -ne 0 ] && [ ! -s "$out_tmp" ]; then
    rm -f "$relays_tmp" "$out_tmp"
    return 1
  fi

  mirrored=0
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    event_json=$(printf '%s\n' "$line" | jq -c '.' 2>/dev/null || printf '')
    [ -n "$event_json" ] || continue
    if ! blog_nostr_verify_event_json "$event_json"; then
      continue
    fi
    if blog_nostr_store_event_json "$event_json" >/dev/null 2>&1; then
      mirrored=$((mirrored + 1))
    fi
  done < "$out_tmp"

  rm -f "$relays_tmp" "$out_tmp"
  printf '%s\n' "$mirrored"
}

blog_nostr_mirror_all() {
  if ! blog_nostr_bridge_enabled; then
    printf '0|0\n'
    return 0
  fi

  if ! mkdir "$blog_nostr_mirror_lock_dir" 2>/dev/null; then
    printf '0|0\n'
    return 0
  fi
  trap 'rm -rf "$blog_nostr_mirror_lock_dir"' EXIT HUP INT TERM

  mirrored_posts=$(blog_nostr_mirror_posts 2>/dev/null || printf '0')
  blog_nostr_rebuild_derived >/dev/null 2>&1 || true

  comments_total=0
  if [ -f "$blog_nostr_posts_index" ]; then
    jq -r '.[].address // empty' "$blog_nostr_posts_index" 2>/dev/null | while IFS= read -r address || [ -n "$address" ]; do
      [ -n "$address" ] || continue
      mirrored=$(blog_nostr_mirror_comments_for_address "$address" 2>/dev/null || printf '0')
      case "$mirrored" in ''|*[!0-9]*) mirrored=0 ;; esac
      printf '%s\n' "$mirrored"
    done > "$blog_nostr_derived_dir/.comments-mirror.tmp"
    if [ -f "$blog_nostr_derived_dir/.comments-mirror.tmp" ]; then
      comments_total=$(awk '{s+=$1} END {print s+0}' "$blog_nostr_derived_dir/.comments-mirror.tmp" 2>/dev/null || printf '0')
      rm -f "$blog_nostr_derived_dir/.comments-mirror.tmp"
    fi
  fi

  blog_nostr_rebuild_derived >/dev/null 2>&1 || true

  trap - EXIT HUP INT TERM
  rm -rf "$blog_nostr_mirror_lock_dir"
  printf '%s|%s\n' "$mirrored_posts" "$comments_total"
}

blog_new_draft_id() {
  blog_random_token 12
}

blog_draft_dir() {
  printf '%s/%s\n' "$blog_drafts_dir" "$1"
}

blog_draft_meta_path() {
  printf '%s/meta.conf\n' "$(blog_draft_dir "$1")"
}

blog_draft_content_path() {
  printf '%s/content.md\n' "$(blog_draft_dir "$1")"
}

blog_draft_resolve_meta_path() {
  draft_id=${1-}
  [ -n "$draft_id" ] || return 1
  direct_meta=$(blog_draft_meta_path "$draft_id")
  if [ -f "$direct_meta" ]; then
    printf '%s\n' "$direct_meta"
    return 0
  fi
  for meta in "$blog_drafts_dir"/*/meta.conf; do
    [ -f "$meta" ] || continue
    saved_id=$(config-get "$meta" draft_id 2>/dev/null || printf '')
    if [ "$saved_id" = "$draft_id" ]; then
      printf '%s\n' "$meta"
      return 0
    fi
  done
  return 1
}

blog_draft_resolve_dir() {
  draft_id=${1-}
  meta=$(blog_draft_resolve_meta_path "$draft_id" 2>/dev/null || printf '')
  [ -n "$meta" ] || return 1
  dirname "$meta"
}

blog_draft_resolve_content_path() {
  draft_id=${1-}
  dir=$(blog_draft_resolve_dir "$draft_id" 2>/dev/null || printf '')
  [ -n "$dir" ] || return 1
  printf '%s/content.md\n' "$dir"
}

blog_draft_exists() {
  [ -n "$(blog_draft_resolve_meta_path "$1" 2>/dev/null || printf '')" ]
}

blog_save_draft() {
  draft_id=$1
  title=$2
  tags=$3
  summary=$4
  content=$5
  author=$6
  publish_mode=$7
  scheduled_at=$8
  status=$9

  dir=$(blog_draft_dir "$draft_id")
  meta=$(blog_draft_meta_path "$draft_id")
  body=$(blog_draft_content_path "$draft_id")
  mkdir -p "$dir"

  created=$(config-get "$meta" created_at 2>/dev/null || printf '')
  if [ -z "$created" ]; then
    created=$(blog_now_iso)
  fi

  normalized_tags=$(blog_normalize_tags "$tags")
  slug=$(blog_slugify "$title")
  now_iso=$(blog_now_iso)

  config-set "$meta" draft_id "$draft_id"
  config-set "$meta" title "$title"
  config-set "$meta" slug "$slug"
  config-set "$meta" tags "$normalized_tags"
  config-set "$meta" summary "$summary"
  config-set "$meta" author "$author"
  config-set "$meta" publish_mode "$publish_mode"
  config-set "$meta" scheduled_at "$scheduled_at"
  config-set "$meta" status "$status"
  config-set "$meta" created_at "$created"
  config-set "$meta" updated_at "$now_iso"

  printf '%s' "$content" > "$body"
}

blog_delete_draft() {
  draft_id=$1
  dir=$(blog_draft_resolve_dir "$draft_id" 2>/dev/null || printf '')
  if [ -z "$dir" ]; then
    dir=$(blog_draft_dir "$draft_id")
  fi
  rm -rf "$dir"
}

blog_find_draft_meta() {
  find "$blog_drafts_dir" -mindepth 2 -maxdepth 2 -type f -name meta.conf 2>/dev/null
}

blog_compute_post_filename() {
  title=$1
  date_prefix=$(date -u +%Y-%m-%d)
  slug=$(blog_slugify "$title")
  base="${date_prefix}-${slug}"
  file="$blog_posts_dir/${base}.md"

  if [ ! -f "$file" ]; then
    printf '%s\n' "${base}.md"
    return 0
  fi

  n=2
  while :; do
    candidate="${base}-${n}.md"
    if [ ! -f "$blog_posts_dir/$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
    n=$((n + 1))
  done
}

blog_publish_content_markdown() {
  # args: title tags summary content author draft_id publish_mode scheduled_at
  title=$1
  tags=$2
  summary=$3
  content=$4
  author=$5
  draft_id=$6
  publish_mode=$7
  scheduled_at=$8

  filename=$(blog_compute_post_filename "$title")
  post_path="$blog_posts_dir/$filename"
  now_iso=$(blog_now_iso)
  normalized_tags=$(blog_normalize_tags "$tags")
  tags_yaml=$(blog_tags_to_yaml_array "$normalized_tags")
  content_hash=$(printf '%s' "$content" | blog_sha256)

  {
    printf '%s\n' '---'
    printf 'title: "%s"\n' "$(blog_yaml_escape "$title")"
    printf 'published_at: "%s"\n' "$now_iso"
    printf 'content_hash: "%s"\n' "$content_hash"
    printf 'tags: %s\n' "$tags_yaml"
    printf 'author: "%s"\n' "$(blog_yaml_escape "$author")"
    if [ -n "$summary" ]; then
      printf 'summary: "%s"\n' "$(blog_yaml_escape "$summary")"
    fi
    printf 'visibility: "public"\n'
    printf 'license: "CC BY 4.0"\n'
    printf 'draft_id: "%s"\n' "$draft_id"
    printf 'publish_mode: "%s"\n' "$publish_mode"
    if [ -n "$scheduled_at" ]; then
      printf 'scheduled_at: "%s"\n' "$scheduled_at"
    fi
    printf '%s\n\n' '---'
    printf '%s\n' "$content"
  } > "$post_path"

  printf '%s\n' "$filename"
}

blog_publish_content_nostr() {
  # args: title tags summary content author draft_id publish_mode scheduled_at
  title=$1
  tags=$2
  summary=$3
  content=$4
  _author=$5
  _draft_id=$6
  _publish_mode=$7
  _scheduled_at=$8

  published_iso=$(blog_now_iso)
  event_json=$(blog_nostr_sign_post_event "$title" "$tags" "$summary" "$content" "$published_iso" 2>/dev/null || printf '')
  if [ -z "$event_json" ]; then
    return 1
  fi

  pubkey=$(printf '%s\n' "$event_json" | jq -r '.pubkey // empty' 2>/dev/null || printf '')
  d_tag=$(printf '%s\n' "$event_json" | jq -r '[.tags[]? | select(type=="array" and length>=2 and .[0]=="d") | .[1]] | first // empty' 2>/dev/null || printf '')
  if [ -z "$pubkey" ] || [ -z "$d_tag" ]; then
    return 1
  fi

  author_count=$(blog_nostr_list_file_lines "$blog_nostr_authors_file" | wc -l | tr -d ' ')
  if [ "${author_count:-0}" -eq 0 ]; then
    blog_nostr_append_author_if_missing "$pubkey" >/dev/null 2>&1 || true
  fi
  if ! blog_nostr_author_allowed "$pubkey"; then
    return 1
  fi

  if ! blog_nostr_store_event_json "$event_json" >/dev/null 2>&1; then
    return 1
  fi
  blog_nostr_rebuild_derived >/dev/null 2>&1 || true

  slug=$(blog_slugify "$d_tag")
  printf '%s.md\n' "$slug"
}

blog_publish_content() {
  # args: title tags summary content author draft_id publish_mode scheduled_at
  if blog_nostr_bridge_enabled; then
    if out=$(blog_publish_content_nostr "$@" 2>/dev/null); then
      BLOG_PUBLISH_LAST_MODE="nostr"
      printf '%s\n' "$out"
      return 0
    fi
    out=$(blog_publish_content_markdown "$@")
    BLOG_PUBLISH_LAST_MODE="local_fallback"
    printf '%s\n' "$out"
    return 0
  fi
  out=$(blog_publish_content_markdown "$@")
  BLOG_PUBLISH_LAST_MODE="local"
  printf '%s\n' "$out"
  return 0
}

blog_run_build_async() {
  if [ -z "${WIZARDRY_DIR-}" ]; then
    return 0
  fi
  if [ ! -x "$WIZARDRY_DIR/spells/web/build" ]; then
    return 0
  fi

  (
    WEB_WIZARDRY_ROOT="$blog_sites_dir" WIZARDRY_DIR="$WIZARDRY_DIR" "$WIZARDRY_DIR/spells/web/build" "$blog_site_name" >/dev/null 2>&1 || true
  ) &
}

blog_scheduler_state() {
  printf '%s/scheduler.conf\n' "$blog_state_dir"
}

blog_scheduler_lock_dir() {
  printf '%s/scheduler.lock\n' "$blog_state_dir"
}

blog_random_int() {
  max=${1:-0}
  case "$max" in
    ''|*[!0-9]*) max=0 ;;
  esac
  if [ "$max" -le 0 ]; then
    printf '0\n'
    return 0
  fi
  if command -v openssl >/dev/null 2>&1; then
    val=$(openssl rand -hex 2 | awk '{print strtonum("0x" $0)}')
  else
    val=$(od -An -N2 -tu2 /dev/urandom | tr -d ' ')
  fi
  printf '%s\n' $(( val % (max + 1) ))
}

blog_format_decimal() {
  value=${1-0}
  trimmed=$(printf '%s' "$value" | sed 's/0*$//;s/\.$//')
  if [ -z "$trimmed" ]; then
    trimmed=0
  fi
  printf '%s\n' "$trimmed"
}

blog_is_positive_decimal() {
  value=${1-}
  awk -v value="$value" 'BEGIN { if (value ~ /^[0-9]+([.][0-9]+)?$/ && value + 0 > 0) exit 0; exit 1 }'
}

blog_drip_interval_hours() {
  interval_hours=$(config-get "$blog_site_conf" drip_interval_hours 2>/dev/null || printf '')
  if ! blog_is_positive_decimal "$interval_hours"; then
    legacy_minutes=$(config-get "$blog_site_conf" drip_interval_minutes 2>/dev/null || printf '240')
    case "$legacy_minutes" in ''|*[!0-9]*) legacy_minutes=240 ;; esac
    if [ "$legacy_minutes" -lt 1 ]; then
      legacy_minutes=1
    fi
    interval_hours=$(awk -v m="$legacy_minutes" 'BEGIN { printf "%.4f", m / 60 }')
  fi
  normalized=$(awk -v h="$interval_hours" 'BEGIN { min_h = 1.0 / 60.0; x = h + 0; if (x < min_h) x = min_h; printf "%.4f", x }')
  blog_format_decimal "$normalized"
}

blog_drip_interval_minutes() {
  interval_hours=$(blog_drip_interval_hours)
  awk -v h="$interval_hours" 'BEGIN { m = int(h * 60 + 0.5); if (m < 1) m = 1; print m }'
}

blog_drip_interval_seconds() {
  interval_minutes=$(blog_drip_interval_minutes)
  printf '%s\n' $((interval_minutes * 60))
}

blog_drip_randomness_minutes() {
  randomness=$(config-get "$blog_site_conf" drip_randomness_minutes 2>/dev/null || printf '')
  if [ -z "$randomness" ]; then
    randomness=$(config-get "$blog_site_conf" drip_jitter_minutes 2>/dev/null || printf '0')
  fi
  case "$randomness" in ''|*[!0-9]*) randomness=0 ;; esac
  if [ "$randomness" -lt 0 ]; then
    randomness=0
  fi
  printf '%s\n' "$randomness"
}

blog_drip_jitter_minutes() {
  blog_drip_randomness_minutes
}

blog_run_scheduler() {
  lock_dir=$(blog_scheduler_lock_dir)
  if ! mkdir "$lock_dir" 2>/dev/null; then
    printf 'locked\n'
    return 0
  fi
  trap 'rm -rf "$lock_dir"' EXIT HUP INT TERM

  now_epoch=$(blog_now_epoch)
  now_iso=$(blog_now_iso)
  state=$(blog_scheduler_state)

  interval_seconds=$(blog_drip_interval_seconds)
  randomness=$(blog_drip_randomness_minutes)

  last_drip=$(config-get "$state" last_drip_epoch 2>/dev/null || printf '0')
  case "$last_drip" in ''|*[!0-9]*) last_drip=0 ;; esac

  scheduled_published=0
  drip_published=0

  # Publish all due scheduled drafts.
  due_file=$(mktemp "${TMPDIR:-/tmp}/blog-due.XXXXXX")
  trap 'rm -f "$due_file"; rm -rf "$lock_dir"' EXIT HUP INT TERM

  blog_find_draft_meta | while IFS= read -r meta; do
    mode=$(config-get "$meta" publish_mode 2>/dev/null || printf 'draft')
    status=$(config-get "$meta" status 2>/dev/null || printf 'draft')
    draft_id=$(config-get "$meta" draft_id 2>/dev/null || printf '')
    if [ "$mode" = "scheduled" ] && [ "$status" = "scheduled" ] && [ -n "$draft_id" ]; then
      at=$(config-get "$meta" scheduled_at 2>/dev/null || printf '')
      at_epoch=$(blog_iso_to_epoch "$at")
      if [ "$at_epoch" -gt 0 ] && [ "$at_epoch" -le "$now_epoch" ]; then
        printf 'scheduled|%s|%s\n' "$at_epoch" "$draft_id"
      fi
    fi
  done | sort -t'|' -k2,2n > "$due_file"

  if [ -s "$due_file" ]; then
    while IFS='|' read -r _ at_epoch draft_id; do
      meta=$(blog_draft_meta_path "$draft_id")
      body=$(blog_draft_content_path "$draft_id")
      [ -f "$meta" ] || continue
      [ -f "$body" ] || continue

      title=$(config-get "$meta" title 2>/dev/null || printf 'Untitled')
      tags=$(config-get "$meta" tags 2>/dev/null || printf '')
      summary=$(config-get "$meta" summary 2>/dev/null || printf '')
      author=$(config-get "$meta" author 2>/dev/null || printf '')
      author=$(blog_author_display_name "$author")
      if [ -z "$author" ]; then
        author='author'
      fi
      content=$(cat "$body" 2>/dev/null || printf '')
      if ! published_file=$(blog_publish_content "$title" "$tags" "$summary" "$content" "$author" "$draft_id" scheduled "$now_iso"); then
        continue
      fi
      if [ -n "$published_file" ]; then
        blog_delete_draft "$draft_id"
        scheduled_published=$((scheduled_published + 1))
      fi
    done < "$due_file"
  fi

  next_drip=$((last_drip + interval_seconds))
  if [ "$last_drip" -eq 0 ]; then
    next_drip=0
  fi

  if [ "$now_epoch" -ge "$next_drip" ]; then
    drip_file=$(mktemp "${TMPDIR:-/tmp}/blog-drip.XXXXXX")
    blog_find_draft_meta | while IFS= read -r meta; do
      mode=$(config-get "$meta" publish_mode 2>/dev/null || printf 'draft')
      status=$(config-get "$meta" status 2>/dev/null || printf 'draft')
      draft_id=$(config-get "$meta" draft_id 2>/dev/null || printf '')
      if [ "$mode" = "drip" ] && [ "$status" = "queued" ] && [ -n "$draft_id" ]; then
        created=$(config-get "$meta" created_at 2>/dev/null || printf '')
        created_epoch=$(blog_iso_to_epoch "$created")
        printf '%s|%s\n' "$created_epoch" "$draft_id"
      fi
    done | sort -t'|' -k1,1n > "$drip_file"

    if [ -s "$drip_file" ]; then
      first=$(head -n 1 "$drip_file")
      draft_id=${first#*|}
      meta=$(blog_draft_meta_path "$draft_id")
      body=$(blog_draft_content_path "$draft_id")
      if [ -f "$meta" ] && [ -f "$body" ]; then
        title=$(config-get "$meta" title 2>/dev/null || printf 'Untitled')
        tags=$(config-get "$meta" tags 2>/dev/null || printf '')
        summary=$(config-get "$meta" summary 2>/dev/null || printf '')
        author=$(config-get "$meta" author 2>/dev/null || printf '')
        author=$(blog_author_display_name "$author")
        if [ -z "$author" ]; then
          author='author'
        fi
        content=$(cat "$body" 2>/dev/null || printf '')
        if ! published_file=$(blog_publish_content "$title" "$tags" "$summary" "$content" "$author" "$draft_id" drip ""); then
          continue
        fi
        if [ -n "$published_file" ]; then
          blog_delete_draft "$draft_id"
          drip_published=1
          randomness_minutes=$(blog_random_int "$randomness")
          config-set "$state" last_drip_epoch "$((now_epoch + randomness_minutes * 60))"
        fi
      fi
    fi

    rm -f "$drip_file"
  fi

  rm -f "$due_file"
  if [ "$scheduled_published" -gt 0 ] || [ "$drip_published" -gt 0 ]; then
    blog_run_build_async
  fi

  trap - EXIT HUP INT TERM
  rm -rf "$lock_dir"
  printf '%s|%s\n' "$scheduled_published" "$drip_published"
}

blog_collect_public_posts() {
  # Writes sorted markdown file paths to output file argument.
  out_file=$1
  candidates_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-post-candidates.XXXXXX")
  temp=$(mktemp "${TMPDIR:-/tmp}/blog-posts.XXXXXX")

  if blog_nostr_bridge_enabled; then
    blog_nostr_rebuild_derived >/dev/null 2>&1 || true
    if [ -f "$blog_nostr_posts_index" ]; then
      jq -r '.[]?.md_path // empty' "$blog_nostr_posts_index" 2>/dev/null | while IFS= read -r rel_md || [ -n "$rel_md" ]; do
        [ -n "$rel_md" ] || continue
        file="$blog_site_root/site/pages/$rel_md"
        if [ -f "$file" ]; then
          printf '%s\n' "$file"
        fi
      done >> "$candidates_tmp"
    fi
  fi

  find -L "$blog_posts_dir" -type f -name '*.md' 2>/dev/null >> "$candidates_tmp"

  sort -u "$candidates_tmp" | while IFS= read -r file; do
    [ -f "$file" ] || continue
    visibility=$(blog_read_front_matter_value "$file" visibility 2>/dev/null || printf '')
    if [ -z "$visibility" ]; then
      visibility="public"
    fi
    if [ "$visibility" != "public" ]; then
      continue
    fi

    published_at=$(blog_read_front_matter_value "$file" published_at 2>/dev/null || printf '')
    if [ -z "$published_at" ]; then
      published_at="1970-01-01T00:00:00Z"
    fi

    printf '%s|%s\n' "$published_at" "$file"
  done | sort -r > "$temp"

  awk -F'|' '{print $2}' "$temp" > "$out_file"
  rm -f "$temp" "$candidates_tmp"
}

blog_base_url() {
  domain=$(config-get "$blog_site_conf" domain 2>/dev/null || printf 'localhost')
  use_https=$(config-get "$blog_site_conf" https 2>/dev/null || printf 'false')
  scheme=http
  if [ "$use_https" = "true" ]; then
    scheme=https
  fi
  printf '%s://%s\n' "$scheme" "$domain"
}

blog_rel_post_html_url() {
  file=$1
  rel=${file#"$blog_posts_dir/"}
  rel_html=${rel%.md}.html
  rel_enc=$(blog_url_encode "$rel_html")
  printf '/cgi/blog-open-post?path=%s\n' "$rel_enc"
}
