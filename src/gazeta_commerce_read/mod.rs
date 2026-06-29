use crate::resolved_site_data_dir;
use crate::action_registry::{action_allowed, RuntimeDomain};
pub use crate::runtime_types::CgiResponse;
use crate::runtime_types::RuntimeError;
use crate::urlcodec::query_param;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

pub type ReadError = RuntimeError;
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
        let default_sites_data_dir = sites_dir.join(".sitedata");
        let sites_data_dir = env_path("WIZARDRY_SITES_DATA_DIR").unwrap_or_else(|| {
            if looks_like_git_checkout(&sites_dir) {
                env_path("XDG_STATE_HOME")
                    .unwrap_or_else(|| home_dir().join(".local/state"))
                    .join("gazeta/sites-data")
            } else {
                default_sites_data_dir.clone()
            }
        });
        let site_name = env::var("WIZARDRY_SITE_NAME").map_err(|_| {
            ReadError::new("config_missing", "WIZARDRY_SITE_NAME is not configured.")
        })?;
        let site_root = sites_dir.join(&site_name);
        let state_dir = resolved_site_data_dir(
            &site_root,
            &sites_data_dir,
            &default_sites_data_dir,
            &site_name,
        );
        Ok(Self {
            site_root,
            state_dir,
        })
    }

    fn static_product_index(&self) -> PathBuf {
        self.generated_static_dir().join("product-index.json")
    }

    fn cache_product_index(&self) -> PathBuf {
        self.state_dir.join("product-index-cache.json")
    }

    fn generated_root(&self) -> PathBuf {
        if looks_like_git_checkout(&self.site_root) {
            env_path("BLOG_GENERATED_ROOT").unwrap_or_else(|| {
                env_path("XDG_STATE_HOME")
                    .unwrap_or_else(|| home_dir().join(".local/state"))
                    .join("gazeta/generated")
                    .join(
                        self.site_root
                            .file_name()
                            .and_then(|value| value.to_str())
                            .unwrap_or("default"),
                    )
            })
        } else {
            self.site_root.join("site")
        }
    }

    fn generated_static_dir(&self) -> PathBuf {
        self.generated_root().join("static")
    }
}

pub fn run_action(action: &str) -> Result<CgiResponse> {
    if !action_allowed(RuntimeDomain::CommerceRead, action) {
        return Err(ReadError::new(
            "bad_action",
            "Unknown Gazeta commerce read action.",
        ));
    }
    match action {
        "blog-get-product" => blog_get_product().map(CgiResponse::json),
        _ => Err(ReadError::new(
            "bad_action",
            "Unknown Gazeta commerce read action.",
        )),
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

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn home_dir() -> PathBuf {
    env_path("HOME").unwrap_or_else(|| PathBuf::from("/"))
}

fn looks_like_git_checkout(path: &Path) -> bool {
    let home = home_dir();
    let home_git = home.join("git");
    path.starts_with(&home_git) || path.starts_with("/Users/andersaamodt/git")
}
