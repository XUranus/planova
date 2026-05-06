use std::path::Path;

use serde_json::Value;

const DEFAULT_SETTINGS: &str = r#"{
    "language": "en-US",
    "llm_vlm": {
        "base_url": "",
        "api_key": "",
        "model": ""
    },
    "llm_chat": {
        "base_url": "",
        "api_key": "",
        "model": ""
    },
    "llm_image": {
        "base_url": "",
        "api_key": "",
        "model": ""
    }
}"#;

pub fn settings_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("settings.json")
}

pub fn get_settings(data_dir: &Path) -> Value {
    let path = settings_path(data_dir);
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(val) = serde_json::from_str::<Value>(&content) {
            return val;
        }
    }
    serde_json::from_str(DEFAULT_SETTINGS).unwrap_or_else(|_| serde_json::json!({}))
}

pub fn update_settings(data_dir: &Path, data: &Value) -> Result<Value, String> {
    let mut current = get_settings(data_dir);
    if let (Some(current_obj), Some(new_obj)) = (current.as_object_mut(), data.as_object()) {
        for (key, val) in new_obj {
            if let (Some(existing), true) = (current_obj.get(key), val.is_object()) {
                if let (Some(ex_obj), Some(v_obj)) = (existing.as_object(), val.as_object()) {
                    let mut merged = ex_obj.clone();
                    for (k, v) in v_obj {
                        merged.insert(k.clone(), v.clone());
                    }
                    current_obj.insert(key.clone(), Value::Object(merged));
                    continue;
                }
            }
            current_obj.insert(key.clone(), val.clone());
        }
    }
    let path = settings_path(data_dir);
    let json = serde_json::to_string_pretty(&current)
        .map_err(|e| format!("Failed to serialize settings: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write settings: {e}"))?;
    Ok(current)
}

pub struct LlmConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

/// Get LLM config for a specific capability: "vlm", "chat", or "image"
pub fn get_llm_config_for(data_dir: &Path, capability: &str) -> LlmConfig {
    let settings = get_settings(data_dir);
    let key = format!("llm_{capability}");
    let provider = settings.get(&key).cloned().unwrap_or_default();
    let get_str = |field: &str| -> String {
        provider
            .get(field)
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_default()
    };
    LlmConfig {
        base_url: get_str("base_url"),
        api_key: get_str("api_key"),
        model: get_str("model"),
    }
}

pub fn get_llm_config(data_dir: &Path) -> LlmConfig {
    get_llm_config_for(data_dir, "vlm")
}

pub fn mask_api_key(key: &str) -> String {
    if key.len() <= 4 {
        return "****".to_string();
    }
    format!("****{}", &key[key.len() - 4..])
}
