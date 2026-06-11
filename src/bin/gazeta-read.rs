use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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

fn rebuild_public_posts(paths: &SitePaths) -> Result<()> {
    let maintenance = paths.repo_root.join("cgi/blog-maintenance");
    let output = Command::new(&maintenance)
        .arg("rebuild-public-posts")
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
