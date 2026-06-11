use serde_json::{json, Value};
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
        let site_name = env::var("WIZARDRY_SITE_NAME").map_err(|_| {
            ReadError::new("config_missing", "WIZARDRY_SITE_NAME is not configured.")
        })?;
        Ok(Self {
            site_root: sites_dir.join(&site_name),
            state_dir: sites_dir.join(".sitedata").join(&site_name),
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
}

pub fn run_action(action: &str) -> Result<CgiResponse> {
    match action {
        "blog-comments" => blog_comments().map(CgiResponse::json),
        _ => Err(ReadError::new("bad_action", "Unknown Gazeta Nostr read action.")),
    }
}

fn blog_comments() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let requested_path = query_param("path").or_else(|| query_param("slug"));
    if !nostr_bridge_enabled(&paths) {
        return Ok(json!({"success":true,"bridge_enabled":false,"comments":[]}));
    }
    let Some(requested_path) = requested_path.filter(|path| !path.is_empty()) else {
        return Ok(json!({
            "success": false,
            "code": "invalid_request",
            "error": "path is required"
        }));
    };
    let Some(slug) = extract_path_slug(&requested_path).filter(|slug| !slug.is_empty()) else {
        return Ok(json!({"success":true,"bridge_enabled":true,"comments":[]}));
    };
    let Some(address) = post_address_for_slug(&paths, &slug) else {
        return Ok(json!({"success":true,"bridge_enabled":true,"comments":[]}));
    };
    let comments = comments_for_address(&paths, &address);
    Ok(json!({"success":true,"bridge_enabled":true,"comments":comments}))
}

fn nostr_bridge_enabled(paths: &SitePaths) -> bool {
    config_bool(&paths.site_conf(), "plugin_nostr_support")
        && config_bool(&paths.site_conf(), "plugin_nostr_bridge")
        && config_bool(&paths.site_conf(), "nostr_bridge_enabled")
}

fn config_bool(path: &Path, key: &str) -> bool {
    let Some(value) = config_value(path, key) else {
        return false;
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
    let Some(comments) = read_json_array(&paths.nostr_comments_index()) else {
        return Vec::new();
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
    serde_json::from_str::<Value>(&text).ok()?.as_array().cloned()
}

fn extract_path_slug(path: &str) -> Option<String> {
    let mut value = path.trim().to_string();
    if let Some(rest) = value.strip_prefix("http://").or_else(|| value.strip_prefix("https://")) {
        value = rest.split_once('/').map(|(_, path)| path).unwrap_or_default().to_string();
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
