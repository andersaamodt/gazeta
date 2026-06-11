use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

type Result<T> = std::result::Result<T, ReadError>;

#[derive(Debug)]
struct ReadError {
    code: &'static str,
    message: String,
}

impl ReadError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

fn main() {
    let payload = match run() {
        Ok(payload) => payload,
        Err(error) => json!({
            "success": false,
            "code": error.code,
            "error": error.message,
        }),
    };
    print_json(&payload);
}

fn run() -> Result<Value> {
    match env::args()
        .nth(1)
        .unwrap_or_else(|| "list-public-posts".to_string())
        .as_str()
    {
        "list-public-posts" => list_public_posts(),
        "list-navbar-pages" => list_navbar_pages(),
        "btc-usd-rate" => btc_usd_rate(),
        _ => Err(ReadError::new("bad_action", "Unknown Gazeta read action.")),
    }
}

fn list_public_posts() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let static_catalog = paths.site_root.join("site/static/public-posts.json");
    let cache_catalog = paths.state_dir.join("public-posts-cache.json");

    if let Some(value) = read_catalog_with_posts(&static_catalog) {
        return Ok(value);
    }
    if let Some(value) = read_catalog_with_posts(&cache_catalog) {
        return Ok(value);
    }

    rebuild_public_posts(&paths)?;

    read_catalog(&static_catalog)
        .or_else(|| read_catalog(&cache_catalog))
        .ok_or_else(|| {
            ReadError::new(
                "catalog_missing",
                "Gazeta public posts catalog was not available after rebuild.",
            )
        })
}

fn list_navbar_pages() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let static_navbar = paths.site_root.join("site/static/navbar-pages.json");
    let cache_navbar = paths.state_dir.join("navbar-pages-cache.json");

    if let Some(value) = read_pages_payload(&cache_navbar) {
        return Ok(value);
    }
    if let Some(value) = read_pages_payload(&static_navbar) {
        return Ok(value);
    }

    rebuild(&paths, "rebuild-navbar-pages")?;

    read_pages_payload(&static_navbar)
        .or_else(|| read_pages_payload(&cache_navbar))
        .ok_or_else(|| {
            ReadError::new(
                "navbar_missing",
                "Gazeta navbar pages were not available after rebuild.",
            )
        })
}

fn btc_usd_rate() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let cache_file = paths.state_dir.join("btc-usd-rate.json");
    let cache_ttl_seconds = 60;
    let now = now_epoch_seconds()?;

    if let Some(value) = read_fresh_btc_cache(&cache_file, now, cache_ttl_seconds) {
        return Ok(value);
    }

    if let Some(rate) = fetch_coinbase_btc_usd() {
        let value = json!({
            "success": true,
            "btc_usd": rate,
            "currency": "USD",
            "source": "coinbase",
            "stale": false,
            "fetched_at": now,
        });
        write_json_atomic(&cache_file, &value)?;
        return Ok(value);
    }

    if let Some(rate) = read_btc_rate(&cache_file) {
        return Ok(json!({
            "success": true,
            "btc_usd": rate,
            "currency": "USD",
            "source": "coinbase",
            "stale": true,
            "fetched_at": now,
        }));
    }

    Ok(json!({
        "success": false,
        "error": "BTC/USD rate unavailable",
    }))
}

struct SitePaths {
    repo_root: PathBuf,
    site_root: PathBuf,
    state_dir: PathBuf,
}

impl SitePaths {
    fn from_env() -> Result<Self> {
        let repo_root = env_path("GAZETA_REPO_ROOT")
            .or_else(|| env::current_dir().ok())
            .ok_or_else(|| {
                ReadError::new("config_missing", "Gazeta repo root is not configured.")
            })?;
        let sites_dir = env_path("WIZARDRY_SITES_DIR").ok_or_else(|| {
            ReadError::new("config_missing", "WIZARDRY_SITES_DIR is not configured.")
        })?;
        let site_name = env::var("WIZARDRY_SITE_NAME").map_err(|_| {
            ReadError::new("config_missing", "WIZARDRY_SITE_NAME is not configured.")
        })?;
        let site_root = sites_dir.join(&site_name);
        let state_dir = sites_dir.join(".sitedata").join(&site_name);
        Ok(Self {
            repo_root,
            site_root,
            state_dir,
        })
    }
}

fn read_fresh_btc_cache(path: &Path, now: u64, ttl_seconds: u64) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    let fetched_at = value.get("fetched_at")?.as_u64()?;
    let age = now.checked_sub(fetched_at)?;
    (age <= ttl_seconds && read_btc_rate_value(&value).is_some()).then_some(value)
}

fn read_btc_rate(path: &Path) -> Option<f64> {
    let text = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    read_btc_rate_value(&value)
}

fn read_btc_rate_value(value: &Value) -> Option<f64> {
    let rate = value.get("btc_usd")?.as_f64()?;
    (rate.is_finite() && rate > 0.0).then_some(round_cents(rate))
}

fn fetch_coinbase_btc_usd() -> Option<f64> {
    let output = Command::new("curl")
        .arg("-fsS")
        .arg("--max-time")
        .arg("8")
        .arg("https://api.exchange.coinbase.com/products/BTC-USD/ticker")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value: Value = serde_json::from_slice(&output.stdout).ok()?;
    let raw_price = value.get("price")?.as_str()?;
    let rate: f64 = raw_price.parse().ok()?;
    (rate.is_finite() && rate > 0.0).then_some(round_cents(rate))
}

fn write_json_atomic(path: &Path, value: &Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            ReadError::new(
                "cache_write_failed",
                format!("Could not create cache directory: {error}"),
            )
        })?;
    }
    let tmp = path.with_extension(format!("json.{}.tmp", std::process::id()));
    let text = serde_json::to_vec(value).map_err(|error| {
        ReadError::new(
            "cache_write_failed",
            format!("Could not encode cache JSON: {error}"),
        )
    })?;
    fs::write(&tmp, text).map_err(|error| {
        ReadError::new(
            "cache_write_failed",
            format!("Could not write cache file: {error}"),
        )
    })?;
    fs::rename(&tmp, path).map_err(|error| {
        let _ = fs::remove_file(&tmp);
        ReadError::new(
            "cache_write_failed",
            format!("Could not install cache file: {error}"),
        )
    })
}

fn now_epoch_seconds() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| ReadError::new("clock_error", error.to_string()))
}

fn round_cents(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn rebuild_public_posts(paths: &SitePaths) -> Result<()> {
    rebuild(paths, "rebuild-public-posts")
}

fn rebuild(paths: &SitePaths, action: &str) -> Result<()> {
    let maintenance = paths.repo_root.join("cgi/blog-maintenance");
    let output = Command::new(&maintenance)
        .arg(action)
        .current_dir(&paths.repo_root)
        .output()
        .map_err(|error| ReadError::new("rebuild_failed", error.to_string()))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(ReadError::new(
        "rebuild_failed",
        if stderr.is_empty() { stdout } else { stderr },
    ))
}

fn read_catalog_with_posts(path: &Path) -> Option<Value> {
    let value = read_catalog(path)?;
    let count = value
        .get("posts")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    (count > 0).then_some(value)
}

fn read_catalog(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    if value.get("success").and_then(Value::as_bool) == Some(true)
        && value.get("posts").and_then(Value::as_array).is_some()
    {
        Some(value)
    } else {
        None
    }
}

fn read_pages_payload(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    if value.get("success").and_then(Value::as_bool) == Some(true)
        && value.get("pages").and_then(Value::as_array).is_some()
    {
        Some(value)
    } else {
        None
    }
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn print_json(value: &Value) {
    println!("Content-Type: application/json");
    println!();
    println!(
        "{}",
        serde_json::to_string(value).unwrap_or_else(|_| {
            "{\"success\":false,\"code\":\"json_error\",\"error\":\"Could not encode response.\"}"
                .to_string()
        })
    );
}
