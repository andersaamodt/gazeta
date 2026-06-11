mod btc_rate;
mod error;
mod json_io;
mod maintenance;
mod navbar_pages;
mod public_posts;
mod site_paths;

pub use self::error::{ReadError, Result};

pub(crate) use self::json_io::{read_json_file, write_json_atomic};
pub(crate) use self::maintenance::rebuild;
pub(crate) use self::site_paths::SitePaths;

use serde_json::Value;

pub fn run_action(action: &str) -> Result<Value> {
    match action {
        "list-public-posts" => public_posts::list_public_posts(),
        "list-navbar-pages" => navbar_pages::list_navbar_pages(),
        "btc-usd-rate" => btc_rate::btc_usd_rate(),
        _ => Err(ReadError::new("bad_action", "Unknown Gazeta read action.")),
    }
}
