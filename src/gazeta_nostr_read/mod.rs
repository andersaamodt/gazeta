use serde_json::{json, Map, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

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
    site_root: PathBuf,
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
        Ok(Self {
            site_root: sites_dir.join(&site_name),
            state_dir: sites_data_dir.join(&site_name),
        })
    }

    fn site_conf(&self) -> PathBuf {
        self.site_root.join("site.conf")
    }

    fn nostr_posts_index(&self) -> PathBuf {
        self.state_dir.join("nostr/derived/posts.json")
    }

    fn nostr_comments_index(&self) -> PathBuf {
        self.state_dir.join("nostr/derived/comments.json")
    }

    fn public_posts_catalog_static(&self) -> PathBuf {
        self.site_root.join("site/static/public-posts.json")
    }

    fn public_posts_catalog_cache(&self) -> PathBuf {
        self.state_dir.join("public-posts-cache.json")
    }

    fn nostr_relays_file(&self) -> PathBuf {
        self.state_dir.join("nostr/state/relays")
    }

    fn site_npub_file(&self) -> PathBuf {
        self.state_dir.join("nostr/state/site_npub")
    }

    fn site_pubkey_file(&self) -> PathBuf {
        self.state_dir.join("nostr/state/site_pubkey")
    }
}

pub fn run_action(action: &str) -> Result<CgiResponse> {
    match action {
        "blog-comments" => blog_comments().map(CgiResponse::json),
        "blog-post-context" => blog_post_context().map(CgiResponse::json),
        _ => Err(ReadError::new(
            "bad_action",
            "Unknown Gazeta Nostr read action.",
        )),
    }
}

fn blog_comments() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let requested_path = query_param("path").or_else(|| query_param("slug"));
    if !nostr_bridge_enabled(&paths) {
        return Ok(json!({"success":true,"bridge_enabled":false,"comments":[]}));
    }
    let requested_path = match requested_path.filter(|path| !path.is_empty()) {
        Some(requested_path) => requested_path,
        None => {
            return Ok(json!({
                "success": false,
                "code": "invalid_request",
                "error": "path is required"
            }));
        }
    };
    let slug = match extract_path_slug(&requested_path).filter(|slug| !slug.is_empty()) {
        Some(slug) => slug,
        None => return Ok(json!({"success":true,"bridge_enabled":true,"comments":[]})),
    };
    let address = match post_address_for_slug(&paths, &slug) {
        Some(address) => address,
        None => return Ok(json!({"success":true,"bridge_enabled":true,"comments":[]})),
    };
    let comments = comments_for_address(&paths, &address);
    Ok(json!({"success":true,"bridge_enabled":true,"comments":comments}))
}

fn blog_post_context() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let requested_path = query_param("path").or_else(|| query_param("slug"));
    let requested_path = match requested_path.filter(|path| !path.is_empty()) {
        Some(requested_path) => requested_path,
        None => {
            return Ok(json!({
                "success": false,
                "code": "invalid_request",
                "error": "path is required"
            }));
        }
    };
    let slug = match extract_path_slug(&requested_path).filter(|slug| !slug.is_empty()) {
        Some(slug) => slug,
        None => {
            return Ok(json!({
                "success": false,
                "code": "invalid_path",
                "error": "Invalid path"
            }));
        }
    };
    let posts = public_posts(&paths)?;
    let index = match posts
        .iter()
        .position(|post| post_path_slug(post) == Some(slug.as_str()))
    {
        Some(index) => index,
        None => {
            return Ok(json!({
                "success": false,
                "code": "not_found",
                "error": "Post not found"
            }));
        }
    };

    let current = context_post_json(&paths, &posts[index]);
    let newer = index
        .checked_sub(1)
        .map(|newer_index| context_post_json(&paths, &posts[newer_index]))
        .unwrap_or(Value::Null);
    let older = posts
        .get(index + 1)
        .map(|post| context_post_json(&paths, post))
        .unwrap_or(Value::Null);

    Ok(json!({
        "success": true,
        "current": current,
        "zap_config": zap_config_json(&paths),
        "newer": newer,
        "older": older
    }))
}

fn nostr_bridge_enabled(paths: &SitePaths) -> bool {
    config_bool(&paths.site_conf(), "plugin_nostr_support")
        && config_bool(&paths.site_conf(), "plugin_nostr_bridge")
        && config_bool(&paths.site_conf(), "nostr_bridge_enabled")
}

fn config_bool(path: &Path, key: &str) -> bool {
    let value = match config_value(path, key) {
        Some(value) => value,
        None => return false,
    };
    matches!(value.as_str(), "true" | "1" | "yes" | "on")
}

fn config_value(path: &Path, key: &str) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    text.lines().find_map(|line| {
        let (candidate, value) = line.split_once('=')?;
        (candidate == key).then(|| value.to_string())
    })
}

fn post_address_for_slug(paths: &SitePaths, slug: &str) -> Option<String> {
    let posts = read_json_array(&paths.nostr_posts_index())?;
    posts.into_iter().find_map(|post| {
        (post.get("slug").and_then(Value::as_str) == Some(slug))
            .then(|| string_field(&post, "address"))
            .filter(|address| !address.is_empty())
    })
}

fn comments_for_address(paths: &SitePaths, address: &str) -> Vec<Value> {
    let comments = match read_json_array(&paths.nostr_comments_index()) {
        Some(comments) => comments,
        None => return Vec::new(),
    };
    comments
        .into_iter()
        .filter(|comment| {
            comment
                .get("a_refs")
                .and_then(Value::as_array)
                .map(|refs| refs.iter().any(|value| value.as_str() == Some(address)))
                .unwrap_or(false)
        })
        .map(add_created_at_iso)
        .collect()
}

fn public_posts(paths: &SitePaths) -> Result<Vec<Value>> {
    let catalog = read_json_object(&paths.public_posts_catalog_static())
        .or_else(|| read_json_object(&paths.public_posts_catalog_cache()))
        .ok_or_else(|| {
            ReadError::new(
                "catalog_missing",
                "Gazeta public posts catalog is not available.",
            )
        })?;
    catalog
        .get("posts")
        .and_then(Value::as_array)
        .cloned()
        .ok_or_else(|| ReadError::new("catalog_invalid", "Gazeta public posts catalog is invalid."))
}

fn context_post_json(paths: &SitePaths, post: &Value) -> Value {
    let slug = post_path_slug(post).unwrap_or_default();
    let mut object = Map::new();
    object.insert(
        "title".to_string(),
        Value::String(string_field(post, "title")),
    );
    object.insert(
        "author".to_string(),
        Value::String(string_field_or(post, "author", "Blog Author")),
    );
    object.insert("url".to_string(), Value::String(string_field(post, "url")));
    object.insert(
        "path".to_string(),
        Value::String(string_field_or(post, "path", &format!("posts/{slug}"))),
    );
    object.insert(
        "source_path".to_string(),
        Value::String(string_field(post, "source_path")),
    );
    object.insert(
        "type".to_string(),
        Value::String(string_field_or(post, "type", "post")),
    );
    object.insert(
        "published_at".to_string(),
        Value::String(string_field(post, "published_at")),
    );
    object.insert(
        "published_date".to_string(),
        Value::String(string_field(post, "published_date")),
    );
    object.insert(
        "published_timestamp".to_string(),
        Value::String(string_field(post, "published_timestamp")),
    );
    object.insert(
        "year".to_string(),
        Value::String(string_field_or(post, "year", "")),
    );
    object.insert(
        "summary".to_string(),
        Value::String(string_field(post, "summary")),
    );
    object.insert("word_count".to_string(), integer_json(post, "word_count"));
    object.insert(
        "reading_minutes".to_string(),
        integer_json(post, "reading_minutes"),
    );
    object.insert(
        "tags".to_string(),
        post.get("tags")
            .cloned()
            .unwrap_or_else(|| Value::Array(Vec::new())),
    );
    object.insert(
        "nostr".to_string(),
        nostr_context_for_post(paths, post, &slug).unwrap_or(Value::Null),
    );
    Value::Object(object)
}

fn nostr_context_for_post(paths: &SitePaths, post: &Value, slug: &str) -> Option<Value> {
    let mut id = string_field(post, "nostr_event_id");
    let mut pubkey = string_field(post, "nostr_pubkey");
    let mut kind = string_field(post, "nostr_kind");
    let mut d = string_field(post, "nostr_d");
    let mut address = string_field(post, "nostr_address");
    let mut uri = string_field(post, "nostr_uri");

    if id.is_empty() && pubkey.is_empty() && kind.is_empty() && d.is_empty() && uri.is_empty() {
        if let Some(record) = post_record_for_slug(paths, slug) {
            id = string_field(&record, "id");
            pubkey = string_field(&record, "pubkey");
            kind = number_or_string_field(&record, "kind");
            d = string_field(&record, "d");
            address = string_field(&record, "address");
            if d.is_empty() {
                d = d_tag_from_record(&record).unwrap_or_default();
            }
        }
    }
    if address.is_empty() && !pubkey.is_empty() && !kind.is_empty() && !d.is_empty() {
        address = format!("{kind}:{pubkey}:{d}");
    }
    if uri.is_empty() && !address.is_empty() {
        uri = format!("nostr:{address}");
    }
    if id.is_empty() && pubkey.is_empty() && kind.is_empty() && d.is_empty() && uri.is_empty() {
        return None;
    }
    Some(json!({
        "id": id,
        "pubkey": pubkey,
        "kind": kind,
        "d": d,
        "address": address,
        "uri": uri,
        "relays": relays_json(paths)
    }))
}

fn zap_config_json(paths: &SitePaths) -> Value {
    let site_npub = first_line(&paths.site_npub_file()).unwrap_or_default();
    let site_pubkey = first_line(&paths.site_pubkey_file()).unwrap_or_default();
    let configured_lud16 = config_value(&paths.site_conf(), "zap_lud16")
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let demo_lud16 = (!site_npub.is_empty()).then(|| format!("{site_npub}@npub.cash"));
    let lud16 = if configured_lud16.is_empty() {
        demo_lud16.clone().unwrap_or_default()
    } else {
        configured_lud16
    };
    let lud16_source = if !config_value(&paths.site_conf(), "zap_lud16")
        .unwrap_or_default()
        .trim()
        .is_empty()
    {
        "configured"
    } else if demo_lud16.is_some() {
        "demo"
    } else {
        "unavailable"
    };
    let mut enabled = zaps_enabled(paths);
    if lud16.is_empty() {
        enabled = false;
    }
    let amount_sats = config_value(&paths.site_conf(), "zap_default_amount_sats")
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value >= 1)
        .unwrap_or(1_000);

    let mut object = Map::new();
    object.insert("enabled".to_string(), Value::Bool(enabled));
    object.insert("lud16".to_string(), Value::String(lud16));
    object.insert(
        "lud16_source".to_string(),
        Value::String(lud16_source.to_string()),
    );
    object.insert("default_amount_sats".to_string(), json!(amount_sats));
    object.insert(
        "demo_wallet_available".to_string(),
        Value::Bool(!site_npub.is_empty()),
    );
    if !site_npub.is_empty() {
        object.insert("demo_wallet_npub".to_string(), Value::String(site_npub));
    }
    if !site_pubkey.is_empty() {
        object.insert("recipient_pubkey".to_string(), Value::String(site_pubkey));
    }
    object.insert("relays".to_string(), Value::Array(relays_json(paths)));
    Value::Object(object)
}

fn zaps_enabled(paths: &SitePaths) -> bool {
    config_bool(&paths.site_conf(), "plugin_nostr_support")
        && config_bool(&paths.site_conf(), "plugin_zaps")
        && config_bool(&paths.site_conf(), "zaps_enabled")
}

fn relays_json(paths: &SitePaths) -> Vec<Value> {
    let text = match fs::read_to_string(paths.nostr_relays_file()).ok() {
        Some(text) => text,
        None => return Vec::new(),
    };
    text.lines()
        .filter_map(|line| line.split('#').next())
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| Value::String(line.to_string()))
        .collect()
}

fn post_record_for_slug(paths: &SitePaths, slug: &str) -> Option<Value> {
    read_json_array(&paths.nostr_posts_index())?
        .into_iter()
        .find(|record| record.get("slug").and_then(Value::as_str) == Some(slug))
}

fn d_tag_from_record(record: &Value) -> Option<String> {
    record
        .get("tags")
        .and_then(Value::as_array)?
        .iter()
        .find_map(|tag| {
            let parts = tag.as_array()?;
            (parts.first().and_then(Value::as_str) == Some("d"))
                .then(|| {
                    parts
                        .get(1)
                        .and_then(Value::as_str)
                        .map(ToString::to_string)
                })
                .flatten()
        })
}

fn post_path_slug(post: &Value) -> Option<&str> {
    let path = post.get("path").and_then(Value::as_str)?;
    path.strip_prefix("posts/").or(Some(path))
}

fn add_created_at_iso(mut comment: Value) -> Value {
    let created_at_iso = comment
        .get("created_at")
        .and_then(Value::as_i64)
        .filter(|timestamp| *timestamp > 0)
        .and_then(unix_timestamp_to_iso)
        .unwrap_or_default();
    if let Some(object) = comment.as_object_mut() {
        object.insert("created_at_iso".to_string(), Value::String(created_at_iso));
    }
    comment
}

fn read_json_array(path: &Path) -> Option<Vec<Value>> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&text)
        .ok()?
        .as_array()
        .cloned()
}

fn read_json_object(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&text).ok()
}

fn extract_path_slug(path: &str) -> Option<String> {
    let mut value = path.trim().to_string();
    if let Some(rest) = value
        .strip_prefix("http://")
        .or_else(|| value.strip_prefix("https://"))
    {
        value = rest
            .split_once('/')
            .map(|(_, path)| path)
            .unwrap_or_default()
            .to_string();
    }
    let stripped = value.trim_start_matches('/');
    value = stripped
        .strip_prefix("pages/posts/")
        .unwrap_or(stripped)
        .to_string();
    value = value.strip_prefix("posts/").unwrap_or(&value).to_string();
    value = value.strip_suffix(".html").unwrap_or(&value).to_string();
    value = value.strip_suffix(".md").unwrap_or(&value).to_string();
    if value.is_empty()
        || value.contains("..")
        || value.contains('\\')
        || value.contains("//")
        || value.contains('/')
    {
        None
    } else {
        Some(value)
    }
}

fn query_param(name: &str) -> Option<String> {
    let query = env::var("QUERY_STRING").unwrap_or_default();
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find_map(|(key, value)| (key == name).then(|| percent_decode(value)))
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

fn string_field(value: &Value, field: &str) -> String {
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn string_field_or(value: &Value, field: &str, fallback: &str) -> String {
    let raw = string_field(value, field);
    if raw.is_empty() {
        fallback.to_string()
    } else {
        raw
    }
}

fn number_or_string_field(value: &Value, field: &str) -> String {
    match value.get(field) {
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::String(text)) => text.to_string(),
        _ => String::new(),
    }
}

fn integer_json(value: &Value, field: &str) -> Value {
    match value.get(field) {
        Some(Value::Number(number)) => Value::Number(number.clone()),
        Some(Value::String(text)) => text
            .parse::<i64>()
            .map_or_else(|_| json!(0), |number| json!(number)),
        _ => json!(0),
    }
}

fn first_line(path: &Path) -> Option<String> {
    fs::read_to_string(path)
        .ok()?
        .lines()
        .next()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
}

fn unix_timestamp_to_iso(timestamp: i64) -> Option<String> {
    let days = timestamp.div_euclid(86_400);
    let seconds = timestamp.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days)?;
    let hour = seconds / 3_600;
    let minute = (seconds % 3_600) / 60;
    let second = seconds % 60;
    Some(format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z"
    ))
}

fn civil_from_days(days: i64) -> Option<(i64, i64, i64)> {
    let z = days.checked_add(719_468)?;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };
    Some((year, month, day))
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}
