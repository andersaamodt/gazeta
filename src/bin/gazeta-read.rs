use gazeta_theurgy::gazeta_read::run_action;
use serde_json::{json, Value};
use std::env;

fn main() {
    let action = env::args()
        .nth(1)
        .unwrap_or_else(|| "list-public-posts".to_string());
    let payload = match run_action(&action) {
        Ok(payload) => payload,
        Err(error) => json!({
            "success": false,
            "code": error.code,
            "error": error.message,
        }),
    };
    print_json(&payload);
}

fn print_json(value: &Value) {
    println!("Content-Type: application/json");
    println!();
    println!(
        "{}",
        serde_json::to_string(value).unwrap_or_else(|_| {
            "{\"success\":false,\"code\":\"json_error\",\"error\":\"Could not encode response.\"}"
                .to_string()
        })
    );
}
