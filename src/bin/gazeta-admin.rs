use gazeta_theurgy::gazeta_admin::{run_action, CgiResponse};
use serde_json::json;
use std::env;

fn main() {
    let action = env::args()
        .nth(1)
        .unwrap_or_else(|| "blog-manage-post".to_string());
    match run_action(&action) {
        Ok(response) => print_response(response),
        Err(error) => print_response(CgiResponse::json(json!({
            "success": false,
            "code": error.code,
            "error": error.message,
        }))),
    }
}

fn print_response(response: CgiResponse) {
    println!("Content-Type: {}", response.content_type);
    println!();
    println!("{}", response.body);
}
