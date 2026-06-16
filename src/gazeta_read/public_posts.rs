use crate::gazeta_read::{read_json_file, rebuild, ReadError, Result, SitePaths};
use serde_json::Value;
use std::path::Path;

pub(crate) fn list_public_posts() -> Result<Value> {
    public_posts_catalog_value()
}

pub(crate) fn public_posts_catalog_value() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let static_catalog = paths.generated_static_dir().join("public-posts.json");
    let cache_catalog = paths.state_dir.join("public-posts-cache.json");

    if let Some(value) = read_catalog_with_posts(&static_catalog) {
        return Ok(value);
    }
    if let Some(value) = read_catalog_with_posts(&cache_catalog) {
        return Ok(value);
    }

    rebuild(&paths, "rebuild-public-posts")?;

    read_catalog(&static_catalog)
        .or_else(|| read_catalog(&cache_catalog))
        .ok_or_else(|| {
            ReadError::new(
                "catalog_missing",
                "Gazeta public posts catalog was not available after rebuild.",
            )
        })
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
    let value = read_json_file(path)?;
    if value.get("success").and_then(Value::as_bool) == Some(true)
        && value.get("posts").and_then(Value::as_array).is_some()
    {
        Some(value)
    } else {
        None
    }
}
