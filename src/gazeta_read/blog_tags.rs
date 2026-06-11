use crate::gazeta_read::{
    html_escape, public_posts::public_posts_catalog_value, CgiResponse, ReadError, Result,
};
use serde_json::Value;
use std::collections::HashMap;

pub(crate) fn blog_tags() -> Result<CgiResponse> {
    let catalog = public_posts_catalog_value()?;
    let posts = catalog
        .get("posts")
        .and_then(Value::as_array)
        .ok_or_else(|| ReadError::new("catalog_invalid", "Gazeta public posts catalog is invalid."))?;
    Ok(CgiResponse::html(render_tags(posts)))
}

fn render_tags(posts: &[Value]) -> String {
    let rows: Vec<TagPostRow> = posts.iter().filter_map(TagPostRow::from_post).collect();
    if rows.is_empty() {
        return "<p>No tags found yet.</p>\n".to_string();
    }

    let mut counts: HashMap<String, usize> = HashMap::new();
    for row in &rows {
        for tag in &row.tags {
            *counts.entry(tag.clone()).or_insert(0) += 1;
        }
    }
    let mut tag_counts: Vec<(String, usize)> = counts.into_iter().collect();
    tag_counts.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));

    let mut html = String::new();
    html.push_str("<div class=\"tag-cloud\">\n");
    for (tag, count) in tag_counts {
        html.push_str("  <button type=\"button\" class=\"tag\" data-tag=\"");
        html.push_str(&html_escape(&tag));
        html.push_str("\" aria-pressed=\"false\">");
        html.push_str(&html_escape(&tag));
        html.push_str(" <span class=\"tag-count\">(");
        html.push_str(&html_escape(&count.to_string()));
        html.push_str(")</span></button>\n");
    }
    html.push_str("</div>\n\n");
    html.push_str("<p class=\"tag-filter-hint\"><em>Shift-click to multi-select.</em></p>\n\n");
    html.push_str("<div class=\"tag-results\">\n");
    html.push_str("  <ul class=\"tag-results-list\">\n");
    for row in &rows {
        html.push_str("    <li class=\"tag-result-item\" data-post-url=\"");
        html.push_str(&html_escape(&row.url));
        html.push_str("\" data-post-tags=\"");
        html.push_str(&html_escape(&row.tags.join(",")));
        html.push_str("\"><a href=\"");
        html.push_str(&html_escape(&row.url));
        html.push_str("\">");
        html.push_str(&html_escape(&row.title));
        html.push_str("</a>");
        if !row.pub_date.is_empty() {
            html.push_str(" <span class=\"post-date\">(");
            html.push_str(&html_escape(&row.pub_date));
            html.push_str(")</span>");
        }
        html.push_str(" <span class=\"post-comments-count\">(");
        html.push_str(&html_escape(&row.comment_count.to_string()));
        html.push_str(" comments)</span></li>\n");
    }
    html.push_str("  </ul>\n");
    html.push_str("  <p class=\"placeholder tag-results-empty\" hidden>No posts match the selected categories.</p>\n");
    html.push_str("</div>\n");
    html
}

struct TagPostRow {
    url: String,
    title: String,
    pub_date: String,
    tags: Vec<String>,
    comment_count: i64,
}

impl TagPostRow {
    fn from_post(post: &Value) -> Option<Self> {
        let tags: Vec<String> = post
            .get("tags")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .map(ToString::to_string)
            .collect();
        if tags.is_empty() {
            return None;
        }
        Some(Self {
            url: string_field(post, "url"),
            title: string_field(post, "title"),
            pub_date: string_field(post, "pub_date"),
            tags,
            comment_count: integer_field(post, "comment_count"),
        })
    }
}

fn string_field(value: &Value, field: &str) -> String {
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn integer_field(value: &Value, field: &str) -> i64 {
    value.get(field).and_then(Value::as_i64).unwrap_or(0)
}
