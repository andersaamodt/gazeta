use crate::resolved_site_data_dir;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct CgiResponse {
    pub content_type: &'static str,
    pub body: String,
}

impl CgiResponse {
    pub fn json(value: Value) -> Self {
        Self {
            content_type: "application/json",
            body: serde_json::to_string(&value).unwrap_or_else(|_| {
                "{\"success\":false,\"code\":\"json_error\",\"error\":\"Could not encode response.\"}"
                    .to_string()
            }),
        }
    }
}

pub struct ReadError {
    pub code: &'static str,
    pub message: String,
}

impl ReadError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

type Result<T> = std::result::Result<T, ReadError>;

struct SitePaths {
    state_dir: PathBuf,
}

impl SitePaths {
    fn from_env() -> Result<Self> {
        let sites_dir = env_path("WIZARDRY_SITES_DIR").ok_or_else(|| {
            ReadError::new("config_missing", "WIZARDRY_SITES_DIR is not configured.")
        })?;
        let sites_data_dir =
            env_path("WIZARDRY_SITES_DATA_DIR").unwrap_or_else(|| sites_dir.join(".sitedata"));
        let site_name = env::var("WIZARDRY_SITE_NAME").map_err(|_| {
            ReadError::new("config_missing", "WIZARDRY_SITE_NAME is not configured.")
        })?;
        let site_root = sites_dir.join(&site_name);
        let default_sites_data_dir = sites_dir.join(".sitedata");
        Ok(Self {
            state_dir: resolved_site_data_dir(
                &site_root,
                &sites_data_dir,
                &default_sites_data_dir,
                &site_name,
            ),
        })
    }

    fn lists_dir(&self) -> PathBuf {
        self.state_dir.join("lists")
    }

    fn nostr_events_dir(&self) -> PathBuf {
        self.state_dir.join("nostr/events")
    }

    fn nostr_pages_config(&self) -> PathBuf {
        self.state_dir.join("nostr-pages.json")
    }

    fn sessions_dir(&self) -> PathBuf {
        self.state_dir.join("ssh-auth/sessions")
    }

    fn users_dir(&self) -> PathBuf {
        self.state_dir.join("ssh-auth/users")
    }
}

pub fn run_action(action: &str) -> Result<CgiResponse> {
    match action {
        "blog-list-pages" => blog_list_pages().map(CgiResponse::json),
        _ => Err(ReadError::new(
            "bad_action",
            "Unknown Gazeta admin read action.",
        )),
    }
}

fn blog_list_pages() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    require_admin_session(&paths)?;

    let mut slugs = BTreeSet::new();
    let mut non_list_slugs = BTreeSet::new();
    let mut event_titles = BTreeMap::new();

    for entry in fs::read_dir(paths.lists_dir())
        .into_iter()
        .flatten()
        .flatten()
    {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
            slugs.insert(normalize_list_slug(stem));
        }
    }

    for event in list_events(&paths.nostr_events_dir(), &[30004, 30267]) {
        let slug = match tag_value(&event, "d").map(|value| normalize_list_slug(&value)) {
            Some(slug) if !slug.is_empty() => slug,
            _ => continue,
        };
        slugs.insert(slug.clone());
        if let Some(title) = tag_value(&event, "title").filter(|title| !title.is_empty()) {
            let created_at = event.get("created_at").and_then(Value::as_i64).unwrap_or(0);
            let id = event.get("id").and_then(Value::as_str).unwrap_or_default();
            event_titles
                .entry(slug)
                .and_modify(|existing: &mut (i64, String, String)| {
                    if (created_at, id) > (existing.0, existing.1.as_str()) {
                        *existing = (created_at, id.to_string(), title.clone());
                    }
                })
                .or_insert_with(|| (created_at, id.to_string(), title));
        }
    }

    if slugs.is_empty() {
        slugs.insert("list".to_string());
    }

    if let Some(config) = read_json(&paths.nostr_pages_config()) {
        for page in normalized_pages(&config) {
            let slug = match page.get("slug").and_then(Value::as_str) {
                Some(slug) => normalize_list_slug(slug),
                None => continue,
            };
            if page_type(page.get("type").and_then(Value::as_str)) == "list" {
                slugs.insert(slug);
            } else {
                non_list_slugs.insert(slug);
            }
        }
    }

    let lists: Vec<Value> = slugs
        .into_iter()
        .filter(|slug| !non_list_slugs.contains(slug))
        .map(|slug| {
            let title = draft_title(&paths, &slug)
                .or_else(|| event_titles.get(&slug).map(|(_, _, title)| title.clone()))
                .unwrap_or_else(|| slug.replace('-', " "));
            json!({"slug": slug, "title": title})
        })
        .collect();

    Ok(json!({"success": true, "lists": lists}))
}

fn require_admin_session(paths: &SitePaths) -> Result<()> {
    let request = RequestParams::from_env_and_stdin();
    let token = request.value("session_token").unwrap_or_default();
    let csrf = request.value("csrf_token").unwrap_or_default();
    if !is_hex_len(&token, 48) {
        return Err(ReadError::new("auth_required", "Not authenticated"));
    }
    let session_path = paths.sessions_dir().join(format!("{token}.conf"));
    let session = read_config(&session_path)
        .ok_or_else(|| ReadError::new("auth_required", "Not authenticated"))?;
    let username = config_string(&session, "username");
    let session_csrf = config_string(&session, "csrf_token");
    if username.is_empty() || session_csrf.is_empty() {
        return Err(ReadError::new("auth_required", "Not authenticated"));
    }
    if csrf.is_empty() || csrf != session_csrf {
        return Err(ReadError::new("csrf_invalid", "Invalid CSRF token"));
    }
    let expires_at = config_string(&session, "expires_at")
        .parse::<u64>()
        .unwrap_or(0);
    if expires_at <= now_epoch() {
        let _ = fs::remove_file(&session_path);
        return Err(ReadError::new("auth_required", "Not authenticated"));
    }
    if !user_is_admin(paths, &username) && config_string(&session, "is_admin") != "true" {
        return Err(ReadError::new(
            "admin_required",
            "Admin permission required",
        ));
    }
    Ok(())
}

struct RequestParams {
    query: String,
    body: String,
    body_is_json: bool,
}

impl RequestParams {
    fn from_env_and_stdin() -> Self {
        let query = env::var("QUERY_STRING").unwrap_or_default();
        let method = env::var("REQUEST_METHOD").unwrap_or_else(|_| "GET".to_string());
        let content_type = env::var("CONTENT_TYPE").unwrap_or_default();
        let mut body = String::new();
        if method == "POST" {
            let length = env::var("CONTENT_LENGTH")
                .ok()
                .and_then(|value| value.parse::<usize>().ok())
                .unwrap_or(0);
            if length > 0 {
                let mut limited = io::stdin().take(length as u64);
                let _ = limited.read_to_string(&mut body);
            }
        }
        let body_is_json = content_type.starts_with("application/json")
            || content_type.starts_with("text/plain")
            || body.trim_start().starts_with('{');
        Self {
            query,
            body,
            body_is_json,
        }
    }

    fn value(&self, key: &str) -> Option<String> {
        let mut value = lookup_url_param(&self.query, key);
        if !self.body.is_empty() {
            let body_value = if self.body_is_json {
                serde_json::from_str::<Value>(&self.body)
                    .ok()
                    .and_then(|body| body.get(key).cloned())
                    .and_then(|value| match value {
                        Value::String(text) => Some(text),
                        Value::Null => None,
                        other => Some(other.to_string()),
                    })
            } else {
                lookup_url_param(&self.body, key)
            };
            if body_value
                .as_deref()
                .is_some_and(|body_value| !body_value.is_empty())
            {
                value = body_value;
            }
        }
        value
    }
}

fn user_is_admin(paths: &SitePaths, username: &str) -> bool {
    if username.is_empty() {
        return false;
    }
    if user_is_admin_direct(paths, username) {
        return true;
    }
    let profile = user_profile(paths, username);
    let fingerprint = read_config(&profile)
        .map(|config| config_string(&config, "fingerprint"))
        .unwrap_or_default();
    if fingerprint.is_empty() {
        return false;
    }
    for entry in fs::read_dir(paths.users_dir())
        .into_iter()
        .flatten()
        .flatten()
    {
        let alt_profile = entry.path().join("profile.conf");
        let Some(config) = read_config(&alt_profile) else {
            continue;
        };
        let alt_user = config_string(&config, "username");
        if alt_user.is_empty() || alt_user == username {
            continue;
        }
        if config_string(&config, "fingerprint") == fingerprint
            && user_is_admin_direct(paths, &alt_user)
        {
            return true;
        }
    }
    false
}

fn user_is_admin_direct(paths: &SitePaths, username: &str) -> bool {
    read_config(&user_profile(paths, username))
        .map(|config| config_string(&config, "is_admin") == "true")
        .unwrap_or(false)
}

fn user_profile(paths: &SitePaths, username: &str) -> PathBuf {
    paths.users_dir().join(username).join("profile.conf")
}

fn read_config(path: &Path) -> Option<BTreeMap<String, String>> {
    let text = fs::read_to_string(path).ok()?;
    let mut config = BTreeMap::new();
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        config.insert(key.to_string(), value.to_string());
    }
    Some(config)
}

fn config_string(config: &BTreeMap<String, String>, key: &str) -> String {
    config.get(key).cloned().unwrap_or_default()
}

fn draft_title(paths: &SitePaths, slug: &str) -> Option<String> {
    let path = paths.lists_dir().join(format!("{slug}.json"));
    read_json(&path)
        .and_then(|value| {
            value
                .get("title")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .filter(|title| !title.is_empty())
}

fn normalized_pages(config: &Value) -> Vec<&Value> {
    match config {
        Value::Object(object) => object
            .get("pages")
            .and_then(Value::as_array)
            .map(|pages| pages.iter().collect())
            .unwrap_or_default(),
        Value::Array(pages) => pages.iter().collect(),
        _ => Vec::new(),
    }
}

fn page_type(raw: Option<&str>) -> &'static str {
    match raw.unwrap_or("list").to_ascii_lowercase().as_str() {
        "contact" => "contact",
        "public-ranking" | "public_ranking" | "ranking" => "public-ranking",
        "overworld" | "overworld-game" | "overworld_game" => "overworld",
        "software-gallery" | "software_gallery" | "software" => "software-gallery",
        "icon-gallery" | "icon_gallery" | "gallery" => "icon-gallery",
        "blog" | "blog-index" | "blog_index" => "blog",
        "nip23" | "article" | "document" => "nip23",
        _ => "list",
    }
}

fn list_events(events_dir: &Path, kinds: &[i64]) -> Vec<Value> {
    let mut events = Vec::new();
    collect_list_events(events_dir, kinds, &mut events);
    events
}

fn collect_list_events(path: &Path, kinds: &[i64], events: &mut Vec<Value>) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.is_dir() {
        for entry in fs::read_dir(path).into_iter().flatten().flatten() {
            collect_list_events(&entry.path(), kinds, events);
        }
        return;
    }
    if path.extension().and_then(|value| value.to_str()) != Some("json") {
        return;
    }
    let Some(parent_kind) = path
        .parent()
        .and_then(Path::file_name)
        .and_then(|value| value.to_str())
        .and_then(|value| value.parse::<i64>().ok())
    else {
        return;
    };
    if !kinds.contains(&parent_kind) {
        return;
    }
    if let Some(event) = read_json(path).filter(|event| {
        event
            .get("kind")
            .and_then(Value::as_i64)
            .is_some_and(|kind| kinds.contains(&kind))
    }) {
        events.push(event);
    }
}

fn tag_value(event: &Value, name: &str) -> Option<String> {
    event
        .get("tags")
        .and_then(Value::as_array)?
        .iter()
        .find_map(|tag| {
            let tag = tag.as_array()?;
            (tag.first().and_then(Value::as_str) == Some(name))
                .then(|| tag.get(1).and_then(Value::as_str).map(ToString::to_string))
                .flatten()
        })
}

fn normalize_list_slug(raw: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for byte in raw.bytes() {
        let normalized = match byte {
            b'a'..=b'z' | b'0'..=b'9' => byte as char,
            b'A'..=b'Z' => byte.to_ascii_lowercase() as char,
            b'-' => '-',
            _ => '-',
        };
        if normalized == '-' {
            if !previous_dash && !slug.is_empty() {
                slug.push('-');
            }
            previous_dash = true;
        } else {
            slug.push(normalized);
            previous_dash = false;
        }
    }
    while slug.ends_with('-') {
        slug.pop();
    }
    if slug.is_empty() {
        "list".to_string()
    } else {
        slug
    }
}

fn lookup_url_param(source: &str, key: &str) -> Option<String> {
    source
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find_map(|(candidate, value)| (candidate == key).then(|| percent_decode(value)))
}

fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                if let Some(value) = hex_pair(bytes[i + 1], bytes[i + 2]) {
                    out.push(value);
                    i += 3;
                } else {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
            byte => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_pair(high: u8, low: u8) -> Option<u8> {
    Some(hex_value(high)? * 16 + hex_value(low)?)
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn is_hex_len(value: &str, len: usize) -> bool {
    value.len() == len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn read_json(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}
