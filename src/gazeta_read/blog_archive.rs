use crate::gazeta_read::{
    html_escape, public_posts::public_posts_catalog_value, CgiResponse, ReadError, Result,
};
use crate::public_post::PublicPost;
use serde_json::Value;

pub(crate) fn blog_archive() -> Result<CgiResponse> {
    let catalog = public_posts_catalog_value()?;
    let posts_json = catalog
        .get("posts")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            ReadError::new("catalog_invalid", "Gazeta public posts catalog is invalid.")
        })?;
    let posts: Vec<PublicPost> = posts_json.iter().filter_map(PublicPost::from_value).collect();
    Ok(CgiResponse::html(render_archive(&posts)))
}

fn render_archive(posts: &[PublicPost]) -> String {
    if posts.is_empty() {
        return "<p>No published posts yet.</p>\n".to_string();
    }

    let rows: Vec<ArchiveRow> = posts.iter().map(ArchiveRow::from_post).collect();
    let mut html = String::new();
    html.push_str("<div class=\"archive-list\">\n");
    let mut current_key = String::new();
    for row in &rows {
        if row.month_key != current_key {
            if !current_key.is_empty() {
                html.push_str("  </ul>\n</section>\n");
            }
            let count = rows
                .iter()
                .filter(|candidate| candidate.month_key == row.month_key)
                .count();
            html.push_str("<section class=\"archive-month\" id=\"archive-");
            html.push_str(&html_escape(&row.month_key));
            html.push_str("\">\n");
            html.push_str("  <h2>");
            html.push_str(&html_escape(&row.month_label));
            html.push_str(" <span class=\"archive-count\">(");
            html.push_str(&html_escape(&count.to_string()));
            html.push_str(")</span></h2>\n");
            html.push_str("  <ul class=\"archive-posts\">\n");
            current_key = row.month_key.clone();
        }

        html.push_str("    <li class=\"archive-item\"><time class=\"archive-date\">");
        html.push_str(&html_escape(&row.date_label));
        html.push_str("</time> <a href=\"");
        html.push_str(&html_escape(&row.url));
        html.push_str("\">");
        html.push_str(&html_escape(&row.title));
        html.push_str("</a> <span class=\"post-comments-count\">(");
        html.push_str(&html_escape(&row.comment_count.to_string()));
        html.push_str(" comments)</span></li>\n");
    }
    if !current_key.is_empty() {
        html.push_str("  </ul>\n</section>\n");
    }
    html.push_str("</div>\n");
    html
}

struct ArchiveRow {
    month_key: String,
    month_label: String,
    date_label: String,
    url: String,
    title: String,
    comment_count: i64,
}

impl ArchiveRow {
    fn from_post(post: &PublicPost) -> Self {
        let pub_date = post.pub_date.clone();
        let (year, month, day) = parse_date_parts(&pub_date);
        let month_name = month_name(month);
        Self {
            month_key: format!("{year}-{month:02}"),
            month_label: format!("{month_name} {year}"),
            date_label: format!("{month_name} {day}, {year}"),
            url: post.url.clone(),
            title: post.title.clone(),
            comment_count: post.comment_count,
        }
    }
}

fn parse_date_parts(raw: &str) -> (i32, u8, u8) {
    let mut parts = raw.split('-');
    let year = parts
        .next()
        .and_then(|part| part.parse::<i32>().ok())
        .unwrap_or(1970);
    let month = parts
        .next()
        .and_then(|part| part.parse::<u8>().ok())
        .filter(|month| (1..=12).contains(month))
        .unwrap_or(1);
    let day = parts
        .next()
        .and_then(|part| part.parse::<u8>().ok())
        .filter(|day| (1..=31).contains(day))
        .unwrap_or(1);
    (year, month, day)
}

fn month_name(month: u8) -> &'static str {
    match month {
        1 => "January",
        2 => "February",
        3 => "March",
        4 => "April",
        5 => "May",
        6 => "June",
        7 => "July",
        8 => "August",
        9 => "September",
        10 => "October",
        11 => "November",
        12 => "December",
        _ => "January",
    }
}
