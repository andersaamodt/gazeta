use gazeta_theurgy::gazeta_admin::{run_action, AdminActionResult, CgiResponse};
use serde_json::json;
use std::env;

fn main() {
    let action = env::args()
        .nth(1)
        .unwrap_or_else(|| "blog-manage-post".to_string());
    match run_action(&action) {
        Ok(AdminActionResult::Response(response)) => print_response(response),
        Ok(AdminActionResult::ExecLegacy { script_path }) => {
            let status = std::process::Command::new("/bin/sh")
                .arg(script_path)
                .status()
                .unwrap_or_else(|error| {
                    print_response(CgiResponse::json(json!({
                        "success": false,
                        "code": "legacy_exec_failed",
                        "error": format!("Could not launch legacy Gazeta action: {error}"),
                    })));
                    std::process::exit(1);
                });
            std::process::exit(status.code().unwrap_or(1));
        }
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
