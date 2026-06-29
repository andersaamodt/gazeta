use serde_json::Value;

pub struct CgiResponse {
    pub content_type: &'static str,
    pub body: String,
}

impl CgiResponse {
    pub fn json(value: Value) -> Self {
        Self {
            content_type: "application/json",
            body: serde_json::to_string(&value).unwrap_or_else(|_| {
                "{\"success\":false,\"code\":\"json_error\",\"error\":\"Could not encode response.\"}"
                    .to_string()
            }),
        }
    }

    pub fn html(body: String) -> Self {
        Self {
            content_type: "text/html; charset=utf-8",
            body,
        }
    }
}

#[derive(Debug)]
pub struct RuntimeError {
    pub code: &'static str,
    pub message: String,
}

impl RuntimeError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
