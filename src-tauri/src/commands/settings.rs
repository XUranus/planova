use tauri::{AppHandle, Manager};
use crate::settings as settings_service;

const PROVIDER_KEYS: &[&str] = &["llm_vlm", "llm_chat", "llm_image"];

fn mask_providers(settings: &mut serde_json::Value) {
    for key in PROVIDER_KEYS {
        if let Some(provider) = settings.get_mut(*key) {
            let masked = provider
                .get("api_key")
                .and_then(|v| v.as_str())
                .map(|k| settings_service::mask_api_key(k));
            if let (Some(masked_key), Some(obj)) = (masked, provider.as_object_mut()) {
                obj.insert(
                    "api_key".to_string(),
                    serde_json::Value::String(masked_key),
                );
            }
        }
    }
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    let mut settings = settings_service::get_settings(&data_dir);
    mask_providers(&mut settings);
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
    let mut result = settings_service::update_settings(&data_dir, &data)?;
    mask_providers(&mut result);
    Ok(result)
}

#[tauri::command]
pub async fn test_llm_connection(
    app: AppHandle,
    provider: Option<String>,
    config_override: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    let capability = provider.as_deref().unwrap_or("vlm");

    let config = if let Some(override_val) = config_override {
        settings_service::LlmConfig {
            base_url: override_val.get("base_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            api_key: override_val.get("api_key").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            model: override_val.get("model").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        }
    } else {
        settings_service::get_llm_config_for(&data_dir, capability)
    };

    let mut result = serde_json::json!({
        "success": false,
        "api_reachable": false,
        "model_available": false,
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
    if config.model.is_empty() {
        result["error"] = serde_json::Value::String("Model name is empty".to_string());
        return Ok(result);
    }

    let client = reqwest::Client::new();
    let base = config.base_url.trim_end_matches('/');
    let t0 = std::time::Instant::now();

    // Image generation provider: use image API endpoint
    if capability == "image" {
        let url = if base.contains("dashscope") {
            format!("{}/api/v1/services/aigc/multimodal-generation/generation", base)
        } else {
            format!("{}/images/generations", base)
        };

        let req_body = if base.contains("dashscope") {
            serde_json::json!({
                "model": config.model,
                "input": {
                    "messages": [{
                        "role": "user",
                        "content": [{"text": "Test: reply with a simple blue square"}]
                    }]
                },
                "parameters": {"size": "512*512"}
            })
        } else {
            serde_json::json!({
                "model": config.model,
                "prompt": "Test: simple blue square",
                "n": 1,
                "size": "256x256",
                "response_format": "b64_json",
            })
        };

        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
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
                    result["details"]["endpoint"] = serde_json::Value::String(url);
                } else {
                    let status = response.status();
                    let body = response.text().await.unwrap_or_default();
                    result["error"] = serde_json::Value::String(
                        format!("HTTP {status}: {}", &body[..body.len().min(300)]),
                    );
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
        return Ok(result);
    }

    // Chat/VLM provider: use chat completions endpoint
    let chat_url = format!("{}/chat/completions", base);
    let req_body = serde_json::json!({
        "model": config.model,
        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        "max_tokens": 10,
        "temperature": 0.0,
    });

    let resp = client
        .post(&chat_url)
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
