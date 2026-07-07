use crate::action_registry::{action_allowed, RuntimeDomain};
use crate::admin_security::{require_admin_session as require_admin_session_shared, RequestParams};
use crate::config_kv::{config_string, read_config, write_config};
use crate::markdown_content::read_markdown_front_matter;
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
use std::collections::{BTreeMap, HashMap, HashSet};
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

pub type AdminError = RuntimeError;

type Result<T> = std::result::Result<T, AdminError>;

pub fn run_action(action: &str) -> Result<CgiResponse> {
    if !action_allowed(RuntimeDomain::Admin, action) {
        return Err(AdminError::new(
            "bad_action",
            "Unknown Gazeta admin action.",
        ));
    }
    match action {
        "blog-manage-post" => blog_manage_post().map(CgiResponse::json),
        "blog-list-files" => blog_list_files().map(CgiResponse::json),
        "blog-upload-media" => blog_upload_media().map(CgiResponse::json),
        "blog-update-file" => blog_update_file().map(CgiResponse::json),
        "blog-set-file-visibility" => blog_set_file_visibility().map(CgiResponse::json),
        "blog-delete-file" => blog_delete_file().map(CgiResponse::json),
        _ => Err(AdminError::new(
            "bad_action",
            "Unknown Gazeta admin action.",
        )),
    }
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

fn blog_list_files() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    index_untracked_files(&paths)?;
    let mut files = load_file_records(&paths);
    files.sort_by(|left, right| {
        right
            .created_at
            .cmp(&left.created_at)
            .then_with(|| right.file_id.cmp(&left.file_id))
    });

    let files = files
        .into_iter()
        .map(|record| {
            let effective_public = file_is_public_effective(&paths, &record);
            json!({
                "file_id": record.file_id,
                "original_name": record.original_name,
                "safe_name": record.safe_name,
                "mime_type": record.mime_type,
                "size_bytes": record.size_bytes,
                "created_at": record.created_at,
                "draft_id": record.draft_id,
                "post_path": record.post_path,
                "explicit_public": record.explicit_public,
                "effective_public": effective_public,
                "public_path": record.public_path,
                "url": file_public_url_for_record(&paths, &record),
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "success": true,
        "files": files,
    }))
}

fn blog_update_file() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    let file_id = request.value("file_id").unwrap_or_default();
    let record_path = paths.file_record_path(&file_id);
    let mut record = FileRecord::from_path(&record_path)
        .ok_or_else(|| AdminError::new("not_found", "File not found"))?;

    let mut safe_name = request.value("safe_name").unwrap_or_default();
    if safe_name.is_empty() {
        safe_name = record.safe_name.clone();
    }
    safe_name = basename_safe(&safe_name);
    if is_invalid_basename(&safe_name) {
        return Err(AdminError::new("invalid_filename", "Filename is required"));
    }

    let mut original_name = request.value("original_name").unwrap_or_default();
    if original_name.is_empty() {
        original_name = if record.original_name.is_empty() {
            safe_name.clone()
        } else {
            record.original_name.clone()
        };
    }
    original_name = basename_safe(&original_name);
    if is_invalid_basename(&original_name) {
        original_name = safe_name.clone();
    }

    let mut mime_type = request.value("mime_type").unwrap_or_default();
    if mime_type.is_empty() {
        let disk_path = file_disk_path(&paths, &record).unwrap_or_else(|| paths.files_dir());
        mime_type = MimeGuess::from_path(disk_path)
            .first_raw()
            .unwrap_or("application/octet-stream")
            .to_string();
    }
    if !mime_type.contains('/') {
        return Err(AdminError::new(
            "invalid_mime_type",
            "MIME type must look like type/subtype",
        ));
    }
    if mime_type
        .chars()
        .any(|ch| ch.is_whitespace() || ch == '"' || ch == '\'')
    {
        return Err(AdminError::new(
            "invalid_mime_type",
            "MIME type contains invalid characters",
        ));
    }

    let mut public_path = request.value("public_path").unwrap_or_default();
    if !public_path.is_empty() {
        public_path = basename_safe(&public_path);
        if !valid_public_alias(&public_path) {
            return Err(AdminError::new(
                "invalid_public_path",
                "Public path is reserved or invalid",
            ));
        }
    }
    let candidate_public_path = if public_path.is_empty() {
        safe_name.clone()
    } else {
        public_path.clone()
    };
    if valid_public_alias(&candidate_public_path)
        && !public_path_available(&paths, &candidate_public_path, &record.file_id)
    {
        return Err(AdminError::new(
            "public_path_conflict",
            "Another file already uses that public path",
        ));
    }

    let explicit_public = match request
        .value("explicit_public")
        .unwrap_or_default()
        .as_str()
    {
        "true" | "1" | "yes" | "on" => true,
        "false" | "0" | "no" | "off" | "" => false,
        _ => {
            return Err(AdminError::new(
                "invalid_visibility",
                "Invalid visibility value",
            ))
        }
    };

    record.original_name = original_name;
    record.safe_name = safe_name;
    record.mime_type = mime_type;
    record.public_path = public_path;
    record.explicit_public = explicit_public;
    record.updated_at = now_iso()?;
    record.write_to(&record_path)?;
    let _ = sync_public_file_aliases(&paths);

    let effective_public = file_is_public_effective(&paths, &record);
    Ok(json!({
        "success": true,
        "file_id": record.file_id,
        "original_name": record.original_name,
        "safe_name": record.safe_name,
        "mime_type": record.mime_type,
        "public_path": record.public_path,
        "explicit_public": record.explicit_public,
        "effective_public": effective_public,
        "url": file_public_url_for_record(&paths, &record),
    }))
}

fn blog_set_file_visibility() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    let file_id = request.value("file_id").unwrap_or_default();
    let record_path = paths.file_record_path(&file_id);
    let mut record = FileRecord::from_path(&record_path)
        .ok_or_else(|| AdminError::new("not_found", "File not found"))?;

    record.explicit_public = match request.value("make_public").unwrap_or_default().as_str() {
        "true" | "1" | "yes" | "on" => true,
        "false" | "0" | "no" | "off" | "" => false,
        _ => {
            return Err(AdminError::new(
                "invalid_visibility",
                "Invalid visibility value",
            ))
        }
    };
    record.updated_at = now_iso()?;
    record.write_to(&record_path)?;
    let _ = sync_public_file_aliases(&paths);

    let effective_public = file_is_public_effective(&paths, &record);
    Ok(json!({
        "success": true,
        "file_id": record.file_id,
        "explicit_public": record.explicit_public,
        "effective_public": effective_public,
        "url": file_public_url_for_record(&paths, &record),
    }))
}

fn blog_delete_file() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let request = RequestParams::from_env_and_stdin();
    let _session = require_admin_session(&paths, &request, true)?;

    let file_id = request.value("file_id").unwrap_or_default();
    let record_path = paths.file_record_path(&file_id);
    let record = FileRecord::from_path(&record_path)
        .ok_or_else(|| AdminError::new("not_found", "File not found"))?;

    if let Some(path) = file_disk_path(&paths, &record).filter(|path| path.is_file()) {
        let _ = fs::remove_file(path);
    }
    fs::remove_file(&record_path)
        .map_err(io_error("delete_failed", "Failed to delete file metadata"))?;
    let _ = sync_public_file_aliases(&paths);

    Ok(json!({
        "success": true,
        "file_id": record.file_id,
    }))
}

struct SitePaths {
    site_conf: PathBuf,
    pages_dir: PathBuf,
    state_dir: PathBuf,
    build_dir: PathBuf,
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
        let pages_dir = if let Some(path) = env_path("WIZARDRY_PAGES_DIR") {
            path
        } else if looks_like_git_checkout(&identity.site_root) {
            generated_root.join("pages")
        } else {
            identity.site_root.join("site/pages")
        };
        let build_dir = if let Some(path) = env_path("WIZARDRY_BUILD_DIR") {
            path
        } else if looks_like_git_checkout(&identity.site_root) {
            generated_root.join("build")
        } else {
            identity.site_root.join("build")
        };
        let posts_dir = pages_dir.join("posts");
        let posts_store_dir = state_dir.join("content/posts");
        let generated_build_pages_dir = build_dir.join("pages");
        Ok(Self {
            site_conf: identity.site_root.join("site.conf"),
            pages_dir,
            state_dir,
            build_dir,
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
    if require_interactive && session.auth_method == "nostr_delegated" && session.force_interactive
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
    read_markdown_front_matter(path)
        .map(|front_matter| front_matter.parsed)
        .unwrap_or_default()
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

#[derive(Clone, Default)]
struct FileRecord {
    file_id: String,
    storage_rel: String,
    original_name: String,
    safe_name: String,
    mime_type: String,
    size_bytes: String,
    created_at: String,
    updated_at: String,
    draft_id: String,
    post_path: String,
    explicit_public: bool,
    public_path: String,
}

impl FileRecord {
    fn from_path(path: &Path) -> Option<Self> {
        let config = read_config(path)?;
        Some(Self {
            file_id: config_string(&config, "file_id"),
            storage_rel: config_string(&config, "storage_rel"),
            original_name: config_string(&config, "original_name"),
            safe_name: config_string(&config, "safe_name"),
            mime_type: config_string(&config, "mime_type"),
            size_bytes: config_string(&config, "size_bytes"),
            created_at: config_string(&config, "created_at"),
            updated_at: config_string(&config, "updated_at"),
            draft_id: config_string(&config, "draft_id"),
            post_path: config_string(&config, "post_path"),
            explicit_public: boolish(Some(&config_string(&config, "explicit_public"))),
            public_path: config_string(&config, "public_path"),
        })
    }

    fn as_config(&self) -> BTreeMap<String, String> {
        let mut config = BTreeMap::new();
        config.insert("file_id".to_string(), self.file_id.clone());
        config.insert("storage_rel".to_string(), self.storage_rel.clone());
        config.insert("original_name".to_string(), self.original_name.clone());
        config.insert("safe_name".to_string(), self.safe_name.clone());
        config.insert("mime_type".to_string(), self.mime_type.clone());
        config.insert("size_bytes".to_string(), self.size_bytes.clone());
        config.insert("created_at".to_string(), self.created_at.clone());
        config.insert("updated_at".to_string(), self.updated_at.clone());
        config.insert("draft_id".to_string(), self.draft_id.clone());
        config.insert("post_path".to_string(), self.post_path.clone());
        config.insert(
            "explicit_public".to_string(),
            if self.explicit_public {
                "true".to_string()
            } else {
                "false".to_string()
            },
        );
        config.insert("public_path".to_string(), self.public_path.clone());
        config
    }

    fn write_to(&self, path: &Path) -> Result<()> {
        write_config(path, &self.as_config(), "Could not write file metadata")
            .map_err(|error| AdminError::new(error.code, error.message))
    }
}

fn load_file_records(paths: &SitePaths) -> Vec<FileRecord> {
    let mut records = Vec::new();
    for entry in fs::read_dir(paths.file_records_dir())
        .into_iter()
        .flatten()
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("conf") {
            continue;
        }
        if let Some(record) =
            FileRecord::from_path(&path).filter(|record| !record.file_id.is_empty())
        {
            records.push(record);
        }
    }
    records
}

fn index_untracked_files(paths: &SitePaths) -> Result<()> {
    if !paths.files_dir().is_dir() {
        return Ok(());
    }
    let known = load_file_records(paths)
        .into_iter()
        .map(|record| record.storage_rel)
        .collect::<HashSet<_>>();
    for entry in fs::read_dir(paths.files_dir())
        .into_iter()
        .flatten()
        .flatten()
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(storage_rel) = path
            .file_name()
            .and_then(|value| value.to_str())
            .map(ToString::to_string)
        else {
            continue;
        };
        if matches!(
            storage_rel.as_str(),
            ".DS_Store" | ".stfolder" | ".stignore"
        ) {
            continue;
        }
        if known.contains(&storage_rel) {
            continue;
        }
        let size_bytes = fs::metadata(&path)
            .map(|metadata| metadata.len().to_string())
            .unwrap_or_else(|_| "0".to_string());
        let now = now_iso()?;
        let record = FileRecord {
            file_id: unique_file_id(paths)?,
            storage_rel: storage_rel.clone(),
            original_name: storage_rel.clone(),
            safe_name: storage_rel.clone(),
            mime_type: MimeGuess::from_path(&path)
                .first_raw()
                .unwrap_or("application/octet-stream")
                .to_string(),
            size_bytes,
            created_at: now.clone(),
            updated_at: now,
            draft_id: String::new(),
            post_path: String::new(),
            explicit_public: false,
            public_path: String::new(),
        };
        record.write_to(&paths.file_record_path(&record.file_id))?;
        if let Ok(metadata) = fs::metadata(&path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            let _ = fs::set_permissions(&path, perms);
        }
    }
    Ok(())
}

fn unique_file_id(paths: &SitePaths) -> Result<String> {
    loop {
        let candidate = random_hex(18)?;
        if !paths.file_record_path(&candidate).exists() {
            return Ok(candidate);
        }
    }
}

fn file_disk_path(paths: &SitePaths, record: &FileRecord) -> Option<PathBuf> {
    if record.storage_rel.is_empty() {
        None
    } else {
        Some(paths.files_dir().join(&record.storage_rel))
    }
}

fn managed_page_path(paths: &SitePaths, rel: &str) -> Option<PathBuf> {
    let rel = rel.trim().trim_start_matches('/');
    if rel.is_empty() || rel.contains('\\') || rel.contains("//") {
        return None;
    }
    let candidate = Path::new(rel);
    if candidate.is_absolute()
        || candidate
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return None;
    }
    Some(paths.pages_dir.join(candidate))
}

fn file_is_public_effective(paths: &SitePaths, record: &FileRecord) -> bool {
    record.explicit_public
        || managed_page_path(paths, &record.post_path).is_some_and(|path| path.is_file())
}

fn valid_public_alias(path: &str) -> bool {
    if is_invalid_basename(path) {
        return false;
    }
    !matches!(
        path,
        "cgi"
            | "files"
            | "static"
            | "pages"
            | "admin.html"
            | "index.html"
            | "robots.txt"
            | "sitemap.xml"
            | "rss.xml"
            | "atom.xml"
    ) && !path.starts_with('.')
        && !path.contains('/')
        && !path.starts_with("cgi.")
        && !path.starts_with("files.")
        && !path.starts_with("static.")
        && !path.starts_with("pages.")
        && path != "build"
        && !path.starts_with("build.")
}

fn file_public_path(record: &FileRecord) -> Option<String> {
    let candidate = if record.public_path.is_empty() {
        record.safe_name.clone()
    } else {
        record.public_path.clone()
    };
    let candidate = basename_safe(&candidate);
    valid_public_alias(&candidate).then_some(candidate)
}

fn public_path_available(paths: &SitePaths, candidate: &str, current_file_id: &str) -> bool {
    for record in load_file_records(paths) {
        if record.file_id == current_file_id {
            continue;
        }
        if file_public_path(&record).as_deref() == Some(candidate) {
            return false;
        }
    }
    true
}

fn file_public_url_for_record(paths: &SitePaths, record: &FileRecord) -> String {
    if file_is_public_effective(paths, record) {
        if let Some(public_path) = file_public_path(record) {
            if public_path_available(paths, &public_path, &record.file_id) {
                return format!("/{}", percent_encode_path_segment(&public_path));
            }
        }
    }
    file_public_url(&record.file_id, &record.safe_name)
}

fn percent_encode_path_segment(value: &str) -> String {
    let mut out = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'~' | b'-') {
            out.push(*byte as char);
        } else {
            out.push('%');
            out.push_str(&format!("{byte:02X}"));
        }
    }
    out
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum PublicAliasMode {
    Copy,
    Manifest,
    Skip,
}

fn public_alias_mode(paths: &SitePaths) -> PublicAliasMode {
    let raw = env::var("BLOG_PUBLIC_FILE_ALIAS_MODE")
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            read_config(&paths.site_conf)
                .map(|config| config_string(&config, "blog_public_file_alias_mode"))
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| "copy".to_string());
    match raw.as_str() {
        "manifest" => PublicAliasMode::Manifest,
        "skip" => PublicAliasMode::Skip,
        _ => PublicAliasMode::Copy,
    }
}

fn sync_public_file_aliases(paths: &SitePaths) -> Result<()> {
    fs::create_dir_all(&paths.build_dir).map_err(io_error(
        "write_failed",
        "Could not prepare build directory",
    ))?;
    let manifest_path = paths.build_dir.join(".file-aliases.manifest");
    let previous_aliases = read_alias_manifest(&manifest_path);
    let mode = public_alias_mode(paths);
    let records = load_file_records(paths);

    let mut alias_counts = HashMap::new();
    for record in &records {
        if !file_is_public_effective(paths, record) {
            continue;
        }
        let Some(alias) = file_public_path(record) else {
            continue;
        };
        *alias_counts.entry(alias).or_insert(0usize) += 1;
    }

    let mut desired = Vec::new();
    for record in &records {
        if !file_is_public_effective(paths, record) {
            continue;
        }
        let Some(alias) = file_public_path(record) else {
            continue;
        };
        if alias_counts.get(&alias).copied().unwrap_or(0) != 1 {
            continue;
        }
        let Some(source_path) = file_disk_path(paths, record).filter(|path| path.is_file()) else {
            continue;
        };
        desired.push((alias, source_path));
    }
    desired.sort_by(|left, right| left.0.cmp(&right.0));

    let current_aliases = desired
        .iter()
        .map(|(alias, _)| alias.clone())
        .collect::<HashSet<_>>();

    for alias in previous_aliases {
        if !current_aliases.contains(&alias) {
            let _ = fs::remove_file(paths.build_dir.join(alias));
        }
    }

    let mut manifest_lines = Vec::new();
    for (alias, source_path) in desired {
        let dest_path = paths.build_dir.join(&alias);
        match mode {
            PublicAliasMode::Copy => copy_file_alias(&source_path, &dest_path)?,
            PublicAliasMode::Manifest | PublicAliasMode::Skip => {
                let _ = fs::remove_file(&dest_path);
            }
        }
        let metadata = fs::metadata(&source_path).ok();
        let size = metadata.as_ref().map(|value| value.len()).unwrap_or(0);
        let mtime = metadata
            .and_then(|value| value.modified().ok())
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_secs())
            .unwrap_or(0);
        manifest_lines.push(format!(
            "{}\t{}\t{}\t{}",
            alias,
            source_path.display(),
            size,
            mtime
        ));
    }

    let manifest_text = if manifest_lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", manifest_lines.join("\n"))
    };
    fs::write(&manifest_path, manifest_text).map_err(io_error(
        "write_failed",
        "Could not update file alias manifest",
    ))?;

    Ok(())
}

fn copy_file_alias(source_path: &Path, dest_path: &Path) -> Result<()> {
    let tmp_path = dest_path.with_extension("tmp");
    fs::copy(source_path, &tmp_path)
        .map_err(io_error("write_failed", "Could not copy public file alias"))?;
    if let Ok(metadata) = fs::metadata(&tmp_path) {
        let mut perms = metadata.permissions();
        perms.set_mode(0o644);
        let _ = fs::set_permissions(&tmp_path, perms);
    }
    fs::rename(&tmp_path, dest_path).map_err(io_error(
        "write_failed",
        "Could not install public file alias",
    ))
}

fn read_alias_manifest(path: &Path) -> HashSet<String> {
    let Ok(text) = fs::read_to_string(path) else {
        return HashSet::new();
    };
    text.lines()
        .filter_map(|line| line.split('\t').next())
        .filter(|alias| !alias.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn is_invalid_basename(value: &str) -> bool {
    matches!(value, "" | "." | "..")
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
