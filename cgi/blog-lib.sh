#!/bin/sh
# Shared helpers for blog CGI scripts.

set -eu

blog_sites_dir=${WIZARDRY_SITES_DIR:-$HOME/sites}
blog_site_name=${WIZARDRY_SITE_NAME-}

# Recover the site context from host/path when launcher env is missing.
blog_request_host=${HTTP_HOST:-${SERVER_NAME:-}}
blog_request_host=${blog_request_host%%,*}
blog_request_host=$(printf '%s' "$blog_request_host" | tr '[:upper:]' '[:lower:]')
blog_request_host=${blog_request_host%%:*}
blog_request_host=$(printf '%s' "$blog_request_host" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
case "$blog_request_host" in
  ''|localhost|127.0.0.1|::1|*/*|*\\*|*:*|*[!abcdefghijklmnopqrstuvwxyz0123456789._-]*)
    blog_request_host=''
    ;;
esac
if [ -z "$blog_site_name" ] && [ -n "$blog_request_host" ]; then
  if [ -d "$blog_sites_dir/$blog_request_host" ] || [ -d "$blog_sites_dir/.sitedata/$blog_request_host" ]; then
    blog_site_name=$blog_request_host
  fi
fi
if [ -z "$blog_site_name" ]; then
  blog_script_path=${SCRIPT_FILENAME-}
  if [ -z "$blog_script_path" ]; then
    blog_script_path=${SCRIPT_NAME-}
  fi
  case "$blog_script_path" in
    "$blog_sites_dir"/*/site/cgi/*)
      blog_site_name=${blog_script_path#"$blog_sites_dir"/}
      blog_site_name=${blog_site_name%%/site/cgi/*}
      ;;
  esac
fi
if [ -z "$blog_site_name" ]; then
  blog_site_name=default
fi

blog_site_root="$blog_sites_dir/$blog_site_name"
blog_site_data="$blog_sites_dir/.sitedata/$blog_site_name"
blog_site_root_parent=$blog_site_root
case "$blog_site_root" in
  */releases/*)
    blog_site_root_parent=${blog_site_root%/releases/*}
    ;;
esac
if [ "$blog_site_root_parent" != "$blog_site_root" ] && [ -d "$blog_site_root_parent/.sitedata/site" ]; then
  blog_site_data="$blog_site_root_parent/.sitedata/site"
fi
blog_site_conf="$blog_site_root/site.conf"
blog_content_root="$blog_site_data/content"
blog_posts_dir="$blog_site_root/site/pages/posts"
blog_posts_store_dir="$blog_content_root/posts"
blog_auth_dir="$blog_site_data/ssh-auth"
blog_users_dir="$blog_auth_dir/users"
blog_sessions_dir="$blog_auth_dir/sessions"
blog_nostr_login_requests_dir="$blog_auth_dir/nostr-login-requests"
blog_nostr_delegations_dir="$blog_auth_dir/nostr-delegations"
blog_nostr_rate_limits_dir="$blog_auth_dir/rate-limits"
blog_nostr_delegation_revocations_file="$blog_auth_dir/nostr-delegation-revocations.txt"
blog_state_dir="$blog_site_data"
blog_pages_store_dir="$blog_content_root/pages"
blog_drafts_dir="$blog_content_root/drafts"
blog_lists_dir="$blog_site_data/lists"
blog_files_dir="$blog_site_data/files"
blog_files_meta_dir="$blog_site_data/.files"
blog_file_records_dir="$blog_files_meta_dir/records"
blog_origin_dir="$blog_site_data/origin"
blog_origin_posts_dir="$blog_origin_dir/posts"
blog_origin_state_store_dir="$blog_origin_dir/state"
blog_origin_site_config="$blog_origin_dir/origin.json"
blog_nostr_dir="$blog_site_data/nostr"
blog_nostr_state_dir="$blog_nostr_dir/state"
blog_nostr_events_dir="$blog_nostr_dir/events"
blog_nostr_derived_dir="$blog_nostr_dir/derived"
blog_nostr_authors_file="$blog_nostr_state_dir/authors"
blog_nostr_relays_file="$blog_nostr_state_dir/relays"
blog_nostr_blocklist_file="$blog_nostr_state_dir/blocklist"
blog_nostr_hidden_posts_file="$blog_nostr_state_dir/hidden_posts.txt"
blog_nostr_secret_key_file="$blog_nostr_state_dir/secret.key"
blog_nostr_posts_index="$blog_nostr_derived_dir/posts.json"
blog_nostr_comments_index="$blog_nostr_derived_dir/comments.json"
blog_nostr_rebuild_lock_dir="$blog_nostr_state_dir/rebuild.lock"
blog_nostr_mirror_lock_dir="$blog_nostr_state_dir/mirror.lock"
blog_zaps_default_amount_sats=1000

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

blog_ensure_support_bin_path() {
  if command -v config-get >/dev/null 2>&1 && command -v config-set >/dev/null 2>&1; then
    return 0
  fi

  for candidate_dir in \
    "$blog_sites_dir/app/cgi-bin" \
    "$blog_sites_dir/site/cgi-bin" \
    "$blog_site_root/app/cgi-bin" \
    "$blog_site_root/site/cgi-bin" \
    "$HOME/app/cgi-bin" \
    "$HOME/site/cgi-bin" \
    "$HOME/.wizardry/spells/.imps/fs"
  do
    [ -d "$candidate_dir" ] || continue
    if [ -x "$candidate_dir/config-get" ] || [ -x "$candidate_dir/config-set" ]; then
      PATH="$candidate_dir:$PATH"
      export PATH
      return 0
    fi
  done
}

blog_ensure_support_bin_path

blog_normalize_public_host() {
  raw=${1-}
  raw=$(printf '%s' "$raw" | tr -d '\r\n' | sed -e 's#^[[:space:]]*##' -e 's#[[:space:]]*$##')
  raw=$(printf '%s' "$raw" | sed -e 's#^https\{0,1\}://##' -e 's#/.*$##' -e 's/:[0-9][0-9]*$//')
  printf '%s\n' "$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
}

blog_valid_public_host() {
  candidate=${1-}
  [ -n "$candidate" ] || return 1
  printf '%s' "$candidate" | grep -Eq '^[A-Za-z0-9.-]+$' || return 1
  printf '%s' "$candidate" | grep -q '\.' || return 1
  case "$candidate" in
    localhost|*.local|*..*|.*|*.) return 1 ;;
    [0-9]*.[0-9]*.[0-9]*.[0-9]*) return 1 ;;
  esac
  return 0
}

blog_normalize_btcpay_rootpath() {
  raw=${1-}
  raw=$(printf '%s' "$raw" | tr -d '\r\n' | sed -e 's#^[[:space:]]*##' -e 's#[[:space:]]*$##')
  case "$raw" in
    ''|'/')
      printf '/\n'
      return 0
      ;;
    *://*)
      raw=$(printf '%s' "$raw" | sed -e 's#^[A-Za-z][A-Za-z0-9+.-]*://[^/]*##')
      ;;
  esac
  raw=$(printf '%s' "$raw" | sed -e 's/[?#].*$//')
  case "$raw" in
    '') raw='/' ;;
    /*) ;;
    *) raw="/$raw" ;;
  esac
  raw=$(printf '%s' "$raw" | sed -e 's#//*#/#g' -e 's#/$##')
  [ -n "$raw" ] || raw='/'
  printf '%s\n' "$raw"
}

blog_configured_btcpay_host() {
  configured=$(config-get "$blog_site_conf" btcpay_host 2>/dev/null || printf '')
  configured=$(blog_normalize_public_host "$configured")
  if blog_valid_public_host "$configured"; then
    printf '%s\n' "$configured"
    return 0
  fi
  printf '\n'
}

blog_derived_btcpay_host() {
  source_host=$(blog_normalize_public_host "${HTTP_HOST:-${SERVER_NAME:-}}")
  if ! blog_valid_public_host "$source_host"; then
    source_host=$(blog_normalize_public_host "$(config-get "$blog_site_conf" domain 2>/dev/null || printf '')")
  fi
  if ! blog_valid_public_host "$source_host"; then
    printf '\n'
    return 0
  fi
  printf 'pay.%s\n' "$source_host"
}

blog_resolve_btcpay_host() {
  configured=$(blog_configured_btcpay_host)
  if [ -n "$configured" ]; then
    printf '%s\n' "$configured"
    return 0
  fi
  derived=$(blog_derived_btcpay_host)
  if [ -n "$derived" ] && blog_valid_public_host "$derived"; then
    printf '%s\n' "$derived"
    return 0
  fi
  printf '\n'
}

blog_resolve_btcpay_rootpath() {
  configured=$(config-get "$blog_site_conf" btcpay_rootpath 2>/dev/null || printf '')
  printf '%s\n' "$(blog_normalize_btcpay_rootpath "$configured")"
}

blog_btcpay_url_for_host() {
  host=${1-}
  rootpath=${2-/}
  rootpath=$(blog_normalize_btcpay_rootpath "$rootpath")
  if [ -z "$host" ]; then
    printf '\n'
    return 0
  fi
  if [ "$rootpath" = "/" ]; then
    printf 'https://%s\n' "$host"
    return 0
  fi
  printf 'https://%s%s\n' "$host" "$rootpath"
}

blog_btcpay_url() {
  printf '%s\n' "$(blog_btcpay_url_for_host "$(blog_resolve_btcpay_host)" "$(blog_resolve_btcpay_rootpath)")"
}

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

blog_draft_file_path() {
  printf '%s/%s.md\n' "$blog_drafts_dir" "$1"
}

blog_write_draft_markdown() {
  draft_file=$1
  draft_id=$2
  title=$3
  slug=$4
  tags=$5
  summary=$6
  author=$7
  publish_mode=$8
  scheduled_at=$9
  status=${10}
  created_at=${11}
  updated_at=${12}
  content=${13}
  post_type=${14-longform}
  source_post_path=${15-}
  post_filename=${16-}
  origin_platforms_json=${17-[]}
  post_type=$(blog_normalize_post_type "$post_type")
  tags_yaml=$(blog_tags_to_yaml_array "$tags")
  tmp_file=$(mktemp "${TMPDIR:-/tmp}/blog-draft.XXXXXX")
  {
    printf '%s\n' '---'
    printf 'draft_id: "%s"\n' "$(blog_yaml_escape "$draft_id")"
    printf 'title: "%s"\n' "$(blog_yaml_escape "$title")"
    printf 'slug: "%s"\n' "$(blog_yaml_escape "$slug")"
    printf 'tags: %s\n' "$tags_yaml"
    printf 'post_type: "%s"\n' "$(blog_yaml_escape "$post_type")"
    if [ -n "$source_post_path" ]; then
      printf 'source_post_path: "%s"\n' "$(blog_yaml_escape "$source_post_path")"
    fi
    if [ -n "$post_filename" ]; then
      printf 'post_filename: "%s"\n' "$(blog_yaml_escape "$post_filename")"
    fi
    printf 'origin_platforms: %s\n' "$(printf '%s\n' "$origin_platforms_json" | jq -c '.' 2>/dev/null || printf '[]')"
    printf 'summary: "%s"\n' "$(blog_yaml_escape "$summary")"
    printf 'author: "%s"\n' "$(blog_yaml_escape "$author")"
    printf 'publish_mode: "%s"\n' "$(blog_yaml_escape "$publish_mode")"
    printf 'scheduled_at: "%s"\n' "$(blog_yaml_escape "$scheduled_at")"
    printf 'status: "%s"\n' "$(blog_yaml_escape "$status")"
    printf 'created_at: "%s"\n' "$(blog_yaml_escape "$created_at")"
    printf 'updated_at: "%s"\n' "$(blog_yaml_escape "$updated_at")"
    printf '%s\n\n' '---'
    printf '%s' "$content"
  } > "$tmp_file"
  mv "$tmp_file" "$draft_file"
  chmod 644 "$draft_file" 2>/dev/null || true
}

blog_init() {
  mkdir -p "$blog_auth_dir" "$blog_users_dir" "$blog_sessions_dir" "$blog_nostr_login_requests_dir" "$blog_nostr_delegations_dir" "$blog_nostr_rate_limits_dir" "$blog_state_dir" "$blog_content_root" "$blog_drafts_dir" "$blog_lists_dir" "$blog_files_dir" "$blog_files_meta_dir" "$blog_file_records_dir" "$blog_posts_store_dir" "$blog_pages_store_dir" "$blog_origin_dir" "$blog_origin_posts_dir" "$blog_origin_state_store_dir"
  blog_ensure_posts_mount
  mkdir -p "$blog_nostr_state_dir" "$blog_nostr_events_dir" "$blog_nostr_derived_dir"
  [ -f "$blog_nostr_delegation_revocations_file" ] || : > "$blog_nostr_delegation_revocations_file"
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

blog_trim_whitespace() {
  printf '%s' "${1-}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

blog_slug_seed_text() {
  # args: title content post_type
  title=$(blog_trim_whitespace "${1-}")
  content=${2-}
  post_type=$(blog_normalize_post_type "${3-}")
  if [ -n "$title" ]; then
    printf '%s\n' "$title"
    return 0
  fi
  fallback=$(blog_auto_summary_from_content "$content")
  fallback=$(blog_trim_whitespace "$fallback")
  if [ -n "$fallback" ]; then
    printf '%s\n' "$fallback"
    return 0
  fi
  case "$post_type" in
    shortform) printf 'shortform-post\n' ;;
    *) printf 'post\n' ;;
  esac
}

blog_effective_post_title() {
  # args: title content post_type
  title=$(blog_trim_whitespace "${1-}")
  content=${2-}
  post_type=$(blog_normalize_post_type "${3-}")
  if [ -n "$title" ]; then
    printf '%s\n' "$title"
    return 0
  fi
  fallback=$(blog_auto_summary_from_content "$content")
  fallback=$(blog_trim_whitespace "$fallback")
  if [ -n "$fallback" ]; then
    printf '%s\n' "$fallback"
    return 0
  fi
  case "$post_type" in
    shortform) printf 'Short post\n' ;;
    *) printf 'Untitled\n' ;;
  esac
}

blog_slugify() {
  text=${1-}
  slug=$(printf '%s' "$text" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]/-/g' -e 's/-\{2,\}/-/g' -e 's/^-//' -e 's/-$//')
  if [ -z "$slug" ]; then
    slug="post"
  fi
  printf '%s\n' "$slug"
}

blog_normalize_post_filename() {
  raw=${1-}
  raw=$(printf '%s' "$raw" | sed -e 's#^https\{0,1\}://[^/]*/##' -e 's#^/##' -e 's#^pages/##' -e 's#^posts/##')
  raw=$(printf '%s' "$raw" | sed -e 's#.*/##' -e 's/\.[mM][dD]$//' -e 's/\.[hH][tT][mM][lL]\{0,1\}$//')
  raw=$(printf '%s' "$raw" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
  [ -n "$raw" ] || return 1
  normalized=$(blog_slugify "$raw")
  [ -n "$normalized" ] || return 1
  printf '%s\n' "$normalized"
}

blog_normalize_post_source_path() {
  raw=${1-}
  [ -n "$raw" ] || return 1
  filename=$(blog_normalize_post_filename "$raw" 2>/dev/null || printf '')
  [ -n "$filename" ] || return 1
  printf 'posts/%s.md\n' "$filename"
}

blog_post_rel_path_for_file() {
  file=${1-}
  case "$file" in
    "$blog_site_root/site/pages/"*)
      printf '%s\n' "${file#"$blog_site_root/site/pages/"}"
      ;;
    "$blog_posts_store_dir/"*)
      printf 'posts/%s\n' "${file#"$blog_posts_store_dir/"}"
      ;;
    *)
      if [ -f "$file" ] && [ -d "$blog_posts_store_dir" ]; then
        store_real_dir=$(CDPATH= cd -- "$blog_posts_store_dir" 2>/dev/null && pwd -P || printf '')
        case "$store_real_dir" in
          '')
            ;;
          *)
            case "$file" in
              "$store_real_dir/"*)
                printf 'posts/%s\n' "${file#"$store_real_dir/"}"
                return 0
                ;;
            esac
            ;;
        esac
      fi
      return 1
      ;;
  esac
}

blog_canonical_post_file_path() {
  file=${1-}
  [ -n "$file" ] || return 1
  [ -f "$file" ] || return 1
  case "$file" in
    "$blog_posts_dir"/*|"$blog_posts_store_dir"/*) ;;
    *)
      store_real_dir=$(CDPATH= cd -- "$blog_posts_store_dir" 2>/dev/null && pwd -P || printf '')
      case "$store_real_dir" in
        '') return 1 ;;
        *)
          case "$file" in
            "$store_real_dir"/*) ;;
            *) return 1 ;;
          esac
          ;;
      esac
      ;;
  esac

  dir=$(dirname "$file")
  base=$(basename "$file")
  real_dir=$(CDPATH= cd -- "$dir" 2>/dev/null && pwd -P) || return 1
  printf '%s/%s\n' "$real_dir" "$base"
}

blog_origin_resolve_dir() {
  origin_dir=${ORIGIN_DIR-}
  if [ -n "$origin_dir" ] && [ -x "$origin_dir/bin/origin" ] && [ -f "$origin_dir/origin.json" ]; then
    printf '%s\n' "$origin_dir"
    return 0
  fi

  origin_bin=$(command -v origin 2>/dev/null || printf '')
  if [ -n "$origin_bin" ]; then
    origin_dir=$(CDPATH= cd -- "$(dirname "$origin_bin")/.." 2>/dev/null && pwd -P)
    if [ -n "$origin_dir" ] && [ -x "$origin_dir/bin/origin" ] && [ -f "$origin_dir/origin.json" ]; then
      printf '%s\n' "$origin_dir"
      return 0
    fi
  fi

  if [ -n "${HOME-}" ] && [ -x "$HOME/git/origin/bin/origin" ] && [ -f "$HOME/git/origin/origin.json" ]; then
    printf '%s\n' "$HOME/git/origin"
    return 0
  fi

  return 1
}

blog_origin_available() {
  [ -n "$(blog_origin_resolve_dir 2>/dev/null || printf '')" ]
}

blog_origin_platform_meta_json() {
  origin_dir=$(blog_origin_resolve_dir 2>/dev/null || printf '')
  if [ -z "$origin_dir" ]; then
    printf '[]\n'
    return 0
  fi
  jq -c '[.platforms | to_entries[] | select(.value.enabled != false) | {id: .key, family: (.value.family // "")}]' \
    "$origin_dir/origin.json" 2>/dev/null || printf '[]\n'
}

blog_origin_platforms_json() {
  meta_json=$(blog_origin_platform_meta_json)
  printf '%s\n' "$meta_json" | jq -c '[.[].id]' 2>/dev/null || printf '[]\n'
}

blog_origin_normalize_platforms_json() {
  raw_value=${1-}
  available_json=${2-[]}
  trimmed=$(blog_trim_whitespace "$raw_value")
  if [ -z "$trimmed" ]; then
    printf '[]\n'
    return 0
  fi
  jq -cn --arg raw "$trimmed" --argjson available "$available_json" '
    def parsed:
      ($raw | gsub("^\\s+|\\s+$"; "")) as $trim
      | if $trim == "" then
          []
        elif ($trim | startswith("[")) then
          (try ($trim | fromjson) catch [])
        else
          ($trim | split(","))
        end;
    def cleaned:
      tostring
      | ascii_downcase
      | gsub("[^a-z0-9._-]"; "");
    parsed
    | if type == "array" then . else [] end
    | map(cleaned)
    | map(select(length > 0 and ($available | index(.) != null)))
    | unique
  ' 2>/dev/null || printf '[]\n'
}

blog_origin_enabled_platforms_json() {
  available_json=$(blog_origin_platforms_json)
  if [ "$available_json" = '[]' ]; then
    printf '[]\n'
    return 0
  fi
  raw_value=$(config-get "$blog_site_conf" origin_enabled_platforms 2>/dev/null || printf '__missing__')
  if [ "$raw_value" = '__missing__' ]; then
    printf '%s\n' "$available_json"
    return 0
  fi
  blog_origin_normalize_platforms_json "$raw_value" "$available_json"
}

blog_origin_default_platforms_json() {
  enabled_json=$(blog_origin_enabled_platforms_json)
  if [ "$enabled_json" = '[]' ]; then
    printf '[]\n'
    return 0
  fi
  raw_value=$(config-get "$blog_site_conf" origin_default_platforms 2>/dev/null || printf '__missing__')
  if [ "$raw_value" = '__missing__' ]; then
    printf '%s\n' "$enabled_json"
    return 0
  fi
  blog_origin_normalize_platforms_json "$raw_value" "$enabled_json"
}

blog_origin_platforms_csv_from_json() {
  json_value=${1-[]}
  printf '%s\n' "$json_value" | jq -r 'if type == "array" then join(",") else "" end' 2>/dev/null || printf '\n'
}

blog_origin_public_base_url() {
  configured=$(config-get "$blog_site_conf" origin_public_base_url 2>/dev/null || printf '')
  configured=$(blog_trim_whitespace "$configured" | sed -e 's#/$##')
  case "$configured" in
    http://*|https://*)
      printf '%s\n' "$configured"
      return 0
      ;;
  esac
  blog_base_url | sed -e 's#/$##'
}

blog_origin_post_settings_path() {
  rel_path=$(blog_normalize_post_source_path "${1-}" 2>/dev/null || printf '')
  [ -n "$rel_path" ] || return 1
  slug=$(blog_normalize_post_filename "$rel_path" 2>/dev/null || printf '')
  [ -n "$slug" ] || return 1
  printf '%s/%s.json\n' "$blog_origin_posts_dir" "$slug"
}

blog_origin_post_platforms_json() {
  rel_path=${1-}
  fallback_json=${2-[]}
  settings_path=$(blog_origin_post_settings_path "$rel_path" 2>/dev/null || printf '')
  if [ -z "$settings_path" ] || [ ! -f "$settings_path" ]; then
    printf '%s\n' "$fallback_json"
    return 0
  fi
  stored_json=$(jq -c '.platforms // []' "$settings_path" 2>/dev/null || printf '[]')
  blog_origin_normalize_platforms_json "$stored_json" "$fallback_json"
}

blog_origin_save_post_platforms_json() {
  rel_path=$(blog_normalize_post_source_path "${1-}" 2>/dev/null || printf '')
  platforms_json=${2-[]}
  [ -n "$rel_path" ] || return 1
  settings_path=$(blog_origin_post_settings_path "$rel_path" 2>/dev/null || printf '')
  [ -n "$settings_path" ] || return 1
  mkdir -p "$(dirname "$settings_path")"
  tmp_file=$(mktemp "${TMPDIR:-/tmp}/blog-origin-post-meta.XXXXXX")
  jq -cn --arg source_path "$rel_path" --arg updated_at "$(blog_now_iso)" --argjson platforms "$platforms_json" \
    '{source_path: $source_path, platforms: $platforms, updated_at: $updated_at}' > "$tmp_file"
  mv "$tmp_file" "$settings_path"
  chmod 644 "$settings_path" 2>/dev/null || true
}

blog_origin_move_post_platforms_json() {
  from_rel=$(blog_normalize_post_source_path "${1-}" 2>/dev/null || printf '')
  to_rel=$(blog_normalize_post_source_path "${2-}" 2>/dev/null || printf '')
  [ -n "$from_rel" ] || return 0
  [ -n "$to_rel" ] || return 0
  [ "$from_rel" = "$to_rel" ] && return 0
  from_path=$(blog_origin_post_settings_path "$from_rel" 2>/dev/null || printf '')
  to_path=$(blog_origin_post_settings_path "$to_rel" 2>/dev/null || printf '')
  [ -n "$from_path" ] || return 0
  [ -f "$from_path" ] || return 0
  [ -n "$to_path" ] || return 0
  mkdir -p "$(dirname "$to_path")"
  mv "$from_path" "$to_path"
}

blog_origin_write_site_config() {
  origin_dir=$(blog_origin_resolve_dir 2>/dev/null || printf '')
  [ -n "$origin_dir" ] || return 1
  enabled_json=$(blog_origin_enabled_platforms_json)
  tmp_file=$(mktemp "${TMPDIR:-/tmp}/blog-origin-config.XXXXXX")
  if jq --arg origin_dir "$origin_dir" --arg state_dir "$blog_origin_state_store_dir" --argjson enabled "$enabled_json" '
    def abs_cmd:
      if type == "array" and length > 0 and (.[0] | type) == "string" and (.[0] | startswith("./")) then
        .[0] = ($origin_dir + "/" + (.[0][2:]))
      else
        .
      end;
    .state_dir = $state_dir
    | if (.renderer // null) != null and (.renderer.markdown_to_html // null) != null then
        .renderer.markdown_to_html |= abs_cmd
      else
        .
      end
    | if (.renderer // null) != null and (.renderer.markdown_to_text // null) != null then
        .renderer.markdown_to_text |= abs_cmd
      else
        .
      end
    | .platforms |= with_entries(
        . as $entry
        | .value.enabled = (($enabled | index($entry.key)) != null)
        | .value.project.command |= abs_cmd
        | .value.emit.command |= abs_cmd
        | if (.value.emit.edit_command // null) != null then
            .value.emit.edit_command |= abs_cmd
          else
            .
          end
        | .value.fetch.command |= abs_cmd
        | if (.value.normalize.command // null) != null then
            .value.normalize.command |= abs_cmd
          else
            .
          end
      )
  ' "$origin_dir/origin.json" > "$tmp_file"; then
    mv "$tmp_file" "$blog_origin_site_config"
    chmod 644 "$blog_origin_site_config" 2>/dev/null || true
    return 0
  fi
  rm -f "$tmp_file"
  return 1
}

blog_origin_post_id_for_file() {
  file=${1-}
  [ -f "$file" ] || return 1

  post_id=$(blog_read_front_matter_value "$file" nostr_event_id 2>/dev/null || printf '')
  if [ -z "$post_id" ]; then
    post_id=$(blog_read_front_matter_value "$file" slug 2>/dev/null || printf '')
  fi
  if [ -z "$post_id" ]; then
    title=$(blog_read_front_matter_value "$file" title 2>/dev/null || printf '')
    if [ -n "$title" ]; then
      post_id=$(blog_slugify "$title")
    fi
  fi
  if [ -z "$post_id" ]; then
    heading=$(awk '
      /^#[[:space:]]+/ {
        sub(/^#[[:space:]]+/, "", $0)
        print
        exit
      }
    ' "$file" 2>/dev/null || printf '')
    if [ -n "$heading" ]; then
      post_id=$(blog_slugify "$heading")
    fi
  fi
  if [ -z "$post_id" ]; then
    filename=${file##*/}
    filename=${filename%.md}
    post_id=$(blog_slugify "$filename")
  fi

  [ -n "$post_id" ] || return 1
  printf '%s\n' "$post_id"
}

blog_origin_state_file_for_post() {
  file=${1-}
  platform=${2-}
  [ -n "$platform" ] || return 1
  post_id=$(blog_origin_post_id_for_file "$file" 2>/dev/null || printf '')
  [ -n "$post_id" ] || return 1
  printf '%s/%s/%s.json\n' "$blog_origin_state_store_dir" "$post_id" "$platform"
}

blog_origin_temp_post_file() {
  source_file=${1-}
  platforms_json=${2-[]}
  [ -f "$source_file" ] || return 1

  rel_path=$(blog_post_rel_path_for_file "$source_file" 2>/dev/null || printf '')
  slug=$(blog_normalize_post_filename "$rel_path" 2>/dev/null || printf '')
  if [ -z "$slug" ]; then
    slug=$(blog_origin_post_id_for_file "$source_file" 2>/dev/null || printf '')
  fi
  [ -n "$slug" ] || return 1

  public_base_url=$(blog_origin_public_base_url 2>/dev/null || printf '')
  public_post_url=
  if [ -n "$public_base_url" ]; then
    public_post_url="$public_base_url/posts/$slug"
  fi
  slug_line=$(printf 'slug: "%s"' "$(blog_yaml_escape "$slug")")
  canonical_url_line=$(printf 'canonical_url: "%s"' "$(blog_yaml_escape "$public_post_url")")
  url_line=$(printf 'url: "%s"' "$(blog_yaml_escape "$public_post_url")")
  platforms_line=$(printf 'origin_platforms: %s' "$(printf '%s\n' "$platforms_json" | jq -c '.' 2>/dev/null || printf '[]')")
  tmp_file=$(mktemp "${TMPDIR:-/tmp}/blog-origin-post.XXXXXX")
  first_line=$(sed -n '1p' "$source_file" 2>/dev/null || printf '')

  if [ "$first_line" != '---' ]; then
    {
      printf '%s\n' '---'
      printf '%s\n' "$slug_line"
      if [ -n "$public_post_url" ]; then
        printf '%s\n' "$canonical_url_line"
        printf '%s\n' "$url_line"
      fi
      printf '%s\n' "$platforms_line"
      printf '%s\n' '---'
      cat "$source_file"
    } > "$tmp_file"
    printf '%s\n' "$tmp_file"
    return 0
  fi

  awk -v slug_line="$slug_line" -v platforms_line="$platforms_line" -v canonical_url_line="$canonical_url_line" -v url_line="$url_line" -v public_post_url="$public_post_url" '
    BEGIN {
      in_fm = 0
      wrote_slug = 0
      wrote_canonical_url = 0
      wrote_url = 0
      wrote_platforms = 0
    }
    NR == 1 && $0 == "---" {
      print
      in_fm = 1
      next
    }
    in_fm && $0 == "---" {
      if (!wrote_slug) {
        print slug_line
      }
      if (public_post_url != "" && !wrote_canonical_url) {
        print canonical_url_line
      }
      if (public_post_url != "" && !wrote_url) {
        print url_line
      }
      if (!wrote_platforms) {
        print platforms_line
      }
      print
      in_fm = 0
      next
    }
    in_fm {
      if (index($0, "slug:") == 1) {
        if (!wrote_slug) {
          print slug_line
          wrote_slug = 1
        }
        next
      }
      if (index($0, "canonical_url:") == 1) {
        if (public_post_url != "" && !wrote_canonical_url) {
          print canonical_url_line
          wrote_canonical_url = 1
        }
        next
      }
      if (index($0, "url:") == 1) {
        if (public_post_url != "" && !wrote_url) {
          print url_line
          wrote_url = 1
        }
        next
      }
      if (index($0, "origin_platforms:") == 1) {
        if (!wrote_platforms) {
          print platforms_line
          wrote_platforms = 1
        }
        next
      }
      print
      next
    }
    {
      print
    }
    END {
      if (in_fm) {
        if (!wrote_slug) {
          print slug_line
        }
        if (public_post_url != "" && !wrote_canonical_url) {
          print canonical_url_line
        }
        if (public_post_url != "" && !wrote_url) {
          print url_line
        }
        if (!wrote_platforms) {
          print platforms_line
        }
        print "---"
      }
    }
  ' "$source_file" > "$tmp_file"

  printf '%s\n' "$tmp_file"
}

blog_origin_emit_file_json() {
  source_file=${1-}
  platforms_json=${2-[]}
  [ -f "$source_file" ] || return 1

  platform_count=$(printf '%s\n' "$platforms_json" | jq -r 'if type == "array" then length else 0 end' 2>/dev/null || printf '0')
  if [ "${platform_count:-0}" -lt 1 ]; then
    post_id=$(blog_origin_post_id_for_file "$source_file" 2>/dev/null || printf '')
    jq -cn --arg post_id "$post_id" '{post_id: $post_id, results: []}'
    return 0
  fi

  origin_dir=$(blog_origin_resolve_dir 2>/dev/null || printf '')
  [ -n "$origin_dir" ] || {
    printf '%s\n' 'Origin is not available on this server.' >&2
    return 1
  }
  blog_origin_write_site_config >/dev/null 2>&1 || {
    printf '%s\n' 'Could not prepare Origin site config.' >&2
    return 1
  }

  prepared_file=$(blog_origin_temp_post_file "$source_file" "$platforms_json" 2>/dev/null || printf '')
  [ -n "$prepared_file" ] || {
    printf '%s\n' 'Could not prepare post for Origin.' >&2
    return 1
  }

  output_file=$(mktemp "${TMPDIR:-/tmp}/blog-origin-emit.XXXXXX")
  error_file=$(mktemp "${TMPDIR:-/tmp}/blog-origin-emit.err.XXXXXX")
  set -- "$origin_dir/bin/origin" --config "$blog_origin_site_config" emit
  platforms_csv=$(blog_origin_platforms_csv_from_json "$platforms_json")
  # Rebuild argv with explicit flag/value pairs to preserve boundaries.
  set -- "$origin_dir/bin/origin" --config "$blog_origin_site_config" emit
  printf '%s' "$platforms_csv" | tr ',' '\n' | while IFS= read -r platform || [ -n "$platform" ]; do
    [ -n "$platform" ] || continue
    printf '%s\n' "$platform"
  done > "${output_file}.platforms"
  while IFS= read -r platform || [ -n "$platform" ]; do
    [ -n "$platform" ] || continue
    set -- "$@" --platform "$platform"
  done < "${output_file}.platforms"
  set -- "$@" "$prepared_file"

  if "$@" > "$output_file" 2> "$error_file"; then
    cat "$output_file"
    rm -f "$prepared_file" "$output_file" "$error_file" "${output_file}.platforms"
    return 0
  fi

  cat "$error_file" >&2
  rm -f "$prepared_file" "$output_file" "$error_file" "${output_file}.platforms"
  return 1
}

blog_origin_crossposting_config_json() {
  available=false
  if blog_origin_available; then
    available=true
  fi
  meta_json=$(blog_origin_platform_meta_json)
  enabled_json=$(blog_origin_enabled_platforms_json)
  default_json=$(blog_origin_default_platforms_json)
  public_base_url=$(blog_origin_public_base_url 2>/dev/null || printf '')
  jq -cn \
    --argjson available "$( [ "$available" = "true" ] && printf true || printf false )" \
    --argjson meta "$meta_json" \
    --argjson enabled "$enabled_json" \
    --arg public_base_url "$public_base_url" \
    --argjson defaults "$default_json" '
      {
        available: $available,
        public_base_url: $public_base_url,
        platforms: (
          $meta
          | map(
              . as $platform
              | . + {
                site_enabled: ($enabled | index($platform.id) != null),
                default_selected: ($defaults | index($platform.id) != null)
              }
            )
        ),
        enabled_platforms: $enabled,
        default_platforms: $defaults
      }
    '
}

blog_origin_crossposting_json_for_file() {
  file=${1-}
  [ -f "$file" ] || {
    printf '{"available":false,"platforms":[],"enabled_count":0,"selected_count":0,"published_count":0,"remaining_count":0,"needs_action":false}\n'
    return 0
  }

  available=false
  if blog_origin_available; then
    available=true
  fi
  meta_json=$(blog_origin_platform_meta_json)
  enabled_json=$(blog_origin_enabled_platforms_json)
  rel_path=$(blog_post_rel_path_for_file "$file" 2>/dev/null || printf '')
  selected_json=$(blog_origin_post_platforms_json "$rel_path" "$enabled_json")
  tmp_platforms=$(mktemp "${TMPDIR:-/tmp}/blog-origin-status.XXXXXX")

  printf '%s\n' "$enabled_json" | jq -r '.[]' 2>/dev/null | while IFS= read -r platform || [ -n "$platform" ]; do
    [ -n "$platform" ] || continue
    selected=false
    if printf '%s\n' "$selected_json" | jq -e --arg platform "$platform" 'index($platform) != null' >/dev/null 2>&1; then
      selected=true
    fi

    status=unpublished
    remote_url=
    state_file=$(blog_origin_state_file_for_post "$file" "$platform" 2>/dev/null || printf '')
    if [ -n "$state_file" ] && [ -f "$state_file" ]; then
      saved_status=$(jq -r '.status // empty' "$state_file" 2>/dev/null || printf '')
      remote_url=$(jq -r '.remote_url // empty' "$state_file" 2>/dev/null || printf '')
      case "$saved_status" in
        published|failed|outdated|fetch-failed|mismatch|ok)
          status=$saved_status
          ;;
        skipped)
          if [ "$selected" = "true" ]; then
            status=skipped
          else
            status=not_selected
          fi
          ;;
      esac
    else
      if [ "$selected" != "true" ]; then
        status=not_selected
      fi
    fi

    jq -cn --argjson meta "$meta_json" --arg id "$platform" --arg status "$status" --arg remote_url "$remote_url" --argjson selected "$( [ "$selected" = "true" ] && printf true || printf false )" '
      {
        id: $id,
        family: (($meta | map(select(.id == $id)) | first | .family) // ""),
        selected: $selected,
        status: $status,
        remote_url: $remote_url
      }
    '
  done > "$tmp_platforms"

  platforms_json=$(jq -cs '.' "$tmp_platforms" 2>/dev/null || printf '[]')
  rm -f "$tmp_platforms"

  jq -cn \
    --argjson available "$( [ "$available" = "true" ] && printf true || printf false )" \
    --argjson platforms "$platforms_json" \
    --argjson enabled "$enabled_json" \
    --argjson selected "$selected_json" '
      {
        available: $available,
        platforms: $platforms,
        enabled_platforms: $enabled,
        selected_platforms: $selected,
        enabled_count: ($enabled | length),
        selected_count: ($selected | length),
        published_count: ($platforms | map(select(.status == "published")) | length),
        remaining_count: ($platforms | map(select(.status != "published")) | length),
        needs_action: (($platforms | map(select(.status != "published")) | length) > 0)
      }
    '
}

blog_strip_post_date_prefix_from_slug() {
  slug=${1-}
  printf '%s' "$slug" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-//'
}

blog_canonical_post_slug_from_source() {
  raw=${1-}
  [ -n "$raw" ] || return 1
  slug=$(blog_normalize_post_filename "$raw" 2>/dev/null || printf '')
  [ -n "$slug" ] || return 1
  canonical_slug=$(blog_strip_post_date_prefix_from_slug "$slug")
  if [ -z "$canonical_slug" ]; then
    canonical_slug=$slug
  fi
  printf '%s\n' "$canonical_slug"
}

blog_public_post_slug_from_rel() {
  rel_no_ext=${1-}
  [ -n "$rel_no_ext" ] || return 1
  dir_part=${rel_no_ext%/*}
  base_part=${rel_no_ext##*/}
  canonical_base=$(blog_strip_post_date_prefix_from_slug "$base_part")
  if [ -z "$canonical_base" ]; then
    canonical_base=$base_part
  fi
  if [ "$dir_part" = "$rel_no_ext" ]; then
    printf '%s\n' "$canonical_base"
    return 0
  fi
  printf '%s/%s\n' "$dir_part" "$canonical_base"
}

blog_resolve_post_markdown_file() {
  raw=${1-}
  [ -n "$raw" ] || return 1

  requested=$(printf '%s' "$raw" | sed \
    -e 's#^https\{0,1\}://[^/]*/##' \
    -e 's#^[?].*$##' \
    -e 's#^/##' \
    -e 's#^cgi/blog-open-post/##' \
    -e 's#^pages/posts/##' \
    -e 's#^posts/##')
  case "$requested" in
    *'..'*|*'\\'*|*'//'*)
      return 1
      ;;
  esac

  case "$requested" in
    *.html) rel_md=${requested%.html}.md ;;
    *.md) rel_md=$requested ;;
    *) rel_md="${requested}.md" ;;
  esac

  direct_file="$blog_posts_dir/$rel_md"
  if [ -f "$direct_file" ]; then
    blog_canonical_post_file_path "$direct_file" 2>/dev/null || printf '%s\n' "$direct_file"
    return 0
  fi

  rel_no_ext=${rel_md%.md}
  rel_dir=${rel_no_ext%/*}
  rel_base=${rel_no_ext##*/}
  canonical_base=$(blog_strip_post_date_prefix_from_slug "$rel_base")
  if [ -z "$canonical_base" ]; then
    canonical_base=$rel_base
  fi
  if [ "$rel_dir" = "$rel_no_ext" ]; then
    canonical_rel="$canonical_base"
    search_dir="$blog_posts_dir"
  else
    canonical_rel="$rel_dir/$canonical_base"
    search_dir="$blog_posts_dir/$rel_dir"
  fi

  canonical_file="$blog_posts_dir/${canonical_rel}.md"
  if [ -f "$canonical_file" ]; then
    blog_canonical_post_file_path "$canonical_file" 2>/dev/null || printf '%s\n' "$canonical_file"
    return 0
  fi

  [ -d "$search_dir" ] || return 1
  dated_match=$(find -L "$search_dir" -maxdepth 1 -type f -name "????-??-??-${canonical_base}.md" 2>/dev/null | sort -r | head -n 1)
  if [ -n "$dated_match" ] && [ -f "$dated_match" ]; then
    blog_canonical_post_file_path "$dated_match" 2>/dev/null || printf '%s\n' "$dated_match"
    return 0
  fi

  return 1
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

blog_b64_decode_text() {
  b64=${1-}
  if [ -z "$b64" ]; then
    return 1
  fi

  if command -v base64 >/dev/null 2>&1; then
    if printf '%s' "$b64" | base64 --decode 2>/dev/null; then
      return 0
    fi
    if printf '%s' "$b64" | base64 -d 2>/dev/null; then
      return 0
    fi
    if printf '%s' "$b64" | base64 -D 2>/dev/null; then
      return 0
    fi
  fi

  if command -v openssl >/dev/null 2>&1; then
    printf '%s' "$b64" | openssl base64 -d -A 2>/dev/null
    return $?
  fi

  return 1
}

blog_basename_safe() {
  raw_name=${1-}
  safe_name=${raw_name##*/}
  safe_name=$(printf '%s' "$safe_name" | tr '\r\n\t' '   ')
  safe_name=$(printf '%s' "$safe_name" | sed 's#/#-#g; s/:/-/g; s/[[:cntrl:]]/-/g; s/^ *//; s/ *$//')
  case "$safe_name" in
    ''|.|..) safe_name=file ;;
  esac
  if [ -z "$safe_name" ]; then
    safe_name=file
  fi
  printf '%s\n' "$safe_name"
}

blog_file_storage_path() {
  storage_rel=${1-}
  [ -n "$storage_rel" ] || return 1
  printf '%s/%s\n' "$blog_files_dir" "$storage_rel"
}

blog_file_storage_name_available() {
  storage_name=${1-}
  [ -n "$storage_name" ] || return 1
  [ ! -e "$blog_files_dir/$storage_name" ]
}

blog_file_unique_storage_name() {
  desired_name=$(blog_basename_safe "${1-}")
  [ -n "$desired_name" ] || desired_name=file
  if blog_file_storage_name_available "$desired_name"; then
    printf '%s\n' "$desired_name"
    return 0
  fi
  base=$desired_name
  ext=
  case "$desired_name" in
    *.*)
      base=${desired_name%.*}
      ext=.${desired_name##*.}
      ;;
  esac
  n=2
  while :; do
    candidate="${base}-${n}${ext}"
    if blog_file_storage_name_available "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
    n=$((n + 1))
  done
}

blog_file_record_path() {
  file_id=${1-}
  [ -n "$file_id" ] || return 1
  printf '%s/%s.conf\n' "$blog_file_records_dir" "$file_id"
}

blog_file_now_epoch() {
  date -u +%s 2>/dev/null || printf '0\n'
}

blog_file_size_bytes() {
  file_path=${1-}
  [ -f "$file_path" ] || return 1
  wc -c < "$file_path" | tr -d '[:space:]'
}

blog_file_content_type() {
  file_path=${1-}
  fallback=${2-application/octet-stream}
  if command -v file >/dev/null 2>&1 && [ -f "$file_path" ]; then
    detected=$(file -b --mime-type "$file_path" 2>/dev/null || printf '')
    if [ -n "$detected" ]; then
      printf '%s\n' "$detected"
      return 0
    fi
  fi
  printf '%s\n' "$fallback"
}

blog_file_public_url() {
  file_id=${1-}
  safe_name=${2-}
  [ -n "$file_id" ] || return 1
  safe_id=$(printf '%s' "$file_id" | sed 's/[^A-Za-z0-9._~-]/-/g')
  safe_part=$(printf '%s' "$safe_name" | sed 's/[^A-Za-z0-9._~-]/-/g')
  printf '/files/%s' "$safe_id"
  if [ -n "$safe_part" ]; then
    printf '/%s' "$safe_part"
  fi
  printf '\n'
}

blog_file_public_url_encoded() {
  file_id=${1-}
  safe_name=${2-}
  [ -n "$file_id" ] || return 1
  blog_file_public_url "$file_id" "$safe_name"
}

blog_file_record_exists() {
  record_path=$(blog_file_record_path "${1-}" 2>/dev/null || printf '')
  [ -n "$record_path" ] && [ -f "$record_path" ]
}

blog_file_is_public_effective() {
  file_id=${1-}
  record_path=$(blog_file_record_path "$file_id" 2>/dev/null || printf '')
  [ -f "$record_path" ] || return 1
  explicit_public=$(config-get "$record_path" explicit_public 2>/dev/null || printf 'false')
  case "$explicit_public" in
    true|1|yes|on) return 0 ;;
  esac
  post_path=$(config-get "$record_path" post_path 2>/dev/null || printf '')
  if [ -n "$post_path" ] && [ -f "$blog_site_root/site/pages/$post_path" ]; then
    return 0
  fi
  return 1
}

blog_file_write_record() {
  file_id=${1-}
  storage_rel=${2-}
  original_name=${3-}
  safe_name=${4-}
  mime_type=${5-}
  size_bytes=${6-0}
  created_at=${7-}
  draft_id=${8-}
  post_path=${9-}
  explicit_public=${10-false}
  record_path=$(blog_file_record_path "$file_id")
  [ -n "$created_at" ] || created_at=$(blog_now_iso)
  updated_at=$(blog_now_iso)
  config-set "$record_path" file_id "$file_id"
  config-set "$record_path" storage_rel "$storage_rel"
  config-set "$record_path" original_name "$original_name"
  config-set "$record_path" safe_name "$safe_name"
  config-set "$record_path" mime_type "$mime_type"
  config-set "$record_path" size_bytes "$size_bytes"
  config-set "$record_path" created_at "$created_at"
  config-set "$record_path" updated_at "$updated_at"
  config-set "$record_path" draft_id "$draft_id"
  config-set "$record_path" post_path "$post_path"
  config-set "$record_path" explicit_public "$explicit_public"
}

blog_file_find_record_by_storage_rel() {
  storage_rel=${1-}
  [ -n "$storage_rel" ] || return 1
  for record_path in "$blog_file_records_dir"/*.conf; do
    [ -f "$record_path" ] || continue
    current_storage_rel=$(config-get "$record_path" storage_rel 2>/dev/null || printf '')
    if [ "$current_storage_rel" = "$storage_rel" ]; then
      printf '%s\n' "$record_path"
      return 0
    fi
  done
  return 1
}

blog_file_index_untracked() {
  [ -d "$blog_files_dir" ] || return 0
  find "$blog_files_dir" -mindepth 1 -maxdepth 1 -type f 2>/dev/null | while IFS= read -r file_path; do
    [ -f "$file_path" ] || continue
    original_name=${file_path##*/}
    case "$original_name" in
      .DS_Store|.stfolder|.stignore) continue ;;
    esac
    if blog_file_find_record_by_storage_rel "$original_name" >/dev/null 2>&1; then
      continue
    fi
    file_id=$(blog_random_token 18)
    mime_type=$(blog_file_content_type "$file_path" application/octet-stream)
    size_bytes=$(blog_file_size_bytes "$file_path" 2>/dev/null || printf '0')
    blog_file_write_record "$file_id" "$original_name" "$original_name" "$original_name" "$mime_type" "$size_bytes" "$(blog_now_iso)" "" "" false
    chmod 600 "$file_path" 2>/dev/null || true
  done
}

blog_file_create_upload() {
  original_name=${1-}
  mime_type=${2-}
  data_b64=${3-}
  draft_id=${4-}
  [ -n "$original_name" ] || return 1
  [ -n "$data_b64" ] || return 1

  safe_name=$(blog_file_unique_storage_name "$original_name")
  file_id=$(blog_random_token 18)
  dest=$(blog_file_storage_path "$safe_name")
  if ! blog_b64_to_file "$data_b64" "$dest"; then
    rm -f "$dest"
    return 1
  fi
  chmod 600 "$dest" 2>/dev/null || true
  size_bytes=$(blog_file_size_bytes "$dest" 2>/dev/null || printf '0')
  if [ -z "$mime_type" ]; then
    mime_type=$(blog_file_content_type "$dest" application/octet-stream)
  fi
  blog_file_write_record "$file_id" "$safe_name" "$original_name" "$safe_name" "$mime_type" "$size_bytes" "$(blog_now_iso)" "$draft_id" "" false
  printf '%s\t%s\t%s\n' "$file_id" "$safe_name" "$(blog_file_public_url_encoded "$file_id" "$safe_name")"
}

blog_file_ids_from_text() {
  content=${1-}
  if [ -z "$content" ]; then
    return 0
  fi
  printf '%s\n' "$content" | tr '&' '\n' | sed -n 's/.*file_id=\([A-Za-z0-9._~-][A-Za-z0-9._~-]*\).*/\1/p' | awk '!seen[$0]++'
}

blog_file_sync_draft_refs() {
  draft_id=${1-}
  content=${2-}
  [ -n "$draft_id" ] || return 0
  for record_path in "$blog_file_records_dir"/*.conf; do
    [ -f "$record_path" ] || continue
    current_draft_id=$(config-get "$record_path" draft_id 2>/dev/null || printf '')
    if [ "$current_draft_id" = "$draft_id" ]; then
      config-set "$record_path" draft_id ""
      config-set "$record_path" updated_at "$(blog_now_iso)"
    fi
  done
  blog_file_ids_from_text "$content" | while IFS= read -r file_id || [ -n "$file_id" ]; do
    [ -n "$file_id" ] || continue
    record_path=$(blog_file_record_path "$file_id" 2>/dev/null || printf '')
    [ -f "$record_path" ] || continue
    config-set "$record_path" draft_id "$draft_id"
    config-set "$record_path" updated_at "$(blog_now_iso)"
  done
}

blog_file_clear_draft_refs() {
  draft_id=${1-}
  [ -n "$draft_id" ] || return 0
  for record_path in "$blog_file_records_dir"/*.conf; do
    [ -f "$record_path" ] || continue
    current_draft_id=$(config-get "$record_path" draft_id 2>/dev/null || printf '')
    if [ "$current_draft_id" = "$draft_id" ]; then
      config-set "$record_path" draft_id ""
      config-set "$record_path" updated_at "$(blog_now_iso)"
    fi
  done
}

blog_file_promote_refs_to_post() {
  draft_id=${1-}
  content=${2-}
  post_path=${3-}
  [ -n "$post_path" ] || return 0
  blog_file_ids_from_text "$content" | while IFS= read -r file_id || [ -n "$file_id" ]; do
    [ -n "$file_id" ] || continue
    record_path=$(blog_file_record_path "$file_id" 2>/dev/null || printf '')
    [ -f "$record_path" ] || continue
    config-set "$record_path" post_path "$post_path"
    if [ -n "$draft_id" ]; then
      config-set "$record_path" draft_id ""
    fi
    config-set "$record_path" updated_at "$(blog_now_iso)"
  done
}

blog_file_resolve_disk_path() {
  file_id=${1-}
  record_path=$(blog_file_record_path "$file_id" 2>/dev/null || printf '')
  [ -f "$record_path" ] || return 1
  storage_rel=$(config-get "$record_path" storage_rel 2>/dev/null || printf '')
  [ -n "$storage_rel" ] || return 1
  blog_file_storage_path "$storage_rel"
}

blog_file_delete() {
  file_id=${1-}
  [ -n "$file_id" ] || return 1
  record_path=$(blog_file_record_path "$file_id" 2>/dev/null || printf '')
  [ -f "$record_path" ] || return 1
  storage_rel=$(config-get "$record_path" storage_rel 2>/dev/null || printf '')
  if [ -n "$storage_rel" ]; then
    disk_path=$(blog_file_storage_path "$storage_rel" 2>/dev/null || printf '')
    if [ -n "$disk_path" ] && [ -f "$disk_path" ]; then
      rm -f "$disk_path"
    fi
  fi
  rm -f "$record_path"
}

blog_to_base64url() {
  printf '%s' "${1-}" | tr '+/' '-_' | tr -d '='
}

blog_from_base64url() {
  in=${1-}
  raw=$(printf '%s' "$in" | tr '_-' '/+')
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

  if [ "$cl" -le 0 ]; then
    return 0
  fi

  BLOG_REQUEST_BODY=$(dd bs="$cl" count=1 2>/dev/null || true)
}

blog_param_decode_component() {
  value=${1-}
  value=$(printf '%s' "$value" | tr '+' ' ')
  case "$value" in
    *%*) ;;
    *)
      printf '%s' "$value"
      return 0
      ;;
  esac
  if command -v url-decode >/dev/null 2>&1; then
    url-decode "$value"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$value" | python3 -c 'import sys, urllib.parse; sys.stdout.write(urllib.parse.unquote(sys.stdin.read(), encoding="utf-8", errors="replace"))'
    return 0
  fi
  printf '%s' "$value" | awk '
    function hexval(ch) {
      ch = toupper(ch)
      return index("0123456789ABCDEF", ch) - 1
    }
    {
      out = ""
      i = 1
      while (i <= length($0)) {
        ch = substr($0, i, 1)
        if (ch == "%" && i + 2 <= length($0)) {
          hi = substr($0, i + 1, 1)
          lo = substr($0, i + 2, 1)
          if (hexval(hi) >= 0 && hexval(lo) >= 0) {
            out = out sprintf("%c", (hexval(hi) * 16) + hexval(lo))
            i += 3
            continue
          }
        }
        out = out ch
        i += 1
      }
      printf "%s", out
    }
  '
}

blog_param_lookup() {
  key=${1-}
  source=${2-}
  [ -n "$key" ] || return 1
  [ -n "$source" ] || return 1
  encoded=$(printf '%s' "$source" | awk -v key="$key" '
    BEGIN { RS = "&" }
    index($0, key "=") == 1 {
      print substr($0, length(key) + 2)
      exit
    }
  ')
  [ -n "$encoded" ] || return 1
  blog_param_decode_component "$encoded"
  printf '\n'
}

blog_param() {
  key=${1-}
  val=$(blog_param_lookup "$key" "${QUERY_STRING-}" 2>/dev/null || printf '')
  if [ -n "${BLOG_REQUEST_BODY-}" ]; then
    case "${CONTENT_TYPE-}" in
      application/json|application/json\;*|text/plain|text/plain\;*)
        body_is_json=true
        ;;
      *)
        case "$BLOG_REQUEST_BODY" in
          \{*) body_is_json=true ;;
          *) body_is_json=false ;;
        esac
        ;;
    esac
    if [ "$body_is_json" = "true" ]; then
        body_val=$(printf '%s\n' "$BLOG_REQUEST_BODY" | jq -r --arg key "$key" '
          if type == "object" and has($key) and .[$key] != null then
            .[$key] | if type == "string" then . else tojson end
          else
            empty
          end
        ' 2>/dev/null || printf '')
    else
        body_val=$(blog_param_lookup "$key" "$BLOG_REQUEST_BODY" 2>/dev/null || printf '')
    fi
    if [ -n "$body_val" ]; then
      val=$body_val
    fi
  fi
  printf '%s\n' "$val"
}

blog_send_json_headers() {
  http-status 200 "OK"
  http-header "Content-Type" "application/json; charset=utf-8"
  http-header "Cache-Control" "no-store, no-cache, must-revalidate, max-age=0"
  http-header "Pragma" "no-cache"
  http-header "Expires" "0"
  blog_send_security_headers
  http-end-headers
}

blog_send_html_headers() {
  http-ok-html
}

blog_send_security_headers() {
  secure=false
  case "${HTTPS-}" in
    on|ON|1|true|TRUE|yes|YES) secure=true ;;
  esac
  case "${REQUEST_SCHEME-}" in
    https|HTTPS) secure=true ;;
  esac
  case "${SERVER_PORT-}" in
    443) secure=true ;;
  esac
  if [ "$secure" = "true" ]; then
    http-header "Strict-Transport-Security" "max-age=31536000; includeSubDomains; preload"
  fi
}

blog_json_error() {
  msg=${1-Unknown error}
  code=${2-false}
  esc=$(blog_json_escape "$msg")
  printf '{"success":false,"error":"%s","code":"%s"}\n' "$esc" "$code"
}

blog_plugin_supported() {
  key=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]')
  case "$key" in
    nostr_support|nostr_login|nostr_bridge|nostr_posts|zaps|btcpay|video_chat|overworld) return 0 ;;
    *) return 1 ;;
  esac
}

blog_plugin_default_enabled() {
  key=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]')
  case "$key" in
    video_chat|overworld) printf 'false\n' ;;
    nostr_support|nostr_login|nostr_bridge|nostr_posts|zaps|btcpay) printf 'true\n' ;;
    *) printf 'false\n' ;;
  esac
}

blog_plugin_raw_enabled() {
  key=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]')
  if ! blog_plugin_supported "$key"; then
    printf 'false\n'
    return 0
  fi
  cfg_key="plugin_$key"
  value=$(config-get "$blog_site_conf" "$cfg_key" 2>/dev/null || printf '')
  if [ -z "$value" ]; then
    blog_plugin_default_enabled "$key"
    return 0
  fi
  case "$value" in
    true|1|yes|on) printf 'true\n' ;;
    false|0|no|off) printf 'false\n' ;;
    *) blog_plugin_default_enabled "$key" ;;
  esac
}

blog_plugin_enabled() {
  key=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]')
  if ! blog_plugin_supported "$key"; then
    return 1
  fi
  enabled=$(blog_plugin_raw_enabled "$key")
  if [ "$enabled" != "true" ]; then
    return 1
  fi
  case "$key" in
    nostr_login|nostr_bridge|nostr_posts|zaps)
      support_enabled=$(blog_plugin_raw_enabled "nostr_support")
      [ "$support_enabled" = "true" ] || return 1
      ;;
  esac
  return 0
}

blog_plugin_enabled_json() {
  key=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]')
  if blog_plugin_enabled "$key"; then
    printf 'true\n'
  else
    printf 'false\n'
  fi
}

blog_plugins_json() {
  nostr_support=$(blog_plugin_enabled_json "nostr_support")
  nostr_login=$(blog_plugin_enabled_json "nostr_login")
  nostr_bridge=$(blog_plugin_enabled_json "nostr_bridge")
  nostr_posts=$(blog_plugin_enabled_json "nostr_posts")
  zaps=$(blog_plugin_enabled_json "zaps")
  btcpay=$(blog_plugin_enabled_json "btcpay")
  video_chat=$(blog_plugin_enabled_json "video_chat")
  overworld=$(blog_plugin_enabled_json "overworld")
  printf '{'
  printf '"nostr_support":%s,' "$nostr_support"
  printf '"nostr_login":%s,' "$nostr_login"
  printf '"nostr_bridge":%s,' "$nostr_bridge"
  printf '"nostr_posts":%s,' "$nostr_posts"
  printf '"zaps":%s,' "$zaps"
  printf '"btcpay":%s,' "$btcpay"
  printf '"video_chat":%s,' "$video_chat"
  printf '"overworld":%s' "$overworld"
  printf '}\n'
}

blog_zaps_enabled() {
  if ! blog_plugin_enabled "zaps"; then
    printf 'false\n'
    return 0
  fi
  enabled=$(config-get "$blog_site_conf" zaps_enabled 2>/dev/null || printf 'false')
  case "$enabled" in
    true|false) printf '%s\n' "$enabled" ;;
    *) printf 'false\n' ;;
  esac
}

blog_zap_lud16() {
  lud16=$(config-get "$blog_site_conf" zap_lud16 2>/dev/null || printf '')
  lud16=$(printf '%s' "$lud16" | tr -d '\r\n[:space:]')
  printf '%s\n' "$lud16"
}

blog_zap_demo_lud16() {
  site_npub=$(blog_nostr_site_npub 2>/dev/null || printf '')
  [ -n "$site_npub" ] || return 1
  printf '%s@npub.cash\n' "$site_npub"
}

blog_zap_effective_lud16() {
  lud16=$(blog_zap_lud16 2>/dev/null || printf '')
  if [ -n "$lud16" ]; then
    printf '%s\n' "$(printf '%s' "$lud16" | tr '[:upper:]' '[:lower:]')"
    return 0
  fi
  fallback=$(blog_zap_demo_lud16 2>/dev/null || printf '')
  if [ -n "$fallback" ]; then
    printf '%s\n' "$fallback"
    return 0
  fi
  printf '\n'
}

blog_zap_lud16_source() {
  lud16=$(blog_zap_lud16 2>/dev/null || printf '')
  if [ -n "$lud16" ]; then
    printf 'configured\n'
    return 0
  fi
  fallback=$(blog_zap_demo_lud16 2>/dev/null || printf '')
  if [ -n "$fallback" ]; then
    printf 'demo\n'
    return 0
  fi
  printf 'unavailable\n'
}

blog_zap_default_amount_sats() {
  sats=$(config-get "$blog_site_conf" zap_default_amount_sats 2>/dev/null || printf "$blog_zaps_default_amount_sats")
  case "$sats" in
    ''|*[!0-9]*) sats=$blog_zaps_default_amount_sats ;;
  esac
  if [ "$sats" -lt 1 ]; then
    sats=1
  fi
  printf '%s\n' "$sats"
}

blog_zaps_config_json() {
  enabled=$(blog_zaps_enabled)
  lud16=$(blog_zap_effective_lud16)
  lud16_source=$(blog_zap_lud16_source)
  amount_sats=$(blog_zap_default_amount_sats)
  relays_json=$(blog_nostr_list_file_to_json_array "$blog_nostr_relays_file")
  site_npub=$(blog_nostr_site_npub 2>/dev/null || printf '')
  if [ -n "$site_npub" ]; then
    demo_wallet_available=true
  else
    demo_wallet_available=false
  fi

  if [ -z "$lud16" ]; then
    enabled=false
  fi

  printf '{'
  printf '"enabled":%s,' "$enabled"
  printf '"lud16":"%s",' "$(blog_json_escape "$lud16")"
  printf '"lud16_source":"%s",' "$(blog_json_escape "$lud16_source")"
  printf '"default_amount_sats":%s,' "$amount_sats"
  printf '"demo_wallet_available":%s,' "$demo_wallet_available"
  if [ -n "$site_npub" ]; then
    printf '"demo_wallet_npub":"%s",' "$(blog_json_escape "$site_npub")"
  fi
  printf '"relays":%s' "$relays_json"
  printf '}\n'
}

blog_nostr_bridge_enabled() {
  if ! blog_plugin_enabled "nostr_bridge"; then
    return 1
  fi
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
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    printf '[]'
    return 0
  fi
  awk '
    BEGIN {
      first = 1
      printf "["
    }
    {
      line = $0
      sub(/#.*/, "", line)
      sub(/[[:space:]]+$/, "", line)
      sub(/^[[:space:]]+/, "", line)
      if (line == "") {
        next
      }
      gsub(/\\/, "\\\\", line)
      gsub(/"/, "\\\"", line)
      if (first == 0) {
        printf ","
      }
      printf "\"%s\"", line
      first = 0
    }
    END {
      printf "]"
    }
  ' "$file"
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
    rel=$(blog_post_rel_path_for_file "$file" 2>/dev/null || printf '')
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
    ''|.|..|-*|.*|*[!a-zA-Z0-9._-]*) return 1 ;;
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
  max_words=48
  summary=$(printf '%s\n' "$plain" | awk -v n="$max_words" '{ for (i=1; i<=NF && i<=n; i++) { printf "%s%s", $i, (i<n && i<NF ? " " : "") } }')
  if [ -n "$summary" ] && [ "$(printf '%s\n' "$plain" | wc -w | tr -d ' ')" -gt "$max_words" ]; then
    summary="$summary..."
  fi
  printf '%s\n' "$summary"
}

blog_condensed_preview_plain_text() {
  content=${1-}
  if [ -z "$content" ]; then
    printf '%s\n' ''
    return 0
  fi
  printf '%s\n' "$content" \
    | sed -E 's/```[^`]*```/ /g; s/`([^`]*)`/\1/g; s/!\[[^]]*\]\([^)]*\)/ /g; s/\[([^]]*)\]\([^)]*\)/\1/g; s/^[[:space:]]{0,3}[#>*-]+[[:space:]]*//g; s/[*_~]+//g' \
    | awk '
      { lines[NR] = $0; if ($0 !~ /^[[:space:]]*$/) last = NR }
      END {
        first = 1
        while (first <= last && lines[first] ~ /^[[:space:]]*$/) {
          first++
        }
        for (i = first; i <= last; i++) {
          print lines[i]
        }
      }'
}

blog_condensed_preview_from_content() {
  content=${1-}
  if [ -z "$content" ]; then
    printf '%s\n' ''
    return 0
  fi
  blog_condensed_preview_plain_text "$content" | awk -v max_words=48 '
    BEGIN { words = 0; truncated = 0; printed = 0 }
    {
      line = $0
      out = ""
      while (match(line, /[^[:space:]]+/)) {
        prefix = substr(line, 1, RSTART - 1)
        word = substr(line, RSTART, RLENGTH)
        rest = substr(line, RSTART + RLENGTH)
        if (words >= max_words) {
          truncated = 1
          break
        }
        out = out prefix word
        words++
        line = rest
      }
      if (!truncated) {
        out = out line
      }
      if (printed) {
        printf "\n"
      }
      printf "%s", out
      printed = 1
      if (truncated) {
        exit
      }
    }
    END {
      if (truncated) {
        printf "..."
      }
      printf "\n"
    }'
}

blog_condensed_preview_truncated() {
  content=${1-}
  word_count=$(blog_condensed_preview_plain_text "$content" | wc -w | tr -d ' ')
  case "$word_count" in ''|*[!0-9]*) word_count=0 ;; esac
  if [ "$word_count" -gt 48 ]; then
    printf 'true\n'
  else
    printf 'false\n'
  fi
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
  enabled=$(config-get "$blog_site_conf" new_users_are_admins 2>/dev/null || printf 'true')
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
    [ -r "$re_profile" ] || continue
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
    [ -r "$sorted_profile" ] || continue
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
    [ -r "$profile" ] || continue
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

blog_author_looks_like_nostr_fallback() {
  raw_author=$(printf '%s' "${1-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
  case "$raw_author" in
    ''|*[!0-9a-f]*) return 1 ;;
  esac
  [ "${#raw_author}" -ge 8 ] && [ "${#raw_author}" -le 16 ]
}

blog_nostr_author_display_name() {
  pubkey=$(blog_validate_nostr_pubkey "${1-}" 2>/dev/null || printf '')
  if [ -n "$pubkey" ]; then
    username=$(blog_find_username_by_nostr_pubkey "$pubkey" 2>/dev/null | head -n 1)
    if [ -n "$username" ]; then
      blog_author_display_name "$username"
      return 0
    fi
  fi
  printf '%s\n' 'Nostr Author'
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

blog_get_publish_name() {
  username=${1-}
  if [ -z "$username" ]; then
    return 1
  fi
  profile=$(blog_user_profile "$username")
  publish_name=""
  if [ -f "$profile" ]; then
    publish_name=$(config-get "$profile" publish_name 2>/dev/null || printf '')
  fi
  if [ -z "$publish_name" ]; then
    publish_name=$(blog_get_player_name "$username" 2>/dev/null || printf '%s' "$username")
  fi
  printf '%s\n' "$publish_name"
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

blog_set_publish_name() {
  username=${1-}
  publish_name=${2-}
  if [ -z "$username" ] || [ -z "$publish_name" ]; then
    return 1
  fi
  dir=$(blog_user_dir "$username")
  profile=$(blog_user_profile "$username")
  mkdir -p "$dir/delegates"
  previous_name=$(blog_get_publish_name "$username" 2>/dev/null || printf '%s' "$username")
  history_csv=$(config-get "$profile" publish_name_history 2>/dev/null || printf '')
  if [ -n "$previous_name" ] && [ "$previous_name" != "$publish_name" ]; then
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
  config-set "$profile" publish_name "$publish_name"
  if [ -n "$history_csv" ]; then
    config-set "$profile" publish_name_history "$history_csv"
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

blog_publish_name_aliases() {
  username=${1-}
  if [ -z "$username" ]; then
    return 1
  fi
  profile=$(blog_user_profile "$username")
  current_name=$(blog_get_publish_name "$username" 2>/dev/null || printf '%s' "$username")
  history_csv=$(config-get "$profile" publish_name_history 2>/dev/null || printf '')
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
      blog_get_publish_name "$raw_author" 2>/dev/null || printf '%s\n' "$raw_author"
      return 0
    fi
  fi
  printf '%s\n' "$raw_author"
}

blog_post_author_display_for_file() {
  file=${1-}
  [ -n "$file" ] && [ -f "$file" ] || {
    printf '%s\n' ''
    return 0
  }
  raw_author=$(blog_read_front_matter_value "$file" author 2>/dev/null || printf '')
  nostr_projection=$(blog_read_front_matter_value "$file" nostr_projection 2>/dev/null || printf 'false')
  case "$nostr_projection" in
    true|1|yes|on)
      nostr_pubkey=$(blog_read_front_matter_value "$file" nostr_pubkey 2>/dev/null || printf '')
      if [ -z "$raw_author" ] || blog_author_looks_like_nostr_fallback "$raw_author"; then
        blog_nostr_author_display_name "$nostr_pubkey"
        return 0
      fi
      ;;
  esac
  blog_author_display_name "$raw_author"
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

blog_validate_hex_token() {
  token=${1-}
  expected_count=${2-}
  case "$expected_count" in
    ''|*[!0-9]*) return 1 ;;
  esac
  count=$(printf '%s' "$token" | wc -c | tr -d ' ')
  [ "$count" -eq "$expected_count" ] || return 1
  case "$token" in
    *[!abcdef0123456789]*) return 1 ;;
  esac
}

blog_validate_session_token() {
  blog_validate_hex_token "${1-}" 48
}

blog_session_path() {
  token=${1-}
  blog_validate_session_token "$token" || return 1
  printf '%s/%s.conf\n' "$blog_sessions_dir" "$token"
}

blog_validate_nostr_login_request_id() {
  blog_validate_hex_token "${1-}" 32
}

blog_nostr_login_request_path() {
  request_id=${1-}
  blog_validate_nostr_login_request_id "$request_id" || return 1
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
  blog_validate_nostr_login_request_id "$request_id" || return 1
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
  blog_validate_nostr_login_request_id "$request_id" || return 0
  request_path=$(blog_nostr_login_request_path "$request_id" 2>/dev/null || printf '')
  [ -n "$request_path" ] || return 0
  rm -f "$request_path"
}

blog_nostr_delegation_path() {
  delegation_id=${1-}
  blog_validate_hex_token "$delegation_id" 64 || return 1
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
  if blog_validate_hex_token "$event_id" 64; then
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
  if ! blog_validate_session_token "$load_token"; then
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
        gsub(/\\"/, "\"", $0);
        gsub(/\\\\/, "\\", $0);
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
  printf '%s' "$tags" | tr '\n' ',' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | awk '
    function sanitize(s) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", s);
      gsub(/^[[]+|[]]+$/, "", s);
      gsub(/^["'"'"']+|["'"'"']+$/, "", s);
      gsub(/\\+/, "", s);
      gsub(/[[:space:]]+/, "-", s);
      gsub(/^-+|-+$/, "", s);
      gsub(/[^A-Za-z0-9._:+\/-]/, "", s);
      gsub(/^-+|-+$/, "", s);
      if (s !~ /[A-Za-z0-9]/) return "";
      if (length(s) > 64) return "";
      return s;
    }
    function canonical_tag(s) {
      key = tolower(s);
      if (key == "ai-shitpost" || key == "ai-quickpost") return "AI quickpost";
      return s;
    }
    {
      tag = canonical_tag(sanitize($0));
      if (tag == "") next;
      if (!seen[tag]++) {
        if (out != "") out = out ", ";
        out = out tag;
      }
    }
    END { printf "%s", out }
  '
}

blog_normalize_post_type() {
  raw=${1-longform}
  raw=$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g; s/-\{2,\}/-/g; s/^-//; s/-$//')
  case "$raw" in
    ''|long|longform)
      printf 'longform\n'
      ;;
    short|shortform)
      printf 'shortform\n'
      ;;
    capture|capture-media|capture_media|take-photo|take-photo-video)
      printf 'capture-media\n'
      ;;
    media|media-upload|media_upload|upload-media|upload_media|photo|video|image)
      printf 'upload-media\n'
      ;;
    attachment|attachments|file|file-upload|file_upload)
      # "Attachment" is a compose mode, not a distinct persisted post kind.
      printf 'longform\n'
      ;;
    audio|audio-note|audio_note|voice|voice-note|voice_note)
      printf 'audio-note\n'
      ;;
    link|link-share|link_share|url|share-link)
      printf 'link-share\n'
      ;;
    go-live|go_live|live)
      printf 'go-live\n'
      ;;
    *)
      printf 'longform\n'
      ;;
  esac
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

blog_validate_nostr_npub() {
  value=$(printf '%s' "${1-}" | tr -d '\r\n[:space:]')
  case "$value" in
    npub1*) printf '%s\n' "$value" ;;
    *) return 1 ;;
  esac
}

blog_nostr_pubkey_to_npub() {
  pubkey=$(blog_validate_nostr_pubkey "${1-}" 2>/dev/null || printf '')
  [ -n "$pubkey" ] || return 1

  if command -v nak >/dev/null 2>&1; then
    encoded=$(nak encode npub "$pubkey" 2>/dev/null | tr -d '\r\n[:space:]')
    encoded=$(blog_validate_nostr_npub "$encoded" 2>/dev/null || printf '')
    if [ -n "$encoded" ]; then
      printf '%s\n' "$encoded"
      return 0
    fi
  fi

  if command -v python3 >/dev/null 2>&1; then
    encoded=$(python3 - "$pubkey" <<'PY' 2>/dev/null
import sys

alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
generator = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

def bech32_polymod(values):
    chk = 1
    for value in values:
        top = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ value
        for i, gen in enumerate(generator):
            if (top >> i) & 1:
                chk ^= gen
    return chk

def hrp_expand(hrp):
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]

def create_checksum(hrp, data):
    values = hrp_expand(hrp) + data + [0, 0, 0, 0, 0, 0]
    polymod = bech32_polymod(values) ^ 1
    return [(polymod >> (5 * (5 - i))) & 31 for i in range(6)]

def convertbits(data, from_bits, to_bits, pad=True):
    acc = 0
    bits = 0
    out = []
    maxv = (1 << to_bits) - 1
    for value in data:
        acc = (acc << from_bits) | value
        bits += from_bits
        while bits >= to_bits:
            bits -= to_bits
            out.append((acc >> bits) & maxv)
    if pad and bits:
        out.append((acc << (to_bits - bits)) & maxv)
    return out

pubkey = sys.argv[1].strip().lower()
if len(pubkey) != 64 or any(ch not in "0123456789abcdef" for ch in pubkey):
    raise SystemExit(1)
words = convertbits(bytes.fromhex(pubkey), 8, 5, True)
checksum = create_checksum("npub", words)
print("npub1" + "".join(alphabet[v] for v in words + checksum))
PY
)
    encoded=$(blog_validate_nostr_npub "$encoded" 2>/dev/null || printf '')
    if [ -n "$encoded" ]; then
      printf '%s\n' "$encoded"
      return 0
    fi
  fi

  return 1
}

blog_nostr_site_npub() {
  cache_file="$blog_nostr_state_dir/site_npub"
  if [ -f "$cache_file" ]; then
    cached=$(sed -n '1p' "$cache_file" 2>/dev/null | tr -d '\r\n[:space:]')
    cached=$(blog_validate_nostr_npub "$cached" 2>/dev/null || printf '')
    if [ -n "$cached" ]; then
      printf '%s\n' "$cached"
      return 0
    fi
  fi

  pubkey=''
  if [ -f "$blog_nostr_state_dir/site_pubkey" ]; then
    pubkey=$(sed -n '1p' "$blog_nostr_state_dir/site_pubkey" 2>/dev/null | tr -d '\r\n[:space:]')
    pubkey=$(blog_validate_nostr_pubkey "$pubkey" 2>/dev/null || printf '')
  fi
  if [ -z "$pubkey" ]; then
    secret=$(blog_nostr_secret_key 2>/dev/null || printf '')
    if [ -n "$secret" ] && command -v nostril >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
      tmp=$(mktemp "${TMPDIR:-/tmp}/blog-site-npub.XXXXXX")
      set +e
      nostril --sec "$secret" --kind 1 --created-at "$(blog_now_epoch)" --content "" > "$tmp" 2>/dev/null
      sign_status=$?
      set -e
      if [ "$sign_status" -eq 0 ]; then
        pubkey=$(jq -r '.pubkey // ""' "$tmp" 2>/dev/null || printf '')
        pubkey=$(blog_validate_nostr_pubkey "$pubkey" 2>/dev/null || printf '')
      fi
      rm -f "$tmp"
    fi
  fi
  [ -n "$pubkey" ] || return 1

  encoded=$(blog_nostr_pubkey_to_npub "$pubkey" 2>/dev/null || printf '')
  [ -n "$encoded" ] || return 1
  mkdir -p "$blog_nostr_state_dir" >/dev/null 2>&1 || true
  printf '%s\n' "$encoded" > "$cache_file"
  chmod 600 "$cache_file" 2>/dev/null || true
  printf '%s\n' "$encoded"
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

blog_nostr_normalize_relay_url() {
  relay=${1-}
  relay=$(printf '%s' "$relay" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's#/$##')
  [ -n "$relay" ] || return 1
  case "$relay" in
    ws://*|wss://*)
      printf '%s\n' "$relay"
      ;;
    *)
      return 1
      ;;
  esac
}

blog_nostr_relay_identity() {
  relay=$(blog_nostr_normalize_relay_url "${1-}" 2>/dev/null || printf '')
  [ -n "$relay" ] || return 1
  printf '%s\n' "${relay#*://}" | tr '[:upper:]' '[:lower:]'
}

blog_nostr_site_relay_url() {
  base_url=$(blog_base_url 2>/dev/null || printf '')
  [ -n "$base_url" ] || return 1
  relay=$(printf '%s' "$base_url" | sed -e 's#^https://#wss://#' -e 's#^http://#ws://#' -e 's#/$##')
  blog_nostr_normalize_relay_url "$relay"
}

blog_nostr_upstream_relays() {
  upstream_relays_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-upstream-relays.XXXXXX")
  upstream_seen_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-upstream-seen.XXXXXX")
  upstream_site_identity=$(blog_nostr_relay_identity "$(blog_nostr_site_relay_url 2>/dev/null || printf '')" 2>/dev/null || printf '')
  if ! blog_nostr_relays_args > "$upstream_relays_tmp" 2>/dev/null; then
    rm -f "$upstream_relays_tmp" "$upstream_seen_tmp"
    return 1
  fi
  while IFS= read -r relay || [ -n "$relay" ]; do
    relay=$(blog_nostr_normalize_relay_url "$relay" 2>/dev/null || printf '')
    [ -n "$relay" ] || continue
    upstream_relay_identity=$(blog_nostr_relay_identity "$relay" 2>/dev/null || printf '')
    [ -n "$upstream_relay_identity" ] || continue
    if [ -n "$upstream_site_identity" ] && [ "$upstream_relay_identity" = "$upstream_site_identity" ]; then
      continue
    fi
    if grep -Fqx "$upstream_relay_identity" "$upstream_seen_tmp" 2>/dev/null; then
      continue
    fi
    printf '%s\n' "$upstream_relay_identity" >> "$upstream_seen_tmp"
    printf '%s\n' "$relay"
  done < "$upstream_relays_tmp"
  rm -f "$upstream_relays_tmp" "$upstream_seen_tmp"
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

blog_nostr_event_signature_json() {
  event_json=${1-}
  [ -n "$event_json" ] || return 1
  printf '%s\n' "$event_json" | jq -c '{
    kind: (.kind // 0),
    pubkey: (.pubkey // ""),
    content: (.content // ""),
    tags: (.tags // [])
  }' 2>/dev/null || return 1
}

blog_nostr_event_file_path() {
  pubkey=${1-}
  kind=${2-}
  event_id=${3-}
  [ -n "$pubkey" ] || return 1
  [ -n "$kind" ] || return 1
  [ -n "$event_id" ] || return 1
  printf '%s/%s/%s/%s.json\n' "$blog_nostr_events_dir" "$pubkey" "$kind" "$event_id"
}

blog_nostr_event_json_by_parts() {
  pubkey=${1-}
  kind=${2-}
  event_id=${3-}
  path=$(blog_nostr_event_file_path "$pubkey" "$kind" "$event_id" 2>/dev/null || printf '')
  [ -n "$path" ] || return 1
  [ -f "$path" ] || return 1
  jq -c '.' "$path" 2>/dev/null || return 1
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

blog_nostr_relay_has_event() {
  relay=$(blog_nostr_normalize_relay_url "${1-}" 2>/dev/null || printf '')
  event_id=$(printf '%s' "${2-}" | tr -d '\r\n[:space:]' | tr 'A-F' 'a-f')
  [ -n "$relay" ] || return 1
  [ -n "$event_id" ] || return 1
  command -v nak >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1

  out_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-relay-has-event.XXXXXX")
  set +e
  nak req --limit 1 --id "$event_id" "$relay" > "$out_tmp" 2>/dev/null
  req_status=$?
  set -e
  if [ "$req_status" -ne 0 ]; then
    rm -f "$out_tmp"
    return 1
  fi
  if jq -e --arg id "$event_id" 'select(type=="object" and (.id // "") == $id)' "$out_tmp" >/dev/null 2>&1; then
    rm -f "$out_tmp"
    return 0
  fi
  rm -f "$out_tmp"
  return 1
}

blog_nostr_publish_event_json() {
  event_json=${1-}
  [ -n "$event_json" ] || return 1
  command -v nak >/dev/null 2>&1 || return 1
  command -v jq >/dev/null 2>&1 || return 1

  event_compact=$(printf '%s\n' "$event_json" | jq -c '.' 2>/dev/null || printf '')
  [ -n "$event_compact" ] || return 1
  if ! blog_nostr_verify_event_json "$event_compact"; then
    return 1
  fi
  event_id=$(printf '%s\n' "$event_compact" | jq -r '.id // empty' 2>/dev/null || printf '')
  [ -n "$event_id" ] || return 1

  publish_relays_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-publish-relays.XXXXXX")
  if ! blog_nostr_upstream_relays > "$publish_relays_tmp" 2>/dev/null; then
    rm -f "$publish_relays_tmp"
    return 1
  fi
  if [ ! -s "$publish_relays_tmp" ]; then
    rm -f "$publish_relays_tmp"
    return 1
  fi

  success_count=0
  while IFS= read -r relay || [ -n "$relay" ]; do
    [ -n "$relay" ] || continue
    set +e
    printf '%s\n' "$event_compact" | nak event "$relay" >/dev/null 2>&1
    publish_status=$?
    set -e
    if [ "$publish_status" -eq 0 ] || blog_nostr_relay_has_event "$relay" "$event_id"; then
      success_count=$((success_count + 1))
    fi
  done < "$publish_relays_tmp"
  rm -f "$publish_relays_tmp"

  if [ "$success_count" -lt 1 ]; then
    return 1
  fi
  printf '%s\n' "$success_count"
}

blog_nostr_publish_and_store_event_json() {
  event_json=${1-}
  [ -n "$event_json" ] || return 1
  if ! blog_nostr_publish_event_json "$event_json" >/dev/null 2>&1; then
    return 1
  fi
  blog_nostr_store_event_json "$event_json"
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

blog_nostr_absolute_url() {
  raw=${1-}
  [ -n "$raw" ] || return 1
  case "$raw" in
    http://*|https://*)
      printf '%s\n' "$raw"
      ;;
    /*)
      printf '%s%s\n' "$(blog_base_url)" "$raw"
      ;;
    *)
      printf '%s/%s\n' "$(blog_base_url)" "$raw"
      ;;
  esac
}

blog_nostr_first_http_url() {
  text=${1-}
  [ -n "$text" ] || return 1
  printf '%s\n' "$text" | grep -Eo "https?://[^[:space:])>\"']+" 2>/dev/null | head -n 1
}

blog_nostr_first_markdown_image_url() {
  text=${1-}
  [ -n "$text" ] || return 1
  printf '%s\n' "$text" | sed -n 's/.*!\[[^]]*\](\([^)]\{1,\}\)).*/\1/p' | head -n 1
}

blog_nostr_primary_file_metadata() {
  content=${1-}
  file_id=$(blog_file_ids_from_text "$content" | head -n 1)
  [ -n "$file_id" ] || return 1
  record_path=$(blog_file_record_path "$file_id" 2>/dev/null || printf '')
  [ -f "$record_path" ] || return 1

  safe_name=$(config-get "$record_path" safe_name 2>/dev/null || printf '')
  rel_url=$(blog_file_public_url_encoded "$file_id" "$safe_name" 2>/dev/null || printf '')
  abs_url=$(blog_nostr_absolute_url "$rel_url" 2>/dev/null || printf '')
  mime_type=$(config-get "$record_path" mime_type 2>/dev/null || printf '')
  size_bytes=$(config-get "$record_path" size_bytes 2>/dev/null || printf '')
  disk_path=$(blog_file_resolve_disk_path "$file_id" 2>/dev/null || printf '')

  ox=''
  dim=''
  duration=''
  if [ -n "$disk_path" ] && [ -f "$disk_path" ]; then
    ox=$(blog_sha256 < "$disk_path" 2>/dev/null || printf '')
    case "$mime_type" in
      image/*)
        if command -v sips >/dev/null 2>&1; then
          dim=$(sips -g pixelWidth -g pixelHeight "$disk_path" 2>/dev/null \
            | awk '/pixelWidth:/ {w=$2} /pixelHeight:/ {h=$2} END { if (w > 0 && h > 0) printf "%sx%s", w, h }')
        fi
        ;;
    esac
    case "$mime_type" in
      video/*|audio/*)
        if command -v ffprobe >/dev/null 2>&1; then
          duration_raw=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$disk_path" 2>/dev/null | head -n 1)
          if [ -n "$duration_raw" ]; then
            duration=$(printf '%s\n' "$duration_raw" | awk '{v=$1+0; if (v > 0) printf "%d", int(v+0.5)}')
          fi
        fi
        ;;
    esac
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$file_id" "$abs_url" "$mime_type" "$size_bytes" "$ox" "$dim" "$duration"
}

blog_nostr_kind_for_post_type() {
  post_type=$(blog_normalize_post_type "${1-}")
  mime_type=${2-}
  case "$post_type" in
    shortform|link-share)
      printf '1\n'
      ;;
    longform)
      printf '30023\n'
      ;;
    audio-note)
      printf '21\n'
      ;;
    capture-media|upload-media)
      case "$mime_type" in
        image/*) printf '20\n' ;;
        video/*|audio/*) printf '21\n' ;;
        *) printf '20\n' ;;
      esac
      ;;
    go-live)
      printf '30311\n'
      ;;
    *)
      printf '30023\n'
      ;;
  esac
}

blog_nostr_alt_for_post_type() {
  post_type=$(blog_normalize_post_type "${1-}")
  title=${2-}
  summary=${3-}
  mime_type=${4-}
  default_alt=''
  case "$post_type" in
    shortform) default_alt='Shortform post' ;;
    longform) default_alt='Longform post' ;;
    link-share) default_alt='Link' ;;
    audio-note) default_alt='Audio note' ;;
    capture-media|upload-media)
      case "$mime_type" in
        image/*) default_alt='Image post' ;;
        video/*) default_alt='Video post' ;;
        audio/*) default_alt='Audio post' ;;
        *) default_alt='Media post' ;;
      esac
      ;;
    go-live) default_alt='Live stream post' ;;
    *) default_alt='Post' ;;
  esac
  if [ -n "$title" ]; then
    printf '%s\n' "$title"
    return 0
  fi
  if [ -n "$summary" ]; then
    printf '%s\n' "$summary"
    return 0
  fi
  printf '%s\n' "$default_alt"
}

blog_nostr_sign_post_event() {
  # args: title tags_csv summary content published_iso post_type source_post_path post_filename
  title=$1
  tags_csv=$2
  summary=$3
  content=$4
  published_iso=$5
  post_type=$(blog_normalize_post_type "${6-longform}")
  source_post_path=${7-}
  post_filename=${8-}
  if [ "$post_type" = "shortform" ]; then
    title=''
  fi

  if ! command -v jq >/dev/null 2>&1; then
    return 1
  fi

  secret=$(blog_nostr_secret_key 2>/dev/null || printf '')
  if [ -z "$secret" ]; then
    return 1
  fi

  created_at=$(blog_now_epoch)
  d_tag=''
  if [ -n "$post_filename" ]; then
    d_tag=$(blog_canonical_post_slug_from_source "$post_filename" 2>/dev/null || printf '')
  fi
  if [ -z "$d_tag" ] && [ -n "$source_post_path" ]; then
    d_tag=$(blog_canonical_post_slug_from_source "$source_post_path" 2>/dev/null || printf '')
  fi
  if [ -z "$d_tag" ]; then
    d_seed=$(blog_slug_seed_text "$title" "$content" "$post_type")
    d_tag=$(blog_slugify "$d_seed")
  fi
  if [ -z "$d_tag" ]; then
    d_tag="post-$created_at"
  fi
  tags_normalized=$(blog_normalize_tags "$tags_csv")

  primary_file_meta=$(blog_nostr_primary_file_metadata "$content" 2>/dev/null || printf '')
  primary_file_url=''
  primary_file_mime=''
  primary_file_size=''
  primary_file_ox=''
  primary_file_dim=''
  primary_file_duration=''
  if [ -n "$primary_file_meta" ]; then
    primary_file_url=$(printf '%s' "$primary_file_meta" | awk -F '\t' '{print $2}')
    primary_file_mime=$(printf '%s' "$primary_file_meta" | awk -F '\t' '{print $3}')
    primary_file_size=$(printf '%s' "$primary_file_meta" | awk -F '\t' '{print $4}')
    primary_file_ox=$(printf '%s' "$primary_file_meta" | awk -F '\t' '{print $5}')
    primary_file_dim=$(printf '%s' "$primary_file_meta" | awk -F '\t' '{print $6}')
    primary_file_duration=$(printf '%s' "$primary_file_meta" | awk -F '\t' '{print $7}')
  fi

  event_kind=$(blog_nostr_kind_for_post_type "$post_type" "$primary_file_mime")
  alt_text=$(blog_nostr_alt_for_post_type "$post_type" "$title" "$summary" "$primary_file_mime")
  link_url=$(blog_nostr_first_http_url "$content" 2>/dev/null || printf '')
  image_url=$(blog_nostr_first_markdown_image_url "$content" 2>/dev/null || printf '')
  if [ -n "$image_url" ]; then
    image_url=$(blog_nostr_absolute_url "$image_url" 2>/dev/null || printf "$image_url")
  fi
  if [ -z "$image_url" ] && [ -n "$primary_file_url" ]; then
    case "$primary_file_mime" in
      image/*) image_url=$primary_file_url ;;
    esac
  fi

  sign_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-sign.XXXXXX")
  event_json=''

  if command -v nostril >/dev/null 2>&1; then
    set -- nostril --sec "$secret" --kind "$event_kind" --created-at "$created_at" --content "$content" --tag d "$d_tag" --tag t blog --tag post_type "$post_type"
    if [ -n "$alt_text" ]; then
      set -- "$@" --tag alt "$alt_text"
    fi
    case "$post_type" in
      shortform)
        set -- "$@" --tag t short
        ;;
      longform)
        set -- "$@" --tag title "$title" --tag published_at "$published_iso"
        if [ -n "$summary" ]; then
          set -- "$@" --tag summary "$summary"
        fi
        ;;
      link-share)
        if [ -n "$title" ]; then
          set -- "$@" --tag title "$title"
        fi
        if [ -n "$summary" ]; then
          set -- "$@" --tag summary "$summary"
        fi
        if [ -n "$link_url" ]; then
          set -- "$@" --tag r "$link_url"
        fi
        if [ -n "$image_url" ]; then
          set -- "$@" --tag image "$image_url"
        fi
        ;;
      attachment|audio-note|capture-media|upload-media)
        if [ -n "$primary_file_url" ]; then
          set -- "$@" --tag url "$primary_file_url"
        fi
        if [ -n "$primary_file_mime" ]; then
          set -- "$@" --tag m "$primary_file_mime"
        fi
        if [ -n "$primary_file_size" ]; then
          set -- "$@" --tag size "$primary_file_size"
        fi
        if [ -n "$primary_file_ox" ]; then
          set -- "$@" --tag ox "$primary_file_ox"
        fi
        if [ -n "$primary_file_dim" ]; then
          set -- "$@" --tag dim "$primary_file_dim"
        fi
        if [ -n "$primary_file_duration" ]; then
          set -- "$@" --tag duration "$primary_file_duration"
        fi
        ;;
      go-live)
        set -- "$@" --tag streaming true --tag starts "$published_iso" --tag status live
        ;;
    esac

    printf '%s\n' "$tags_normalized" | tr ',' '\n' | while IFS= read -r tag || [ -n "$tag" ]; do
      clean=$(printf '%s' "$tag" | sed 's/^ *//;s/ *$//')
      [ -n "$clean" ] || continue
      printf '%s\n' "$clean"
    done > "$sign_tmp.tags"
    while IFS= read -r tag_line || [ -n "$tag_line" ]; do
      [ -n "$tag_line" ] || continue
      set -- "$@" --tag t "$tag_line"
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
          ref_kind=$(printf '%s\n' "$ref_record" | jq -r '.kind // 30023' 2>/dev/null || printf '30023')
          ref_pubkey=$(printf '%s\n' "$ref_record" | jq -r '.pubkey // ""' 2>/dev/null || printf '')
          ref_d=$(printf '%s\n' "$ref_record" | jq -r '.d // ""' 2>/dev/null || printf '')
          if [ -n "$ref_pubkey" ] && [ -n "$ref_d" ]; then
            printf '%s:%s:%s\n' "$ref_kind" "$ref_pubkey" "$ref_d" >> "$refs_tmp"
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

  if ! command -v nak >/dev/null 2>&1; then
    printf 'nak is not installed. Install the Nostr support tools from Headquarters.\n'
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

  relay_count=$(blog_nostr_upstream_relays 2>/dev/null | awk 'NF { count += 1 } END { print count + 0 }')
  if [ "${relay_count:-0}" -lt 1 ]; then
    printf 'No upstream Nostr relays are configured. Add at least one public relay in Admin > Nostr.\n'
    return 0
  fi

  printf 'signing or policy checks failed (author allowlist, key validity, or event verification).\n'
}

blog_nostr_mark_content_files_public() {
  content=${1-}
  draft_id=${2-}
  if [ -z "$content" ]; then
    return 0
  fi
  now_iso=$(blog_now_iso)
  blog_file_ids_from_text "$content" | while IFS= read -r file_id || [ -n "$file_id" ]; do
    [ -n "$file_id" ] || continue
    record_path=$(blog_file_record_path "$file_id" 2>/dev/null || printf '')
    [ -f "$record_path" ] || continue
    config-set "$record_path" explicit_public true
    if [ -n "$draft_id" ]; then
      config-set "$record_path" draft_id ""
    fi
    config-set "$record_path" updated_at "$now_iso"
  done
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

blog_nostr_authored_post_slugs() {
  if [ ! -d "$blog_posts_dir" ] && [ ! -L "$blog_posts_dir" ]; then
    return 0
  fi
  find -L "$blog_posts_dir" -type f -name '*.md' 2>/dev/null | sort | while IFS= read -r post_file; do
    [ -f "$post_file" ] || continue
    marker=$(blog_read_front_matter_value "$post_file" nostr_projection 2>/dev/null || printf '')
    if [ "$marker" = "true" ]; then
      continue
    fi
    slug=$(blog_canonical_post_slug_from_source "$post_file" 2>/dev/null || printf '')
    [ -n "$slug" ] || continue
    printf '%s\n' "$slug"
  done | awk 'NF && !seen[$0]++ { print }'
}

blog_nostr_write_projection_posts() {
  posts_index=${1-}
  [ -f "$posts_index" ] || return 0

  blog_nostr_clear_projection_posts
  mkdir -p "$blog_posts_dir"
  authored_slugs_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-authored-slugs.XXXXXX")
  blog_nostr_authored_post_slugs > "$authored_slugs_tmp" 2>/dev/null || true

  jq -c '.[]' "$posts_index" 2>/dev/null | while IFS= read -r row || [ -n "$row" ]; do
    [ -n "$row" ] || continue
    slug=$(printf '%s\n' "$row" | jq -r '.slug // empty' 2>/dev/null || printf '')
    [ -n "$slug" ] || continue
    if grep -Fqx "$slug" "$authored_slugs_tmp" 2>/dev/null; then
      continue
    fi
    title=$(printf '%s\n' "$row" | jq -r '.title // ""' 2>/dev/null || printf '')
    summary=$(printf '%s\n' "$row" | jq -r '.summary // ""' 2>/dev/null || printf '')
    published_at=$(printf '%s\n' "$row" | jq -r '.published_at // ""' 2>/dev/null || printf '')
    content=$(printf '%s\n' "$row" | jq -r '.content // ""' 2>/dev/null || printf '')
    pubkey=$(printf '%s\n' "$row" | jq -r '.pubkey // ""' 2>/dev/null || printf '')
    event_id=$(printf '%s\n' "$row" | jq -r '.id // ""' 2>/dev/null || printf '')
    event_kind=$(printf '%s\n' "$row" | jq -r '.kind // 30023' 2>/dev/null || printf '30023')
    post_type=$(printf '%s\n' "$row" | jq -r '.post_type // ""' 2>/dev/null || printf '')
    post_type=$(blog_normalize_post_type "$post_type")
    d_tag=$(printf '%s\n' "$row" | jq -r '.d // ""' 2>/dev/null || printf '')
    uri=$(printf '%s\n' "$row" | jq -r '.uri // ""' 2>/dev/null || printf '')
    tags_csv=$(printf '%s\n' "$row" | jq -r '.tags // [] | join(", ")' 2>/dev/null || printf '')
    tags_yaml=$(blog_tags_to_yaml_array "$tags_csv")
    if [ "$post_type" = "shortform" ]; then
      title=''
    else
      title=$(blog_effective_post_title "$title" "$content" "$post_type")
    fi
    content_hash=$(printf '%s' "$content" | blog_sha256)
    author_label=$(blog_nostr_author_display_name "$pubkey")

    out_path="$blog_posts_dir/$slug.md"
    {
      printf '%s\n' '---'
      printf 'title: "%s"\n' "$(blog_yaml_escape "$title")"
      printf 'published_at: "%s"\n' "$published_at"
      printf 'content_hash: "%s"\n' "$content_hash"
      printf 'tags: %s\n' "$tags_yaml"
      printf 'post_type: "%s"\n' "$(blog_yaml_escape "$post_type")"
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
  rm -f "$authored_slugs_tmp"
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
    def blog_canonical_visible_tag:
      if (. | ascii_downcase) == "ai-shitpost" or (. | ascii_downcase) == "ai-quickpost" then "AI quickpost" else . end;
    def blog_visible_tags: map(select((. | ascii_downcase) != "blog") | blog_canonical_visible_tag);
    map(select(
      type=="object"
      and (.kind|type)=="number"
      and (.kind==1 or .kind==15 or .kind==20 or .kind==21 or .kind==30023 or .kind==30311)
      and (.id|type)=="string"
      and (.pubkey|type)=="string"
      and (.tags|type)=="array"
      and (.content|type)=="string"
    ))
    | map(. + {
        d: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="d") | .[1]] | first) // ""),
        title_tag: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="title") | .[1] | select(type=="string")] | first) // ""),
        summary_tag: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="summary") | .[1] | select(type=="string")] | first) // ""),
        published_tag: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="published_at") | .[1] | select(type=="string")] | first) // ""),
        post_type_tag: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="post_type") | .[1] | select(type=="string")] | first) // ""),
        r_tag: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="r") | .[1] | select(type=="string")] | first) // ""),
        m_tag: (([.tags[]? | select(type=="array" and length>=2 and .[0]=="m") | .[1] | select(type=="string")] | first) // ""),
        tag_list: ([.tags[]? | select(type=="array" and length>=2 and .[0]=="t") | .[1]] | map(select(type=="string")))
      })
    | map(select(.d != ""))
    | map(select((.kind == 30023) or ((.tag_list | index("blog")) != null) or ((.post_type_tag | length) > 0)))
    | map(select(((.d as $d | $hidden | index($d)) == null) and (((.pubkey + ":" + .d) as $pair | $hidden | index($pair)) == null)))
    | sort_by(.pubkey, .kind, .d, (.created_at // 0), .id)
    | group_by(.pubkey, .kind, .d)
    | map(last)
    | sort_by((.created_at // 0), .id)
    | reverse
    | map(
        . as $ev
        | ($ev.d | ascii_downcase | gsub("[^a-z0-9]+";"-") | gsub("(^-+|-+$)";"")) as $slug_raw
        | ($ev.post_type_tag // "") as $tagged_type
        | ($ev.tag_list | unique) as $source_tag_list
        | ($source_tag_list | blog_visible_tags) as $tag_list
        | {
            id: $ev.id,
            pubkey: $ev.pubkey,
            kind: $ev.kind,
            d: $ev.d,
            slug: (if ($slug_raw | length) > 0 then $slug_raw else "post" end),
            created_at: ($ev.created_at // 0),
            published_at: (if ($ev.published_tag | length) > 0 then $ev.published_tag else (($ev.created_at // 0) | todateiso8601) end),
            title: (if ($ev.title_tag | length) > 0 then $ev.title_tag else $ev.d end),
            summary: (
              if ($ev.summary_tag | length) > 0 then $ev.summary_tag
              elif ($ev.kind == 1 and ($ev.r_tag | length) > 0) then $ev.r_tag
              else ""
              end
            ),
            tags: $tag_list,
            content: $ev.content,
            post_type: (
              if ($tagged_type | length) > 0 then $tagged_type
              elif $ev.kind == 30023 then "longform"
              elif $ev.kind == 15 then "attachment"
              elif $ev.kind == 20 then "upload-media"
              elif ($ev.kind == 21 and ($ev.m_tag | startswith("audio/"))) then "audio-note"
              elif $ev.kind == 21 then "upload-media"
              elif ($ev.kind == 1 and ($tag_list | index("short")) != null) then "shortform"
              elif ($ev.kind == 1 and ($ev.r_tag | length) > 0) then "link-share"
              elif $ev.kind == 30311 then "go-live"
              else "longform"
              end
            ),
            address: (($ev.kind | tostring) + ":" + $ev.pubkey + ":" + $ev.d),
            uri: ("nostr:" + ($ev.kind | tostring) + ":" + $ev.pubkey + ":" + $ev.d),
            md_path: ("posts/" + (if ($slug_raw | length) > 0 then $slug_raw else "post" end) + ".md"),
            html_path: ("posts/" + (if ($slug_raw | length) > 0 then $slug_raw else "post" end))
          }
      )
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
  posts_canonical_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-posts-canonical.XXXXXX")
  if jq '
    def canonical_tag:
      if (. | ascii_downcase) == "ai-shitpost" or (. | ascii_downcase) == "ai-quickpost" then "AI quickpost" else . end;
    map(if (.tags | type) == "array" then .tags = (.tags | map(if type == "string" then canonical_tag else . end)) else . end)
  ' "$blog_nostr_posts_index" > "$posts_canonical_tmp" 2>/dev/null; then
    mv "$posts_canonical_tmp" "$blog_nostr_posts_index"
  else
    rm -f "$posts_canonical_tmp"
  fi
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

blog_nostr_event_json_from_record() {
  record_json=${1-}
  [ -n "$record_json" ] || return 1
  event_id=$(printf '%s\n' "$record_json" | jq -r '.id // empty' 2>/dev/null || printf '')
  pubkey=$(printf '%s\n' "$record_json" | jq -r '.pubkey // empty' 2>/dev/null || printf '')
  kind=$(printf '%s\n' "$record_json" | jq -r '.kind // empty' 2>/dev/null || printf '')
  [ -n "$event_id" ] || return 1
  [ -n "$pubkey" ] || return 1
  [ -n "$kind" ] || return 1
  blog_nostr_event_json_by_parts "$pubkey" "$kind" "$event_id"
}

blog_nostr_build_post_event_json_for_file() {
  file=${1-}
  [ -f "$file" ] || return 1

  visibility=$(blog_read_front_matter_value "$file" visibility 2>/dev/null || printf 'public')
  if [ -z "$visibility" ]; then
    visibility=public
  fi
  if [ "$visibility" != "public" ]; then
    return 1
  fi

  title=$(blog_read_front_matter_value "$file" title 2>/dev/null || printf '')
  post_type=$(blog_read_front_matter_value "$file" post_type 2>/dev/null || printf '')
  if [ -z "$post_type" ]; then
    post_type=$(blog_read_front_matter_value "$file" type 2>/dev/null || printf '')
  fi
  post_type=$(blog_normalize_post_type "$post_type")
  published_iso=$(blog_read_front_matter_value "$file" published_at 2>/dev/null || printf '')
  if [ -z "$published_iso" ]; then
    published_iso=$(blog_now_iso)
  fi
  summary=$(blog_read_front_matter_value "$file" summary 2>/dev/null || printf '')
  tags_raw=$(blog_read_front_matter_value "$file" tags 2>/dev/null || printf '')
  tags_csv=$(printf '%s' "$tags_raw" | sed "s/^\[//;s/\]$//;s/\"//g;s/'//g")
  content=$(blog_read_markdown_body "$file")
  title=$(blog_effective_post_title "$title" "$content" "$post_type")
  source_post_path=${file#"$blog_site_root/site/pages/"}
  post_filename=$(blog_canonical_post_slug_from_source "$source_post_path" 2>/dev/null || printf '')

  blog_nostr_sign_post_event "$title" "$tags_csv" "$summary" "$content" "$published_iso" "$post_type" "$source_post_path" "$post_filename"
}

blog_nostr_post_existing_event_json_for_file() {
  file=${1-}
  [ -f "$file" ] || return 1

  event_id=$(blog_read_front_matter_value "$file" nostr_event_id 2>/dev/null || printf '')
  pubkey=$(blog_read_front_matter_value "$file" nostr_pubkey 2>/dev/null || printf '')
  kind=$(blog_read_front_matter_value "$file" nostr_kind 2>/dev/null || printf '')
  if [ -n "$event_id" ] && [ -n "$pubkey" ] && [ -n "$kind" ]; then
    existing_event_json=$(blog_nostr_event_json_by_parts "$pubkey" "$kind" "$event_id" 2>/dev/null || printf '')
    if [ -n "$existing_event_json" ]; then
      printf '%s\n' "$existing_event_json"
      return 0
    fi
  fi

  slug=$(blog_canonical_post_slug_from_source "$file" 2>/dev/null || printf '')
  [ -n "$slug" ] || return 1
  record_json=$(blog_nostr_post_record_for_slug "$slug" 2>/dev/null || printf '')
  [ -n "$record_json" ] || return 1
  blog_nostr_event_json_from_record "$record_json"
}

blog_nostr_post_markdown_file_in_sync() {
  file=${1-}
  desired_event_json=$(blog_nostr_build_post_event_json_for_file "$file" 2>/dev/null || printf '')
  existing_event_json=$(blog_nostr_post_existing_event_json_for_file "$file" 2>/dev/null || printf '')
  [ -n "$desired_event_json" ] || return 1
  [ -n "$existing_event_json" ] || return 1
  desired_signature=$(blog_nostr_event_signature_json "$desired_event_json" 2>/dev/null || printf '')
  existing_signature=$(blog_nostr_event_signature_json "$existing_event_json" 2>/dev/null || printf '')
  [ -n "$desired_signature" ] || return 1
  [ -n "$existing_signature" ] || return 1
  [ "$desired_signature" = "$existing_signature" ]
}

blog_nostr_sync_post_markdown_file() {
  file=${1-}
  [ -f "$file" ] || return 1

  visibility=$(blog_read_front_matter_value "$file" visibility 2>/dev/null || printf 'public')
  if [ -z "$visibility" ]; then
    visibility=public
  fi
  if [ "$visibility" != "public" ]; then
    return 1
  fi

  content=$(blog_read_markdown_body "$file")
  desired_event_json=$(blog_nostr_build_post_event_json_for_file "$file" 2>/dev/null || printf '')
  [ -n "$desired_event_json" ] || return 1
  existing_event_json=$(blog_nostr_post_existing_event_json_for_file "$file" 2>/dev/null || printf '')
  desired_signature=$(blog_nostr_event_signature_json "$desired_event_json" 2>/dev/null || printf '')
  existing_signature=$(blog_nostr_event_signature_json "$existing_event_json" 2>/dev/null || printf '')

  if [ -n "$existing_signature" ] && [ "$existing_signature" = "$desired_signature" ]; then
    if ! blog_nostr_publish_event_json "$existing_event_json" >/dev/null 2>&1; then
      return 1
    fi
    blog_nostr_mark_content_files_public "$content" ""
    printf 'unchanged\n'
    return 0
  fi

  if ! blog_nostr_publish_and_store_event_json "$desired_event_json" >/dev/null 2>&1; then
    return 1
  fi
  blog_nostr_mark_content_files_public "$content" ""
  printf 'updated\n'
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

  out=$(jq -cs --arg slug "$slug" '
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

blog_nostr_mirror_store_events_from_file() {
  input_file=${1-}
  if [ -z "$input_file" ] || [ ! -f "$input_file" ]; then
    printf '0\n'
    return 0
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
  done < "$input_file"
  printf '%s\n' "$mirrored"
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

  out_longform_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-mirror-posts-longform.XXXXXX")
  out_blog_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-nostr-mirror-posts-blog.XXXXXX")

  # Backward-compatibility: include legacy kind:30023 posts even if they predate t=blog tagging.
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
  "$@" > "$out_longform_tmp" 2>/dev/null
  _status=$?
  set -e
  if [ "$_status" -ne 0 ] && [ ! -s "$out_longform_tmp" ]; then
    rm -f "$authors_tmp" "$relays_tmp" "$out_longform_tmp" "$out_blog_tmp"
    return 1
  fi

  mirrored=0
  mirrored_longform=$(blog_nostr_mirror_store_events_from_file "$out_longform_tmp" 2>/dev/null || printf '0')
  case "$mirrored_longform" in ''|*[!0-9]*) mirrored_longform=0 ;; esac
  mirrored=$((mirrored + mirrored_longform))

  # Non-longform posts can be very noisy on kind:1; constrain to posts emitted by this app (t=blog).
  set -- nak req -k 1 -k 15 -k 20 -k 21 -k 30311 -t "t=blog"
  while IFS= read -r author || [ -n "$author" ]; do
    [ -n "$author" ] || continue
    set -- "$@" -a "$author"
  done < "$authors_tmp"
  while IFS= read -r relay || [ -n "$relay" ]; do
    [ -n "$relay" ] || continue
    set -- "$@" "$relay"
  done < "$relays_tmp"

  set +e
  "$@" > "$out_blog_tmp" 2>/dev/null
  _status=$?
  set -e
  if [ "$_status" -eq 0 ] || [ -s "$out_blog_tmp" ]; then
    mirrored_blog=$(blog_nostr_mirror_store_events_from_file "$out_blog_tmp" 2>/dev/null || printf '0')
    case "$mirrored_blog" in ''|*[!0-9]*) mirrored_blog=0 ;; esac
    mirrored=$((mirrored + mirrored_blog))
  fi

  rm -f "$authors_tmp" "$relays_tmp" "$out_longform_tmp" "$out_blog_tmp"
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

blog_draft_resolve_file_path() {
  draft_id=${1-}
  [ -n "$draft_id" ] || return 1
  direct_file=$(blog_draft_file_path "$draft_id")
  if [ -f "$direct_file" ]; then
    printf '%s\n' "$direct_file"
    return 0
  fi
  for draft_file in "$blog_drafts_dir"/*.md; do
    [ -f "$draft_file" ] || continue
    saved_id=$(blog_read_front_matter_value "$draft_file" draft_id 2>/dev/null || printf '')
    if [ "$saved_id" = "$draft_id" ]; then
      printf '%s\n' "$draft_file"
      return 0
    fi
  done
  return 1
}

blog_draft_read_field() {
  draft_id=${1-}
  draft_key=${2-}
  [ -n "$draft_id" ] || return 1
  [ -n "$draft_key" ] || return 1
  draft_file=$(blog_draft_resolve_file_path "$draft_id" 2>/dev/null || printf '')
  [ -n "$draft_file" ] || return 1
  blog_read_front_matter_value "$draft_file" "$draft_key"
}

blog_draft_read_content() {
  draft_id=${1-}
  [ -n "$draft_id" ] || return 1
  draft_file=$(blog_draft_resolve_file_path "$draft_id" 2>/dev/null || printf '')
  [ -n "$draft_file" ] || return 1
  blog_read_markdown_body "$draft_file"
}

blog_draft_exists() {
  [ -n "$(blog_draft_resolve_file_path "$1" 2>/dev/null || printf '')" ]
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
  post_type=${10-longform}
  source_post_path=${11-}
  post_filename=${12-}
  origin_platforms_json=${13-[]}

  draft_file=$(blog_draft_file_path "$draft_id")
  mkdir -p "$blog_drafts_dir"

  created=$(blog_read_front_matter_value "$draft_file" created_at 2>/dev/null || printf '')
  if [ -z "$created" ]; then
    created=$(blog_now_iso)
  fi

  normalized_tags=$(blog_normalize_tags "$tags")
  normalized_post_type=$(blog_normalize_post_type "$post_type")
  if [ "$normalized_post_type" = "shortform" ]; then
    title=''
  fi
  slug_seed=$(blog_slug_seed_text "$title" "$content" "$normalized_post_type")
  slug=$(blog_slugify "$slug_seed")
  if [ -n "$post_filename" ]; then
    normalized_post_filename=$(blog_normalize_post_filename "$post_filename" 2>/dev/null || printf '')
    if [ -n "$normalized_post_filename" ]; then
      slug="$normalized_post_filename"
      post_filename="$normalized_post_filename"
    fi
  elif [ -n "$source_post_path" ]; then
    inferred_post_filename=$(blog_normalize_post_filename "$source_post_path" 2>/dev/null || printf '')
    if [ -n "$inferred_post_filename" ]; then
      slug="$inferred_post_filename"
      post_filename="$inferred_post_filename"
    fi
  fi
  now_iso=$(blog_now_iso)
  blog_write_draft_markdown "$draft_file" "$draft_id" "$title" "$slug" "$normalized_tags" "$summary" "$author" "$publish_mode" "$scheduled_at" "$status" "$created" "$now_iso" "$content" "$normalized_post_type" "$source_post_path" "$post_filename" "$origin_platforms_json"
  blog_file_sync_draft_refs "$draft_id" "$content"
}

blog_delete_draft() {
  draft_id=$1
  blog_file_clear_draft_refs "$draft_id"
  draft_file=$(blog_draft_resolve_file_path "$draft_id" 2>/dev/null || printf '')
  if [ -n "$draft_file" ]; then
    rm -f "$draft_file"
    return 0
  fi
  rm -f "$(blog_draft_file_path "$draft_id")"
}

blog_find_draft_files() {
  find "$blog_drafts_dir" -mindepth 1 -maxdepth 1 -type f -name '*.md' 2>/dev/null
}

blog_compute_post_filename() {
  title=${1-}
  content=${2-}
  post_type=${3-}
  seed=$(blog_slug_seed_text "$title" "$content" "$post_type")
  slug=$(blog_slugify "$seed")
  base="$slug"
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
  # args: title tags summary content author draft_id publish_mode scheduled_at post_type source_post_path post_filename
  title=$1
  tags=$2
  summary=$3
  content=$4
  author=$5
  draft_id=$6
  publish_mode=$7
  scheduled_at=$8
  post_type=${9-longform}
  source_post_path=${10-}
  post_filename=${11-}
  normalized_post_type=$(blog_normalize_post_type "$post_type")
  if [ "$normalized_post_type" = "shortform" ]; then
    title=''
  fi

  filename=
  post_path=
  current_rel_path=$(blog_normalize_post_source_path "$source_post_path" 2>/dev/null || printf '')
  target_rel_path="$current_rel_path"
  target_filename=$(blog_normalize_post_filename "$post_filename" 2>/dev/null || printf '')
  if [ -n "$target_filename" ]; then
    target_rel_path="posts/${target_filename}.md"
  fi

  old_post_path=""
  old_rel_html=""
  if [ -n "$current_rel_path" ] && [ -n "$target_rel_path" ] && [ "$current_rel_path" != "$target_rel_path" ]; then
    old_post_path="$blog_site_root/site/pages/$current_rel_path"
    old_rel_html=${current_rel_path%.md}.html
  fi

  if [ -n "$target_rel_path" ]; then
    post_path="$blog_site_root/site/pages/$target_rel_path"
    filename=${target_rel_path##*/}
    if [ -f "$post_path" ] && { [ -z "$current_rel_path" ] || [ "$target_rel_path" != "$current_rel_path" ]; }; then
      return 1
    fi
  else
    filename=$(blog_compute_post_filename "$title" "$content" "$normalized_post_type")
    post_path="$blog_posts_dir/$filename"
  fi
  now_iso=$(blog_now_iso)
  normalized_tags=$(blog_normalize_tags "$tags")
  tags_yaml=$(blog_tags_to_yaml_array "$normalized_tags")
  content_hash=$(printf '%s' "$content" | blog_sha256)
  mkdir -p "$(dirname "$post_path")"

  {
    printf '%s\n' '---'
    printf 'title: "%s"\n' "$(blog_yaml_escape "$title")"
    printf 'published_at: "%s"\n' "$now_iso"
    printf 'content_hash: "%s"\n' "$content_hash"
    printf 'tags: %s\n' "$tags_yaml"
    printf 'post_type: "%s"\n' "$(blog_yaml_escape "$normalized_post_type")"
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

  if [ -n "$old_post_path" ] && [ "$old_post_path" != "$post_path" ] && [ -f "$old_post_path" ]; then
    rm -f "$old_post_path"
    if [ -n "$old_rel_html" ]; then
      rm -f "$blog_site_root/build/pages/$old_rel_html" 2>/dev/null || true
    fi
  fi

  rel_post_path=${post_path#"$blog_site_root/site/pages/"}
  blog_file_promote_refs_to_post "$draft_id" "$content" "$rel_post_path"

  printf '%s\n' "$filename"
}

blog_publish_content_nostr() {
  # args: title tags summary content author draft_id publish_mode scheduled_at post_type source_post_path post_filename
  title=$1
  tags=$2
  summary=$3
  content=$4
  _author=$5
  draft_id=$6
  _publish_mode=$7
  _scheduled_at=$8
  _post_type=${9-}
  source_post_path=${10-}
  post_filename=${11-}

  published_iso=$(blog_now_iso)
  event_json=$(blog_nostr_sign_post_event "$title" "$tags" "$summary" "$content" "$published_iso" "$_post_type" "$source_post_path" "$post_filename" 2>/dev/null || printf '')
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

  if ! blog_nostr_publish_and_store_event_json "$event_json" >/dev/null 2>&1; then
    return 1
  fi
  blog_nostr_rebuild_derived >/dev/null 2>&1 || true
  blog_nostr_mark_content_files_public "$content" "$draft_id"

  slug=$(blog_slugify "$d_tag")
  printf '%s.md\n' "$slug"
}

blog_publish_content() {
  # args: title tags summary content author draft_id publish_mode scheduled_at post_type source_post_path
  out=$(blog_publish_content_markdown "$@")
  BLOG_PUBLISH_LAST_MODE="local"
  printf '%s\n' "$out"
  return 0
}

blog_resolve_wizardry_dir() {
  wizardry_dir=${WIZARDRY_DIR-}
  if [ -n "$wizardry_dir" ] && [ -x "$wizardry_dir/spells/web/build" ]; then
    printf '%s\n' "$wizardry_dir"
    return 0
  fi
  if [ -n "${HOME-}" ] && [ -x "$HOME/.wizardry/spells/web/build" ]; then
    printf '%s\n' "$HOME/.wizardry"
    return 0
  fi
  web_wizardry_bin=$(command -v web-wizardry 2>/dev/null || printf '')
  if [ -n "$web_wizardry_bin" ]; then
    wizardry_dir=$(CDPATH= cd -- "$(dirname "$web_wizardry_bin")/../.." 2>/dev/null && pwd -P)
    if [ -n "$wizardry_dir" ] && [ -x "$wizardry_dir/spells/web/build" ]; then
      printf '%s\n' "$wizardry_dir"
      return 0
    fi
  fi
  return 1
}

blog_wizardry_exec_path() {
  wizardry_dir=${1-}
  wizardry_path=${PATH-}
  wizardry_path="$wizardry_path:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  if [ -n "$wizardry_dir" ] && [ -d "$wizardry_dir/spells" ]; then
    if [ -d "$wizardry_dir/spells/.wizardry" ]; then
      wizardry_path="$wizardry_dir/spells/.wizardry:$wizardry_path"
    fi
    if [ -d "$wizardry_dir/spells/.imps" ]; then
      for dir in "$wizardry_dir/spells/.imps"/* "$wizardry_dir/spells/.imps"/.*; do
        [ -d "$dir" ] || continue
        case "$dir" in
          */.|*/..) continue ;;
        esac
        wizardry_path="$dir:$wizardry_path"
      done
    fi
    for dir in "$wizardry_dir/spells"/* "$wizardry_dir/spells"/.*; do
      [ -d "$dir" ] || continue
      case "$dir" in
        */.|*/..) continue ;;
      esac
      wizardry_path="$dir:$wizardry_path"
    done
  fi
  printf '%s\n' "$wizardry_path"
}

blog_fix_build_page_permissions() {
  build_dir="$blog_site_root/build"
  pages_dir="$build_dir/pages"
  if [ -d "$pages_dir" ]; then
    find "$pages_dir" -type f -name '*.html' ! -name '._*' -exec chmod 644 {} + >/dev/null 2>&1 || true
  fi
  if [ -d "$build_dir" ]; then
    find "$build_dir" -maxdepth 1 -type f \( -name '*.xml' -o -name 'robots.txt' -o -name '.wizardry-build-stamp' \) -exec chmod 644 {} + >/dev/null 2>&1 || true
  fi
}

blog_run_build_async() {
  wizardry_dir=$(blog_resolve_wizardry_dir 2>/dev/null || printf '')
  if [ -z "$wizardry_dir" ]; then
    return 0
  fi
  wizardry_path=$(blog_wizardry_exec_path "$wizardry_dir")

  if command -v nohup >/dev/null 2>&1; then
    (
      env PATH="$wizardry_path" WEB_WIZARDRY_ROOT="$blog_sites_dir" WIZARDRY_DIR="$wizardry_dir" nohup "$wizardry_dir/spells/web/build" "$blog_site_name" >/dev/null 2>&1 </dev/null || true
      blog_fix_build_page_permissions >/dev/null 2>&1 || true
    ) >/dev/null 2>&1 &
    return 0
  fi

  (
    env PATH="$wizardry_path" WEB_WIZARDRY_ROOT="$blog_sites_dir" WIZARDRY_DIR="$wizardry_dir" "$wizardry_dir/spells/web/build" "$blog_site_name" >/dev/null 2>&1 </dev/null || true
    blog_fix_build_page_permissions >/dev/null 2>&1 || true
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

  blog_find_draft_files | while IFS= read -r draft_file; do
    mode=$(blog_read_front_matter_value "$draft_file" publish_mode 2>/dev/null || printf 'draft')
    status=$(blog_read_front_matter_value "$draft_file" status 2>/dev/null || printf 'draft')
    draft_id=$(blog_read_front_matter_value "$draft_file" draft_id 2>/dev/null || printf '')
    if [ "$mode" = "scheduled" ] && [ "$status" = "scheduled" ] && [ -n "$draft_id" ]; then
      at=$(blog_read_front_matter_value "$draft_file" scheduled_at 2>/dev/null || printf '')
      at_epoch=$(blog_iso_to_epoch "$at")
      if [ "$at_epoch" -gt 0 ] && [ "$at_epoch" -le "$now_epoch" ]; then
        printf 'scheduled|%s|%s\n' "$at_epoch" "$draft_id"
      fi
    fi
  done | sort -t'|' -k2,2n > "$due_file"

  if [ -s "$due_file" ]; then
    while IFS='|' read -r _ at_epoch draft_id; do
      draft_file=$(blog_draft_resolve_file_path "$draft_id" 2>/dev/null || printf '')
      [ -f "$draft_file" ] || continue

      title=$(blog_read_front_matter_value "$draft_file" title 2>/dev/null || printf 'Untitled')
      tags=$(blog_read_front_matter_value "$draft_file" tags 2>/dev/null || printf '')
      summary=$(blog_read_front_matter_value "$draft_file" summary 2>/dev/null || printf '')
      author=$(blog_read_front_matter_value "$draft_file" author 2>/dev/null || printf '')
      post_type=$(blog_read_front_matter_value "$draft_file" post_type 2>/dev/null || printf '')
      post_filename=$(blog_read_front_matter_value "$draft_file" post_filename 2>/dev/null || printf '')
      source_post_path=$(blog_read_front_matter_value "$draft_file" source_post_path 2>/dev/null || printf '')
      author=$(blog_author_display_name "$author")
      if [ -z "$author" ]; then
        author='author'
      fi
      content=$(blog_read_markdown_body "$draft_file" 2>/dev/null || printf '')
      if ! published_file=$(blog_publish_content "$title" "$tags" "$summary" "$content" "$author" "$draft_id" scheduled "$now_iso" "$post_type" "$source_post_path" "$post_filename"); then
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
    blog_find_draft_files | while IFS= read -r draft_file; do
      mode=$(blog_read_front_matter_value "$draft_file" publish_mode 2>/dev/null || printf 'draft')
      status=$(blog_read_front_matter_value "$draft_file" status 2>/dev/null || printf 'draft')
      draft_id=$(blog_read_front_matter_value "$draft_file" draft_id 2>/dev/null || printf '')
      if [ "$mode" = "drip" ] && [ "$status" = "queued" ] && [ -n "$draft_id" ]; then
        created=$(blog_read_front_matter_value "$draft_file" created_at 2>/dev/null || printf '')
        created_epoch=$(blog_iso_to_epoch "$created")
        printf '%s|%s\n' "$created_epoch" "$draft_id"
      fi
    done | sort -t'|' -k1,1n > "$drip_file"

    if [ -s "$drip_file" ]; then
      first=$(head -n 1 "$drip_file")
      draft_id=${first#*|}
      draft_file=$(blog_draft_resolve_file_path "$draft_id" 2>/dev/null || printf '')
      if [ -f "$draft_file" ]; then
        title=$(blog_read_front_matter_value "$draft_file" title 2>/dev/null || printf 'Untitled')
        tags=$(blog_read_front_matter_value "$draft_file" tags 2>/dev/null || printf '')
        summary=$(blog_read_front_matter_value "$draft_file" summary 2>/dev/null || printf '')
        author=$(blog_read_front_matter_value "$draft_file" author 2>/dev/null || printf '')
        post_type=$(blog_read_front_matter_value "$draft_file" post_type 2>/dev/null || printf '')
        post_filename=$(blog_read_front_matter_value "$draft_file" post_filename 2>/dev/null || printf '')
        source_post_path=$(blog_read_front_matter_value "$draft_file" source_post_path 2>/dev/null || printf '')
        author=$(blog_author_display_name "$author")
        if [ -z "$author" ]; then
          author='author'
        fi
        content=$(blog_read_markdown_body "$draft_file" 2>/dev/null || printf '')
        if ! published_file=$(blog_publish_content "$title" "$tags" "$summary" "$content" "$author" "$draft_id" drip "" "$post_type" "$source_post_path" "$post_filename"); then
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

blog_public_posts_catalog_static_path() {
  printf '%s/site/static/public-posts.json\n' "$blog_site_root"
}

blog_public_posts_catalog_cache_path() {
  printf '%s/public-posts-cache.json\n' "$blog_state_dir"
}

blog_public_posts_catalog_build_json() {
  posts_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-posts.XXXXXX")
  comment_counts_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-post-comments.XXXXXX")
  json_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-posts-json.XXXXXX")

  blog_collect_public_posts "$posts_tmp"
  blog_nostr_comment_counts_build "$comment_counts_tmp"

  {
    printf '{"success":true,"posts":['
    first=1
    while IFS= read -r file || [ -n "$file" ]; do
      [ -n "$file" ] || continue
      [ -f "$file" ] || continue

      rel=${file#"$blog_site_root/site/pages/"}
      case "$rel" in
        posts/*.md) ;;
        *) continue ;;
      esac

      title=$(blog_read_front_matter_value "$file" title 2>/dev/null || printf '')
      author=$(blog_post_author_display_for_file "$file")
      published_at=$(blog_read_front_matter_value "$file" published_at 2>/dev/null || printf '')
      published_date=$(blog_iso_to_human_date "$published_at")
      body=$(blog_read_markdown_body "$file" 2>/dev/null || printf '')
      summary=$(blog_condensed_preview_from_content "$body")
      summary_truncated=$(blog_condensed_preview_truncated "$body")
      word_count=$(blog_word_count "$body")
      reading_minutes=$(blog_estimated_read_minutes "$word_count")
      post_type=$(blog_read_front_matter_value "$file" post_type 2>/dev/null || printf '')
      if [ -z "$post_type" ]; then
        post_type=$(blog_read_front_matter_value "$file" type 2>/dev/null || printf '')
      fi
      if [ -z "$post_type" ]; then
        post_type='post'
      fi
      post_type=$(printf '%s' "$post_type" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g; s/-\{2,\}/-/g; s/^-//; s/-$//')
      if [ -z "$post_type" ]; then
        post_type='post'
      fi
      title=$(blog_effective_post_title "$title" "$body" "$post_type")

      tags_raw=$(blog_read_front_matter_value "$file" tags 2>/dev/null || printf '')
      tags_csv=$(printf '%s' "$tags_raw" | sed "s/^\[//;s/\]$//;s/\"//g;s/'//g")
      tags=$(blog_normalize_tags "$tags_csv")

      rel_slug_raw=${rel#posts/}
      rel_slug_raw=${rel_slug_raw%.md}
      rel_slug=$(blog_public_post_slug_from_rel "$rel_slug_raw" 2>/dev/null || printf '%s' "$rel_slug_raw")
      url=$(blog_rel_post_html_url "$file")
      public_path="posts/${rel_slug}"
      post_address=$(blog_post_nostr_address_for_file "$file")
      comment_count=$(blog_nostr_comment_count_lookup "$comment_counts_tmp" "$post_address")
      pub_date=${published_at%%T*}
      year=$(printf '%s' "$pub_date" | cut -c1-4)
      case "$year" in ''|*[!0-9]*) year='Unknown' ;; esac

      nostr_projection=$(blog_read_front_matter_value "$file" nostr_projection 2>/dev/null || printf 'false')
      source='local'
      case "$nostr_projection" in
        true|1|yes|on) source='nostr' ;;
      esac

      if [ "$first" -eq 0 ]; then
        printf ','
      fi
      first=0

      jq -cn \
        --arg path "$public_path" \
        --arg url "$url" \
        --arg title "$title" \
        --arg author "$author" \
        --arg published_at "$published_at" \
        --arg published_date "$published_date" \
        --arg pub_date "$pub_date" \
        --arg summary "$summary" \
        --argjson summary_truncated "$summary_truncated" \
        --arg post_type "$post_type" \
        --arg year "$year" \
        --arg source "$source" \
        --arg tags_csv "$tags" \
        --argjson word_count "$word_count" \
        --argjson reading_minutes "$reading_minutes" \
        --argjson comment_count "${comment_count:-0}" \
        '{
          path: $path,
          url: $url,
          title: $title,
          author: $author,
          published_at: $published_at,
          published_date: $published_date,
          pub_date: $pub_date,
          summary: $summary,
          summary_truncated: $summary_truncated,
          type: $post_type,
          year: $year,
          source: $source,
          word_count: $word_count,
          reading_minutes: $reading_minutes,
          tags: ($tags_csv | split(",") | map(gsub("^\\s+|\\s+$"; "") | select(length > 0))),
          comment_count: $comment_count
        }'
    done < "$posts_tmp"
    printf ']}'
    printf '\n'
  } > "$json_tmp"

  cat "$json_tmp"
  rm -f "$posts_tmp" "$comment_counts_tmp" "$json_tmp"
}

blog_public_posts_catalog_write_artifacts() {
  catalog_json=$(blog_public_posts_catalog_build_json)
  static_path=$(blog_public_posts_catalog_static_path)
  cache_path=$(blog_public_posts_catalog_cache_path)
  static_dir=$(dirname "$static_path")
  mkdir -p "$static_dir"

  static_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-posts-static.XXXXXX")
  printf '%s\n' "$catalog_json" > "$static_tmp"
  mv "$static_tmp" "$static_path"
  chmod 644 "$static_path" 2>/dev/null || true

  cache_tmp=$(mktemp "${TMPDIR:-/tmp}/blog-public-posts-cache.XXXXXX")
  printf '%s\n' "$catalog_json" > "$cache_tmp"
  mv "$cache_tmp" "$cache_path"
  chmod 644 "$cache_path" 2>/dev/null || true
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

blog_rel_post_url() {
  file=$1
  rel=$(blog_post_rel_path_for_file "$file" 2>/dev/null || printf '')
  if [ -z "$rel" ]; then
    rel=${file#"$blog_posts_dir/"}
  fi
  rel=${rel#posts/}
  rel_slug_raw=${rel%.md}
  rel_slug=$(blog_public_post_slug_from_rel "$rel_slug_raw" 2>/dev/null || printf '%s' "$rel_slug_raw")
  # Canonical public post URLs are pretty extensionless paths.
  printf '/posts/%s\n' "$rel_slug"
}

blog_rel_post_html_url() {
  # Backward-compatible helper name; canonical post URLs are extensionless.
  blog_rel_post_url "$1"
}
