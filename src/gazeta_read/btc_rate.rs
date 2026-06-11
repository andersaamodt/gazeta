use crate::gazeta_read::{read_json_file, write_json_atomic, ReadError, Result, SitePaths};
use serde_json::{json, Value};
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn btc_usd_rate() -> Result<Value> {
    let paths = SitePaths::from_env()?;
    let cache_file = paths.state_dir.join("btc-usd-rate.json");
    let cache_ttl_seconds = 60;
    let now = now_epoch_seconds()?;

    if let Some(value) = read_fresh_btc_cache(&cache_file, now, cache_ttl_seconds) {
        return Ok(value);
    }

    if let Some(rate) = fetch_coinbase_btc_usd() {
        let value = json!({
            "success": true,
            "btc_usd": rate,
            "currency": "USD",
            "source": "coinbase",
            "stale": false,
            "fetched_at": now,
        });
        write_json_atomic(&cache_file, &value)?;
        return Ok(value);
    }

    if let Some(rate) = read_btc_rate(&cache_file) {
        return Ok(json!({
            "success": true,
            "btc_usd": rate,
            "currency": "USD",
            "source": "coinbase",
            "stale": true,
            "fetched_at": now,
        }));
    }

    Ok(json!({
        "success": false,
        "error": "BTC/USD rate unavailable",
    }))
}

fn read_fresh_btc_cache(path: &Path, now: u64, ttl_seconds: u64) -> Option<Value> {
    let value = read_json_file(path)?;
    let fetched_at = value.get("fetched_at")?.as_u64()?;
    let age = now.checked_sub(fetched_at)?;
    (age <= ttl_seconds && read_btc_rate_value(&value).is_some()).then_some(value)
}

fn read_btc_rate(path: &Path) -> Option<f64> {
    let value = read_json_file(path)?;
    read_btc_rate_value(&value)
}

fn read_btc_rate_value(value: &Value) -> Option<f64> {
    let rate = value.get("btc_usd")?.as_f64()?;
    (rate.is_finite() && rate > 0.0).then_some(round_cents(rate))
}

fn fetch_coinbase_btc_usd() -> Option<f64> {
    let output = Command::new("curl")
        .arg("-fsS")
        .arg("--max-time")
        .arg("8")
        .arg("https://api.exchange.coinbase.com/products/BTC-USD/ticker")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value: Value = serde_json::from_slice(&output.stdout).ok()?;
    let raw_price = value.get("price")?.as_str()?;
    let rate: f64 = raw_price.parse().ok()?;
    (rate.is_finite() && rate > 0.0).then_some(round_cents(rate))
}

fn now_epoch_seconds() -> Result<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| ReadError::new("clock_error", error.to_string()))
}

fn round_cents(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}
