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

    fn static_product_index(&self) -> PathBuf {
        self.site_root.join("site/static/product-index.json")
    }

    fn cache_product_index(&self) -> PathBuf {
        self.state_dir.join("product-index-cache.json")
    }
}

pub fn run_action(action: &str) -> Result<CgiResponse> {
    match action {
        "blog-get-product" => blog_get_product().map(CgiResponse::json),
        _ => Err(ReadError::new("bad_action", "Unknown Gazeta commerce read action.")),
    }
}

fn blog_get_product() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    if let Some(slugs_json) = query_param("slugs_json").filter(|value| !value.is_empty()) {
        let slugs = serde_json::from_str::<Value>(&slugs_json)
            .ok()
            .and_then(|value| value.as_array().cloned());
        let slugs = match slugs {
            Some(slugs) => slugs,
            None => {
                return Ok(json!({
                    "success": false,
                    "code": "invalid_slugs",
                    "error": "slugs_json must be a JSON array"
                }));
            }
        };
        let products = product_index(&paths)?;
        let selected: Vec<Value> = slugs
            .iter()
            .filter_map(Value::as_str)
            .filter_map(|slug| product_for_slug(&products, &normalize_slug(slug)))
            .collect();
        return Ok(json!({"success":true,"products":selected}));
    }

    let slug = query_param("product_slug")
        .or_else(|| query_param("slug"))
        .map(|value| normalize_slug(&value))
        .unwrap_or_default();
    if slug.is_empty() {
        return Ok(json!({
            "success": false,
            "code": "missing_product_slug",
            "error": "product slug is required"
        }));
    }
    let products = product_index(&paths)?;
    if let Some(product) = product_for_slug(&products, &slug) {
        Ok(json!({"success":true,"product":product}))
    } else {
        Ok(json!({
            "success": false,
            "code": "unknown_product",
            "error": "Product not found"
        }))
    }
}

fn product_index(paths: &SitePaths) -> Result<Vec<Value>> {
    if let Some(products) = read_products(&paths.static_product_index())
        .or_else(|| read_products(&paths.cache_product_index()))
    {
        return Ok(products);
    }
    Err(ReadError::new(
        "product_index_missing",
        "Gazeta product index is not available. Run blog-maintenance rebuild-product-index.",
    ))
}

fn read_products(path: &Path) -> Option<Vec<Value>> {
    let text = fs::read_to_string(path).ok()?;
    let value = serde_json::from_str::<Value>(&text).ok()?;
    if value.get("success").and_then(Value::as_bool) == Some(true) {
        value.get("products")?.as_array().cloned()
    } else {
        None
    }
}

fn product_for_slug(products: &[Value], slug: &str) -> Option<Value> {
    products
        .iter()
        .find(|product| product.get("slug").and_then(Value::as_str) == Some(slug))
        .cloned()
}

fn normalize_slug(raw: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in raw.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_lowercase() || ch.is_ascii_digit() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
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

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}
