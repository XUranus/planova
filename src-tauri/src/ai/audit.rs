use std::path::Path;

pub fn log_llm_call(
    data_dir: &Path,
    model: &str,
    messages: &[serde_json::Value],
    response_content: &str,
    usage: Option<&serde_json::Value>,
    duration_ms: f64,
    error: Option<&str>,
) {
    let audit_dir = data_dir.join("llm_audit");
    if let Err(e) = std::fs::create_dir_all(&audit_dir) {
        log::warn!("Failed to create audit dir: {e}");
        return;
    }

    let date_str = chrono::Utc::now().format("%Y-%m-%d");
    let filepath = audit_dir.join(format!("llm_{date_str}.jsonl"));

    let record = serde_json::json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "model": model,
        "messages": messages,
        "response": response_content,
        "usage": usage.cloned().unwrap_or(serde_json::json!({})),
        "duration_ms": (duration_ms * 10.0).round() / 10.0,
        "error": error,
    });

    if let Ok(json) = serde_json::to_string(&record) {
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&filepath)
        {
            use std::io::Write;
            let _ = writeln!(file, "{json}");
        }
    }
}
