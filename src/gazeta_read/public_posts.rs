use crate::gazeta_read::{read_json_file, Result, SitePaths};
use crate::public_post::PublicPost;
use crate::public_posts_catalog::{
    load_public_posts as load_catalog_public_posts, read_catalog_value,
};
pub(crate) use crate::public_posts_catalog::{public_posts_by_source_path, public_posts_by_url};
use serde_json::Value;

pub(crate) fn list_public_posts() -> Result<Value> {
    public_posts_catalog_value()
}

pub(crate) fn public_posts_catalog_value() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let static_catalog = paths.generated_static_dir().join("public-posts.json");
    let cache_catalog = paths.state_dir.join("public-posts-cache.json");
    read_catalog_value(
        &static_catalog,
        &cache_catalog,
        read_json_file,
        "Gazeta public posts catalog is not available. Run blog-maintenance rebuild-public-posts.",
    )
}

pub(crate) fn load_public_posts() -> Result<Vec<PublicPost>> {
    let paths = SitePaths::from_env()?;
    let static_catalog = paths.generated_static_dir().join("public-posts.json");
    let cache_catalog = paths.state_dir.join("public-posts-cache.json");
    load_catalog_public_posts(
        &static_catalog,
        &cache_catalog,
        read_json_file,
        "Gazeta public posts catalog is not available. Run blog-maintenance rebuild-public-posts.",
    )
}
