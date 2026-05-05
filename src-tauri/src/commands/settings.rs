use tauri::{AppHandle, Manager};
use crate::settings as settings_service;

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let mut settings = settings_service::get_settings(&data_dir);

    // Mask the API key
    if let Some(provider) = settings.get_mut("llm_provider") {
        let masked = provider
            .get("api_key")
            .and_then(|v| v.as_str())
            .map(|key| settings_service::mask_api_key(key));
        if let (Some(masked_key), Some(obj)) = (masked, provider.as_object_mut()) {
            obj.insert(
                "api_key".to_string(),
                serde_json::Value::String(masked_key),
            );
        }
    }

    Ok(settings)
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    data: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let updated = settings_service::update_settings(&data_dir, &data)?;

    // Mask the API key in response
    let mut result = updated;
    if let Some(provider) = result.get_mut("llm_provider") {
        let masked = provider
            .get("api_key")
            .and_then(|v| v.as_str())
            .map(|key| settings_service::mask_api_key(key));
        if let (Some(masked_key), Some(obj)) = (masked, provider.as_object_mut()) {
            obj.insert(
                "api_key".to_string(),
                serde_json::Value::String(masked_key),
            );
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn test_llm_connection(app: AppHandle) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let config = settings_service::get_llm_config(&data_dir);

    let mut result = serde_json::json!({
        "success": false,
        "api_reachable": false,
        "model_available": false,
        "multimodal_capable": false,
        "latency_ms": 0,
        "error": null,
        "details": {}
    });

    if config.api_key.is_empty() {
        result["error"] = serde_json::Value::String("API key is empty".to_string());
        return Ok(result);
    }
    if config.base_url.is_empty() {
        result["error"] = serde_json::Value::String("Base URL is empty".to_string());
        return Ok(result);
    }

    let client = reqwest::Client::new();

    // Test 1: Basic text completion
    let t0 = std::time::Instant::now();
    let req_body = serde_json::json!({
        "model": config.model,
        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        "max_tokens": 10,
        "temperature": 0.0,
    });

    let resp = client
        .post(format!("{}/chat/completions", config.base_url.trim_end_matches('/')))
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&req_body)
        .send()
        .await;

    match resp {
        Ok(response) => {
            let latency = t0.elapsed().as_millis() as f64;
            result["latency_ms"] = serde_json::json!(latency.round());

            if response.status().is_success() {
                result["api_reachable"] = serde_json::Value::Bool(true);
                result["model_available"] = serde_json::Value::Bool(true);

                if let Ok(body) = response.json::<serde_json::Value>().await {
                    let content = body
                        .get("choices")
                        .and_then(|c| c.get(0))
                        .and_then(|c| c.get("message"))
                        .and_then(|m| m.get("content"))
                        .and_then(|c| c.as_str())
                        .unwrap_or("");
                    result["details"]["text_response"] =
                        serde_json::Value::String(content.chars().take(100).collect());
                }
            } else {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                result["error"] =
                    serde_json::Value::String(format!("HTTP {status}: {}", &body[..body.len().min(200)]));
            }
        }
        Err(e) => {
            result["error"] = serde_json::Value::String(format!("Request failed: {e}"));
            return Ok(result);
        }
    }

    result["success"] = serde_json::Value::Bool(
        result["api_reachable"].as_bool().unwrap_or(false)
            && result["model_available"].as_bool().unwrap_or(false),
    );

    Ok(result)
}
