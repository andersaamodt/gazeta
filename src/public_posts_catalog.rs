use crate::public_post::PublicPost;
use crate::runtime_types::RuntimeError;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

type Result<T> = std::result::Result<T, RuntimeError>;

pub(crate) fn read_catalog_value<F>(
    static_catalog: &Path,
    cache_catalog: &Path,
    read_json_file: F,
    missing_message: &str,
) -> Result<Value>
where
    F: Fn(&Path) -> Option<Value>,
{
    if let Some(value) = read_catalog_with_posts(static_catalog, &read_json_file) {
        return Ok(value);
    }
    if let Some(value) = read_catalog_with_posts(cache_catalog, &read_json_file) {
        return Ok(value);
    }

    read_catalog(static_catalog, &read_json_file)
        .or_else(|| read_catalog(cache_catalog, &read_json_file))
        .ok_or_else(|| RuntimeError::new("catalog_missing", missing_message))
}

pub(crate) fn load_public_posts<F>(
    static_catalog: &Path,
    cache_catalog: &Path,
    read_json_file: F,
    missing_message: &str,
) -> Result<Vec<PublicPost>>
where
    F: Fn(&Path) -> Option<Value>,
{
    read_catalog_value(
        static_catalog,
        cache_catalog,
        read_json_file,
        missing_message,
    )
    .and_then(|catalog| {
        catalog
            .get("posts")
            .and_then(Value::as_array)
            .map(|posts| posts.iter().filter_map(PublicPost::from_value).collect())
            .ok_or_else(|| {
                RuntimeError::new("catalog_invalid", "Gazeta public posts catalog is invalid.")
            })
    })
}

pub(crate) fn public_posts_by_source_path<'a>(
    posts: &'a [PublicPost],
) -> HashMap<String, &'a PublicPost> {
    posts
        .iter()
        .filter_map(|post| {
            let source_path = post.source_path.trim();
            (!source_path.is_empty()).then_some((source_path.to_string(), post))
        })
        .collect()
}

pub(crate) fn public_posts_by_url<'a>(posts: &'a [PublicPost]) -> HashMap<String, &'a PublicPost> {
    posts
        .iter()
        .filter_map(|post| {
            let url = post.url.trim();
            (!url.is_empty()).then_some((url.to_string(), post))
        })
        .collect()
}

fn read_catalog_with_posts<F>(path: &Path, read_json_file: &F) -> Option<Value>
where
    F: Fn(&Path) -> Option<Value>,
{
    let value = read_catalog(path, read_json_file)?;
    let count = value
        .get("posts")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    (count > 0).then_some(value)
}

fn read_catalog<F>(path: &Path, read_json_file: &F) -> Option<Value>
where
    F: Fn(&Path) -> Option<Value>,
{
    let value = read_json_file(path)?;
    if value.get("success").and_then(Value::as_bool) == Some(true)
        && value.get("posts").and_then(Value::as_array).is_some()
    {
        Some(value)
    } else {
        None
    }
}
