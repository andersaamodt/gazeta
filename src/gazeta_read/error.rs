pub type Result<T> = std::result::Result<T, ReadError>;

#[derive(Debug)]
pub struct ReadError {
    pub code: &'static str,
    pub message: String,
}

impl ReadError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}
