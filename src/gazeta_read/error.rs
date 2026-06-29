use crate::runtime_types::RuntimeError;

pub type ReadError = RuntimeError;
pub type Result<T> = std::result::Result<T, ReadError>;
