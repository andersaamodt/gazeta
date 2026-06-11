mod blog_index;
mod btc_rate;
mod error;
mod html;
mod json_io;
mod maintenance;
mod navbar_pages;
mod public_posts;
mod response;
mod site_paths;

pub use self::error::{ReadError, Result};
pub use self::response::CgiResponse;

pub(crate) use self::html::{html_escape, markdown_block_html};
pub(crate) use self::json_io::{read_json_file, write_json_atomic};
pub(crate) use self::maintenance::rebuild;
pub(crate) use self::site_paths::SitePaths;

pub fn run_action(action: &str) -> Result<CgiResponse> {
    match action {
        "list-public-posts" => public_posts::list_public_posts().map(CgiResponse::json),
        "list-navbar-pages" => navbar_pages::list_navbar_pages().map(CgiResponse::json),
        "btc-usd-rate" => btc_rate::btc_usd_rate().map(CgiResponse::json),
        "blog-index" => blog_index::blog_index(),
        _ => Err(ReadError::new("bad_action", "Unknown Gazeta read action.")),
    }
}
