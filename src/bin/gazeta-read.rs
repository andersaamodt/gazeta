use gazeta_theurgy::gazeta_read::{run_action, CgiResponse};
use serde_json::json;
use std::env;

fn main() {
    let action = env::args()
        .nth(1)
        .unwrap_or_else(|| "list-public-posts".to_string());
    let response = match run_action(&action) {
        Ok(response) => response,
        Err(error) => CgiResponse::json(json!({
            "success": false,
            "code": error.code,
            "error": error.message,
        })),
    };
    println!("Content-Type: {}", response.content_type);
    println!();
    println!("{}", response.body);
}
