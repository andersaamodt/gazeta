use crate::action_registry::{action_allowed, RuntimeDomain};
use crate::admin_security::{require_admin_session as require_admin_session_shared, RequestParams};
pub use crate::runtime_types::CgiResponse;
use crate::runtime_types::RuntimeError;
use crate::site_runtime::{
    env_path, looks_like_git_checkout, resolve_generated_root, resolve_site_identity,
    resolve_sites_data_dir, resolve_state_dir,
};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use mime_guess::MimeGuess;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use time::format_description::FormatItem;
use time::macros::format_description;
use time::OffsetDateTime;

static RFC3339_FORMAT: &[FormatItem<'static>] =
    format_description!("[year]-[month]-[day]T[hour]:[minute]:[second]Z");

pub enum AdminActionResult {
    Response(CgiResponse),
    ExecLegacy { script_path: PathBuf },
}

pub type AdminError = RuntimeError;

type Result<T> = std::result::Result<T, AdminError>;

pub fn run_action(action: &str) -> Result<AdminActionResult> {
    if !action_allowed(RuntimeDomain::Admin, action) {
        return Err(AdminError::new("bad_action", "Unknown Gazeta admin action."));
    }
    match action {
        "blog-manage-post" => {
            blog_manage_post().map(|value| AdminActionResult::Response(CgiResponse::json(value)))
        }
        "blog-upload-media" => {
            blog_upload_media().map(|value| AdminActionResult::Response(CgiResponse::json(value)))
        }
        "blog-save-post"
        | "blog-publish-nostr-page"
        | "blog-video-chat-control"
        | "blog-secure-chat-admin"
        | "blog-payments" => Ok(AdminActionResult::ExecLegacy {
            script_path: legacy_script_path(action)?,
        }),
        _ => Err(AdminError::new(
            "bad_action",
            "Unknown Gazeta admin action.",
        )),
    }
}

fn legacy_script_path(action: &str) -> Result<PathBuf> {
    let repo_root =
        env_path("GAZETA_REPO_ROOT").unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")));
    Ok(repo_root.join("cgi").join(format!("{action}-legacy")))
}

fn blog_manage_post() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let session = require_admin_session(&paths, &request, false)?;
    let _ = session;

    let action = request
        .value("action")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AdminError::new("missing_params", "action and post_path are required"))?;
    let post_path = request
        .value("post_path")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AdminError::new("missing_params", "action and post_path are required"))?;

    let file = resolve_post_markdown_file(&paths, &post_path)
        .ok_or_else(|| AdminError::new("not_found", "Post not found"))?;
    let managed_rel = managed_post_rel_path_for_file(&paths, &file)
        .ok_or_else(|| AdminError::new("invalid_post_path", "Invalid post path"))?;
    let front_matter = read_front_matter(&file);

    match action.as_str() {
        "delete" => {
            if boolish(front_matter.get("nostr_projection").map(String::as_str)) {
                return Err(AdminError::new(
                    "use_hide",
                    "Nostr-projected posts cannot be deleted directly; hide them from this site instead",
                ));
            }
            let rel_post = managed_rel.strip_prefix("posts/").unwrap_or(&managed_rel);
            let html_file = paths
                .generated_build_pages_dir
                .join("posts")
                .join(rel_post.trim_end_matches(".md"))
                .with_extension("html");
            let _ = fs::remove_file(&file);
            let _ = fs::remove_file(&html_file);
            Ok(json!({
                "success": true,
                "message": "Post deleted",
                "post_path": managed_rel,
            }))
        }
        "hide" => {
            let nostr_address =
                post_nostr_address_for_file(&paths, &file, &managed_rel, &front_matter);
            if nostr_address.is_empty() {
                return Err(AdminError::new(
                    "hide_not_supported",
                    "Only Nostr-projected posts can be hidden",
                ));
            }
            append_unique_line(&paths.nostr_hidden_posts_file(), &nostr_address)?;
            let _ = fs::remove_file(&file);
            Ok(json!({
                "success": true,
                "message": "Post hidden from this site",
                "post_path": managed_rel,
            }))
        }
        _ => Err(AdminError::new("invalid_action", "Unknown action")),
    }
}

fn blog_upload_media() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let session = require_admin_session(&paths, &request, true)?;

    let filename = request
        .value("filename")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AdminError::new("invalid_request", "filename and data_base64 are required")
        })?;
    let mime_type = request.value("mime_type").unwrap_or_default();
    let draft_id = request.value("draft_id").unwrap_or_default();
    let mut data_b64 = request.value("data_base64").unwrap_or_default();
    if filename.is_empty() || data_b64.is_empty() {
        return Err(AdminError::new(
            "invalid_request",
            "filename and data_base64 are required",
        ));
    }
    if let Some((_, payload)) = data_b64.split_once("base64,") {
        data_b64 = payload.to_string();
    }
    if data_b64.len() > 28_000_000 {
        return Err(AdminError::new("file_too_large", "Upload too large"));
    }

    fs::create_dir_all(paths.files_dir()).map_err(io_error(
        "file_storage_unavailable",
        "Could not create file storage",
    ))?;
    fs::create_dir_all(paths.file_records_dir()).map_err(io_error(
        "file_storage_unavailable",
        "Could not create file storage",
    ))?;

    let safe_name = unique_storage_name(&paths, &filename);
    let file_id = random_hex(18)?;
    let dest = paths.files_dir().join(&safe_name);
    let bytes = BASE64_STANDARD
        .decode(data_b64.as_bytes())
        .map_err(|_| AdminError::new("decode_error", "Failed to decode upload"))?;
    fs::write(&dest, bytes).map_err(io_error("decode_error", "Failed to decode upload"))?;
    let mut perms = fs::metadata(&dest)
        .map_err(io_error("decode_error", "Failed to decode upload"))?
        .permissions();
    perms.set_mode(0o600);
    let _ = fs::set_permissions(&dest, perms);
    let size_bytes = fs::metadata(&dest)
        .map_err(io_error("decode_error", "Failed to decode upload"))?
        .len();
    let mime_type = if mime_type.is_empty() {
        MimeGuess::from_path(&safe_name)
            .first_raw()
            .unwrap_or("application/octet-stream")
            .to_string()
    } else {
        mime_type
    };
    let now = now_iso()?;
    write_record(
        &paths.file_record_path(&file_id),
        &[
            ("file_id", file_id.as_str()),
            ("storage_rel", safe_name.as_str()),
            ("original_name", filename.as_str()),
            ("safe_name", safe_name.as_str()),
            ("mime_type", mime_type.as_str()),
            ("size_bytes", &size_bytes.to_string()),
            ("created_at", now.as_str()),
            ("updated_at", now.as_str()),
            ("draft_id", draft_id.as_str()),
            ("post_path", ""),
            ("explicit_public", "false"),
        ],
    )?;

    Ok(json!({
        "success": true,
        "file_id": file_id,
        "url": file_public_url(&file_id, &safe_name),
        "filename": safe_name,
        "is_public": false,
        "session_username": session.username,
    }))
}

struct SitePaths {
    state_dir: PathBuf,
    posts_dir: PathBuf,
    posts_store_dir: PathBuf,
    generated_build_pages_dir: PathBuf,
}

impl SitePaths {
    fn from_env() -> Result<Self> {
        let identity = resolve_site_identity(false, "default")
            .map_err(|error| AdminError::new(error.code, error.message))?;
        let default_sites_data_dir = identity.sites_dir.join(".sitedata");
        let sites_data_dir = resolve_sites_data_dir(&identity.sites_dir, &default_sites_data_dir);
        let state_dir = resolve_state_dir(
            &identity.site_root,
            &identity.site_name,
            &sites_data_dir,
            &default_sites_data_dir,
        );
        let generated_root = resolve_generated_root(&identity.site_root, &identity.site_name);
        let posts_dir = if looks_like_git_checkout(&identity.site_root) {
            generated_root.join("pages/posts")
        } else {
            identity.site_root.join("site/pages/posts")
        };
        let posts_store_dir = state_dir.join("content/posts");
        let generated_build_pages_dir = if looks_like_git_checkout(&identity.site_root) {
            generated_root.join("build/pages")
        } else {
            identity.site_root.join("build/pages")
        };
        Ok(Self {
            state_dir,
            posts_dir,
            posts_store_dir,
            generated_build_pages_dir,
        })
    }

    fn users_dir(&self) -> PathBuf {
        self.state_dir.join("ssh-auth/users")
    }

    fn sessions_dir(&self) -> PathBuf {
        self.state_dir.join("ssh-auth/sessions")
    }

    fn files_dir(&self) -> PathBuf {
        self.state_dir.join("files")
    }

    fn file_records_dir(&self) -> PathBuf {
        self.state_dir.join(".files/records")
    }

    fn file_record_path(&self, file_id: &str) -> PathBuf {
        self.file_records_dir().join(format!("{file_id}.conf"))
    }

    fn nostr_hidden_posts_file(&self) -> PathBuf {
        self.state_dir.join("nostr/state/hidden_posts.txt")
    }

    fn nostr_posts_index(&self) -> PathBuf {
        self.state_dir.join("nostr/derived/posts.json")
    }
}

struct Session {
    username: String,
}

fn require_admin_session(
    paths: &SitePaths,
    request: &RequestParams,
    require_interactive: bool,
) -> Result<Session> {
    let session = require_admin_session_shared(
        &paths.sessions_dir(),
        &paths.users_dir(),
        request,
        Some(43_200),
    )
    .map_err(|error| AdminError::new(error.code, error.message))?;
    if require_interactive
        && session.auth_method == "nostr_delegated"
        && session.force_interactive
    {
        return Err(AdminError::new(
            "interactive_signature_required",
            "This action requires direct signer approval. Sign in with Login with Nostr or Use phone signer (QR).",
        ));
    }
    Ok(Session {
        username: session.username,
    })
}

fn resolve_post_markdown_file(paths: &SitePaths, raw: &str) -> Option<PathBuf> {
    let mut requested = raw.trim().trim_start_matches('/').to_string();
    if let Some(stripped) = requested
        .strip_prefix("http://")
        .or_else(|| requested.strip_prefix("https://"))
    {
        requested = stripped
            .split_once('/')
            .map(|(_, rest)| rest.to_string())
            .unwrap_or_default();
    }
    requested = requested
        .trim_start_matches("cgi/blog-open-post/")
        .trim_start_matches("pages/posts/")
        .trim_start_matches("posts/")
        .to_string();
    if requested.contains("..") || requested.contains('\\') || requested.contains("//") {
        return None;
    }
    let rel_md = if requested.ends_with(".html") {
        format!("{}.md", requested.trim_end_matches(".html"))
    } else if requested.ends_with(".md") {
        requested.clone()
    } else {
        format!("{requested}.md")
    };

    for base in [&paths.posts_dir, &paths.posts_store_dir] {
        let direct = base.join(&rel_md);
        if direct.is_file() {
            return Some(direct);
        }
    }

    let rel_no_ext = rel_md.trim_end_matches(".md");
    let (rel_dir, rel_base) = rel_no_ext
        .rsplit_once('/')
        .map(|(dir, base)| (Some(dir), base))
        .unwrap_or((None, rel_no_ext));
    let canonical_base = strip_post_date_prefix(rel_base);
    for base_root in [&paths.posts_dir, &paths.posts_store_dir] {
        let search_dir = rel_dir
            .map(|dir| base_root.join(dir))
            .unwrap_or_else(|| base_root.to_path_buf());
        let canonical_file = search_dir.join(format!("{canonical_base}.md"));
        if canonical_file.is_file() {
            return Some(canonical_file);
        }
        let Ok(entries) = fs::read_dir(&search_dir) else {
            continue;
        };
        let suffix = format!("-{canonical_base}.md");
        let mut matches: Vec<PathBuf> = entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| {
                path.is_file()
                    && path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .is_some_and(|name| {
                            name.len() >= suffix.len() + 10 && name.ends_with(&suffix)
                        })
            })
            .collect();
        matches.sort();
        if let Some(path) = matches.pop() {
            return Some(path);
        }
    }
    None
}

fn managed_post_rel_path_for_file(paths: &SitePaths, file: &Path) -> Option<String> {
    let canonical = fs::canonicalize(file).ok()?;
    if let Ok(posts_dir) = fs::canonicalize(&paths.posts_dir) {
        if let Ok(rel) = canonical.strip_prefix(&posts_dir) {
            return Some(format!("posts/{}", rel.to_string_lossy()));
        }
    }
    if let Ok(store_dir) = fs::canonicalize(&paths.posts_store_dir) {
        if let Ok(rel) = canonical.strip_prefix(&store_dir) {
            return Some(format!("posts/{}", rel.to_string_lossy()));
        }
    }
    None
}

fn strip_post_date_prefix(slug: &str) -> &str {
    if slug.len() > 11 {
        let prefix = &slug.as_bytes()[..11];
        let valid = prefix[0..4].iter().all(u8::is_ascii_digit)
            && prefix[4] == b'-'
            && prefix[5..7].iter().all(u8::is_ascii_digit)
            && prefix[7] == b'-'
            && prefix[8..10].iter().all(u8::is_ascii_digit)
            && prefix[10] == b'-';
        if valid {
            return &slug[11..];
        }
    }
    slug
}

fn read_front_matter(path: &Path) -> BTreeMap<String, String> {
    let mut values = BTreeMap::new();
    let Ok(text) = fs::read_to_string(path) else {
        return values;
    };
    let mut lines = text.lines();
    if lines.next() != Some("---") {
        return values;
    }
    for line in lines {
        if line == "---" {
            break;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        values.insert(
            key.trim().to_string(),
            value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string(),
        );
    }
    values
}

fn post_nostr_address_for_file(
    paths: &SitePaths,
    file: &Path,
    managed_rel: &str,
    front_matter: &BTreeMap<String, String>,
) -> String {
    if let Some(value) = front_matter
        .get("nostr_address")
        .filter(|value| !value.is_empty())
    {
        return value.clone();
    }
    let pubkey = front_matter
        .get("nostr_pubkey")
        .cloned()
        .unwrap_or_default();
    let kind = front_matter.get("nostr_kind").cloned().unwrap_or_default();
    let dtag = front_matter.get("nostr_d").cloned().unwrap_or_default();
    if !pubkey.is_empty() && !kind.is_empty() && !dtag.is_empty() {
        return format!("{kind}:{pubkey}:{dtag}");
    }
    let _ = file;
    if let Ok(text) = fs::read_to_string(paths.nostr_posts_index()) {
        if let Ok(value) = serde_json::from_str::<Value>(&text) {
            if let Some(address) = value
                .as_array()
                .into_iter()
                .flatten()
                .find(|row| row.get("md_path").and_then(Value::as_str) == Some(managed_rel))
                .and_then(|row| row.get("address").and_then(Value::as_str))
            {
                return address.to_string();
            }
        }
    }
    String::new()
}

fn append_unique_line(path: &Path, value: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(io_error(
            "write_failed",
            "Could not prepare Nostr hidden-posts store",
        ))?;
    }
    let existing = fs::read_to_string(path).unwrap_or_default();
    if existing.lines().any(|line| line == value) {
        return Ok(());
    }
    let mut text = existing;
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(value);
    text.push('\n');
    fs::write(path, text).map_err(io_error(
        "write_failed",
        "Could not update Nostr hidden-posts store",
    ))
}

fn unique_storage_name(paths: &SitePaths, raw_name: &str) -> String {
    let desired = basename_safe(raw_name);
    let candidate = paths.files_dir().join(&desired);
    if !candidate.exists() {
        return desired;
    }
    let (base, ext) = desired
        .rsplit_once('.')
        .map(|(base, ext)| (base.to_string(), format!(".{ext}")))
        .unwrap_or_else(|| (desired.clone(), String::new()));
    let mut n = 2;
    loop {
        let candidate = format!("{base}-{n}{ext}");
        if !paths.files_dir().join(&candidate).exists() {
            return candidate;
        }
        n += 1;
    }
}

fn basename_safe(raw_name: &str) -> String {
    let mut safe = raw_name
        .rsplit('/')
        .next()
        .unwrap_or("file")
        .replace(['\r', '\n', '\t'], " ");
    safe = safe
        .chars()
        .map(|ch| match ch {
            '/' | ':' => '-',
            ch if ch.is_control() => '-',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .to_string();
    if safe.is_empty() || safe == "." || safe == ".." {
        "file".to_string()
    } else {
        safe
    }
}

fn file_public_url(file_id: &str, safe_name: &str) -> String {
    let safe_id = sanitize_public_segment(file_id);
    let safe_part = sanitize_public_segment(safe_name);
    if safe_part.is_empty() {
        format!("/cgi/blog-file/{safe_id}")
    } else {
        format!("/cgi/blog-file/{safe_id}/{safe_part}")
    }
}

fn sanitize_public_segment(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '~' | '-') {
                ch
            } else {
                '-'
            }
        })
        .collect()
}

fn write_record(path: &Path, values: &[(&str, &str)]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(io_error(
            "write_failed",
            "Could not prepare file metadata store",
        ))?;
    }
    let mut text = String::new();
    for (key, value) in values {
        text.push_str(key);
        text.push('=');
        text.push_str(value);
        text.push('\n');
    }
    fs::write(path, text).map_err(io_error("write_failed", "Could not write file metadata"))
}

fn boolish(value: Option<&str>) -> bool {
    matches!(value.unwrap_or_default(), "true" | "1" | "yes" | "on")
}

fn random_hex(bytes: usize) -> Result<String> {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).map_err(|error| {
        AdminError::new(
            "random_failed",
            format!("Could not create random token: {error}"),
        )
    })?;
    let mut out = String::with_capacity(bytes * 2);
    for byte in buf {
        out.push_str(&format!("{byte:02x}"));
    }
    Ok(out)
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn now_iso() -> Result<String> {
    OffsetDateTime::from_unix_timestamp(now_epoch() as i64)
        .map_err(|error| AdminError::new("time_failed", format!("Could not format time: {error}")))?
        .format(RFC3339_FORMAT)
        .map_err(|error| AdminError::new("time_failed", format!("Could not format time: {error}")))
}

fn io_error(code: &'static str, context: &'static str) -> impl FnOnce(io::Error) -> AdminError {
    move |error| AdminError::new(code, format!("{context}: {error}"))
}
