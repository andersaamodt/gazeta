use crate::runtime_types::RuntimeError;
use crate::urlcodec::percent_decode;
use serde_json::Value;
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) struct RequestParams {
    query: String,
    body: String,
    body_is_json: bool,
}

impl RequestParams {
    pub(crate) fn from_env_and_stdin() -> Self {
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

    pub(crate) fn value(&self, key: &str) -> Option<String> {
        let mut value = lookup_url_param(&self.query, key);
        if !self.body.is_empty() {
            let body_value = if self.body_is_json {
                serde_json::from_str::<Value>(&self.body)
                    .ok()
                    .and_then(|body| body.get(key).cloned())
                    .and_then(value_to_string)
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

pub(crate) struct SessionState {
    pub(crate) username: String,
    pub(crate) auth_method: String,
    pub(crate) force_interactive: bool,
}

pub(crate) fn require_admin_session(
    sessions_dir: &Path,
    users_dir: &Path,
    request: &RequestParams,
    extend_ttl_seconds: Option<u64>,
) -> Result<SessionState, RuntimeError> {
    let token = request.value("session_token").unwrap_or_default();
    let csrf = request.value("csrf_token").unwrap_or_default();
    if !is_hex_len(&token, 48) {
        return Err(RuntimeError::new("auth_required", "Not authenticated"));
    }
    let session_path = sessions_dir.join(format!("{token}.conf"));
    let session = read_config(&session_path)
        .ok_or_else(|| RuntimeError::new("auth_required", "Not authenticated"))?;
    let username = config_string(&session, "username");
    let session_csrf = config_string(&session, "csrf_token");
    let auth_method = config_string(&session, "auth_method");
    let force_interactive = boolish(Some(&config_string(&session, "force_interactive")));
    if username.is_empty() || session_csrf.is_empty() {
        return Err(RuntimeError::new("auth_required", "Not authenticated"));
    }
    if csrf.is_empty() || csrf != session_csrf {
        return Err(RuntimeError::new("csrf_invalid", "Invalid CSRF token"));
    }
    let expires_at = config_string(&session, "expires_at")
        .parse::<u64>()
        .unwrap_or(0);
    if expires_at <= now_epoch() {
        let _ = fs::remove_file(&session_path);
        return Err(RuntimeError::new("auth_required", "Not authenticated"));
    }
    let is_admin = user_is_admin(users_dir, &username)
        || boolish(Some(&config_string(&session, "is_admin")));
    if !is_admin {
        return Err(RuntimeError::new(
            "admin_required",
            "Admin permission required",
        ));
    }
    if let Some(ttl_seconds) = extend_ttl_seconds {
        let new_expiry = now_epoch() + ttl_seconds;
        update_config_value(&session_path, "expires_at", &new_expiry.to_string())?;
    }
    Ok(SessionState {
        username,
        auth_method,
        force_interactive,
    })
}

fn lookup_url_param(source: &str, key: &str) -> Option<String> {
    source
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find_map(|(candidate, value)| (candidate == key).then(|| percent_decode(value)))
}

fn value_to_string(value: Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text),
        Value::Null => None,
        other => Some(other.to_string()),
    }
}

fn user_is_admin(users_dir: &Path, username: &str) -> bool {
    if username.is_empty() {
        return false;
    }
    if user_is_admin_direct(users_dir, username) {
        return true;
    }
    let profile = user_profile(users_dir, username);
    let fingerprint = read_config(&profile)
        .map(|config| config_string(&config, "fingerprint"))
        .unwrap_or_default();
    if fingerprint.is_empty() {
        return false;
    }
    for entry in fs::read_dir(users_dir).into_iter().flatten().flatten() {
        let alt_profile = entry.path().join("profile.conf");
        let Some(config) = read_config(&alt_profile) else {
            continue;
        };
        let alt_user = config_string(&config, "username");
        if alt_user.is_empty() || alt_user == username {
            continue;
        }
        if config_string(&config, "fingerprint") == fingerprint
            && user_is_admin_direct(users_dir, &alt_user)
        {
            return true;
        }
    }
    false
}

fn user_is_admin_direct(users_dir: &Path, username: &str) -> bool {
    read_config(&user_profile(users_dir, username))
        .map(|config| boolish(Some(&config_string(&config, "is_admin"))))
        .unwrap_or(false)
}

fn user_profile(users_dir: &Path, username: &str) -> PathBuf {
    users_dir.join(username).join("profile.conf")
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

fn update_config_value(path: &Path, key: &str, value: &str) -> Result<(), RuntimeError> {
    let mut config = read_config(path).unwrap_or_default();
    config.insert(key.to_string(), value.to_string());
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            RuntimeError::new("write_failed", format!("Could not update session state: {error}"))
        })?;
    }
    let mut text = String::new();
    for (current_key, current_value) in config {
        text.push_str(&current_key);
        text.push('=');
        text.push_str(&current_value);
        text.push('\n');
    }
    fs::write(path, text).map_err(|error| {
        RuntimeError::new("write_failed", format!("Could not update session state: {error}"))
    })
}

fn is_hex_len(value: &str, len: usize) -> bool {
    value.len() == len
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn boolish(value: Option<&str>) -> bool {
    matches!(value.unwrap_or_default(), "true" | "1" | "yes" | "on")
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}
