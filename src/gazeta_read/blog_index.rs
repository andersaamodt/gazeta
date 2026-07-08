use crate::gazeta_read::{
    public_posts::public_posts_catalog_value, CgiResponse, ReadError, Result,
};
use crate::public_post::PublicPost;
use serde_json::Value;
use std::env;

const POSTS_PER_PAGE: usize = 10;

pub(crate) fn blog_index() -> Result<CgiResponse> {
    let catalog = public_posts_catalog_value()?;
    let posts_json = catalog
        .get("posts")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ReadError::new("catalog_invalid", "Gazeta public posts catalog is invalid.")
        })?;
    let posts: Vec<PublicPost> = posts_json
        .iter()
        .filter_map(PublicPost::from_value)
        .collect();
    Ok(CgiResponse::html(render_index(&posts, requested_page())))
}

fn requested_page() -> usize {
    let query = env::var("QUERY_STRING").unwrap_or_default();
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find_map(|(key, value)| (key == "page").then_some(value))
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|page| *page > 0)
        .unwrap_or(1)
}

fn render_index(posts: &[PublicPost], requested_page: usize) -> String {
    let total_posts = posts.len();
    let total_pages = if total_posts == 0 {
        1
    } else {
        (total_posts + POSTS_PER_PAGE - 1) / POSTS_PER_PAGE
    };
    let page = requested_page.min(total_pages).max(1);
    let start = (page - 1) * POSTS_PER_PAGE;
    let end = (start + POSTS_PER_PAGE).min(total_posts);

    let mut html = String::new();
    html.push_str("<div class=\"post-list\">\n");
    if total_posts == 0 {
        html.push_str("<p>No posts to show yet.</p>\n");
    } else {
        for post in &posts[start..end] {
            let rendered = post.rendered_html.trim();
            if !rendered.is_empty() {
                html.push_str(rendered);
                html.push('\n');
            }
        }
    }
    html.push_str("</div>\n");

    if total_posts > 0 && total_pages > 1 {
        render_pagination(&mut html, page, total_pages);
    }
    html
}

fn render_pagination(html: &mut String, page: usize, total_pages: usize) {
    html.push_str("<div class=\"pagination\">\n");
    if page > 1 {
        html.push_str("  <a class=\"page-link\" href=\"?page=");
        html.push_str(&(page - 1).to_string());
        html.push_str("\">&laquo; Previous</a>\n");
    } else {
        html.push_str("  <span class=\"page-link disabled\">&laquo; Previous</span>\n");
    }
    html.push_str("  <span class=\"page-info\">Page ");
    html.push_str(&page.to_string());
    html.push_str(" of ");
    html.push_str(&total_pages.to_string());
    html.push_str("</span>\n");
    if page < total_pages {
        html.push_str("  <a class=\"page-link\" href=\"?page=");
        html.push_str(&(page + 1).to_string());
        html.push_str("\">Next &raquo;</a>\n");
    } else {
        html.push_str("  <span class=\"page-link disabled\">Next &raquo;</span>\n");
    }
    html.push_str("</div>\n");
}
