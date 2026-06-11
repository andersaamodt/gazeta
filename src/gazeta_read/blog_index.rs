use crate::gazeta_read::{
    html_escape, markdown_block_html, public_posts::public_posts_catalog_value, CgiResponse,
    ReadError, Result,
};
use serde_json::Value;
use std::env;

const POSTS_PER_PAGE: usize = 10;

pub(crate) fn blog_index() -> Result<CgiResponse> {
    let catalog = public_posts_catalog_value()?;
    let posts = catalog
        .get("posts")
        .and_then(Value::as_array)
        .ok_or_else(|| ReadError::new("catalog_invalid", "Gazeta public posts catalog is invalid."))?;
    Ok(CgiResponse::html(render_index(posts, requested_page())))
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

fn render_index(posts: &[Value], requested_page: usize) -> String {
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
            render_post(&mut html, post);
        }
    }
    html.push_str("</div>\n");

    if total_posts > 0 && total_pages > 1 {
        render_pagination(&mut html, page, total_pages);
    }
    html
}

fn render_post(html: &mut String, post: &Value) {
    let url = string_field(post, "url");
    let title = string_field(post, "title");
    let author = string_field_or(post, "author", "Blog Author");
    let reading_minutes = number_or_string_field(post, "reading_minutes", "1");
    let published_timestamp = string_field(post, "published_timestamp");
    let pub_date = string_field_or(post, "pub_date", "Unknown date");
    let comment_count = integer_field(post, "comment_count");
    let summary = string_field(post, "summary");
    let link_url = string_field(post, "link_url");
    let summary_truncated = bool_field(post, "summary_truncated");
    let post_type = string_field_or(post, "type", "post");

    html.push_str("<article class=\"post-item\">\n");
    html.push_str("  <div class=\"post-head\">\n");
    html.push_str("    <div class=\"post-head-main\">\n");
    html.push_str("      <h2 class=\"post-title\"><a href=\"");
    html.push_str(&html_escape(&url));
    html.push_str("\">");
    html.push_str(&html_escape(&title));
    html.push_str("</a></h2>\n");
    if post_type == "link-share" {
        html.push_str("      <div class=\"post-offsite-link-note\"><span class=\"post-offsite-link-kind\">Off-site link</span><span>Linked by ");
        html.push_str(&html_escape(&author));
        html.push_str("</span>");
        if !link_url.is_empty() {
            html.push_str("<a class=\"post-offsite-url\" href=\"");
            html.push_str(&html_escape(&link_url));
            html.push_str("\" title=\"");
            html.push_str(&html_escape(&link_url));
            html.push_str("\">");
            html.push_str(&html_escape(&link_url));
            html.push_str("</a>");
        }
        html.push_str("</div>\n");
    }
    html.push_str("      ");
    html.push_str(&post_header_meta_html(
        &author,
        &reading_minutes,
        &pub_date,
        &published_timestamp,
    ));
    html.push_str("    </div>\n");
    html.push_str("    <div class=\"post-meta\">");
    html.push_str(" <span class=\"post-comments-count\">");
    html.push_str(&html_escape(&comment_count.to_string()));
    html.push_str(if comment_count == 1 {
        " comments</span>"
    } else {
        " comments</span>"
    });
    html.push_str("</div>\n");
    html.push_str("  </div>\n");

    if !summary.is_empty() {
        html.push_str("  <div class=\"post-summary\">");
        html.push_str(&markdown_block_html(&summary));
        if summary_truncated {
            html.push_str(" <a class=\"post-summary-read-more\" href=\"");
            html.push_str(&html_escape(&url));
            html.push_str("\">Read more...</a>");
        }
        html.push_str("</div>\n");
    }

    if let Some(tags) = post.get("tags").and_then(Value::as_array) {
        if !tags.is_empty() {
            html.push_str("  <div class=\"tags\">\n");
            for tag in tags.iter().filter_map(Value::as_str).filter(|tag| !tag.trim().is_empty()) {
                let clean = tag.trim();
                html.push_str("    <a href=\"/tags#");
                html.push_str(&html_escape(clean));
                html.push_str("\" class=\"tag\">");
                html.push_str(&html_escape(clean));
                html.push_str("</a>\n");
            }
            html.push_str("  </div>\n");
        }
    }

    html.push_str("</article>\n\n");
}

fn post_header_meta_html(
    author: &str,
    reading_minutes: &str,
    published_date: &str,
    published_timestamp: &str,
) -> String {
    let title_attr = if published_timestamp.is_empty() {
        String::new()
    } else {
        format!(" title=\"{}\"", html_escape(published_timestamp))
    };
    format!(
        "<div class=\"post-head-divider\" aria-hidden=\"true\"></div>\n<div class=\"post-byline post-byline-bottom\"><span class=\"post-author\">{}</span><span class=\"post-reading-inline\">{} min read</span><span class=\"post-date\"{}>{}</span></div>\n",
        html_escape(author),
        html_escape(reading_minutes),
        title_attr,
        html_escape(published_date),
    )
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

fn string_field(value: &Value, field: &str) -> String {
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn string_field_or(value: &Value, field: &str, fallback: &str) -> String {
    let raw = string_field(value, field);
    if raw.is_empty() {
        fallback.to_string()
    } else {
        raw
    }
}

fn number_or_string_field(value: &Value, field: &str, fallback: &str) -> String {
    match value.get(field) {
        Some(Value::Number(number)) => number.to_string(),
        Some(Value::String(text)) if !text.is_empty() => text.to_string(),
        _ => fallback.to_string(),
    }
}

fn integer_field(value: &Value, field: &str) -> i64 {
    value.get(field).and_then(Value::as_i64).unwrap_or(0)
}

fn bool_field(value: &Value, field: &str) -> bool {
    value.get(field).and_then(Value::as_bool).unwrap_or(false)
}
