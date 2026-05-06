use std::path::Path;

use crate::settings::LlmConfig;

pub fn encode_image_base64(image_path: &str) -> Result<(String, String), String> {
    let bytes = std::fs::read(image_path).map_err(|e| format!("Failed to read image: {e}"))?;
    let ext = Path::new(image_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_lowercase();
    let media_type = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        _ => "image/png",
    };
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Ok((encoded, media_type.to_string()))
}

pub fn extract_json(text: &str) -> Result<serde_json::Value, String> {
    // Try direct parse
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(text) {
        return Ok(val);
    }

    // Try extracting from markdown code fence
    let re_fence = regex::Regex::new(r"```(?:json)?\s*\n?(.*?)\n?```")
        .map_err(|e: regex::Error| e.to_string())?;
    if let Some(caps) = re_fence.captures(text) {
        if let Some(m) = caps.get(1) {
            let s = m.as_str().trim();
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(s) {
                return Ok(val);
            }
        }
    }

    // Try finding {"detected_rooms" block
    if let Some(start) = text.find(r#"{"detected_rooms""#) {
        if let Some(end) = text.rfind('}') {
            if end > start {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text[start..=end]) {
                    return Ok(val);
                }
            }
        }
    }

    // Try first { to last }
    if let Some(start) = text.find('{') {
        if let Some(end) = text.rfind('}') {
            if end > start {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text[start..=end]) {
                    return Ok(val);
                }
            }
        }
    }

    Err(format!(
        "Could not extract JSON from response ({} chars): {}...",
        text.len(),
        text.chars().take(300).collect::<String>()
    ))
}

pub fn extract_message_content(body: &serde_json::Value) -> String {
    // Standard content field
    if let Some(content) = body
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
    {
        let trimmed = content.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    // reasoning_content for reasoning models
    if let Some(reasoning) = body
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("reasoning_content"))
        .and_then(|r| r.as_str())
    {
        let trimmed = reasoning.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    String::new()
}

pub async fn call_vlm(
    image_path: &str,
    config: &LlmConfig,
    data_dir: &Path,
) -> Result<serde_json::Value, String> {
    let (b64_image, media_type) = encode_image_base64(image_path)?;
    log::info!(
        "Encoded image {} ({} base64 chars)",
        image_path,
        b64_image.len()
    );

    let client = reqwest::Client::new();
    let url = format!(
        "{}/chat/completions",
        config.base_url.trim_end_matches('/')
    );

    let messages = serde_json::json!([
        {
            "role": "system",
            "content": crate::ai::prompts::FLOORPLAN_PARSE_SYSTEM,
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": crate::ai::prompts::FLOORPLAN_PARSE_USER,
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": format!("data:{media_type};base64,{b64_image}"),
                        "detail": "high",
                    },
                },
            ],
        },
    ]);

    let request_body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "max_tokens": 16384,
        "temperature": 0.1,
    });

    log::info!("Calling VLM model={} base_url={}", config.model, config.base_url);

    let t0 = std::time::Instant::now();
    let mut error_msg: Option<String> = None;
    let mut response_content = String::new();
    let mut usage: Option<serde_json::Value> = None;

    let result = match client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&request_body)
        .send()
        .await
    {
        Ok(response) => {
            let duration_ms = t0.elapsed().as_millis() as f64;

            if !response.status().is_success() {
                let status = response.status();
                let body_text = response.text().await.unwrap_or_default();
                error_msg = Some(format!("HTTP {status}: {}", &body_text[..body_text.len().min(200)]));
                Err(error_msg.clone().unwrap())
            } else {
                match response.json::<serde_json::Value>().await {
                    Ok(body) => {
                        response_content = extract_message_content(&body);
                        usage = body.get("usage").cloned();

                        log::info!(
                            "VLM response: {} chars, {} tokens, {:.0}ms",
                            response_content.len(),
                            usage.as_ref()
                                .and_then(|u| u.get("total_tokens"))
                                .and_then(|t| t.as_u64())
                                .unwrap_or(0),
                            duration_ms
                        );

                        if response_content.is_empty() {
                            Err("VLM returned empty response".to_string())
                        } else {
                            extract_json(&response_content)
                        }
                    }
                    Err(e) => {
                        error_msg = Some(format!("Failed to parse response: {e}"));
                        Err(error_msg.clone().unwrap())
                    }
                }
            }
        }
        Err(e) => {
            let duration_ms = t0.elapsed().as_millis() as f64;
            error_msg = Some(format!("Request failed: {e}"));
            log::error!("VLM call failed after {duration_ms:.0}ms: {e}");
            Err(error_msg.clone().unwrap())
        }
    };

    // Audit log
    let messages_arr = vec![serde_json::json!({
        "role": "system",
        "content": crate::ai::prompts::FLOORPLAN_PARSE_SYSTEM,
    })];
    crate::ai::audit::log_llm_call(
        data_dir,
        &config.model,
        &messages_arr,
        &response_content,
        usage.as_ref(),
        t0.elapsed().as_millis() as f64,
        error_msg.as_deref(),
    );

    result
}

pub async fn call_llm_text(
    messages: &[serde_json::Value],
    config: &LlmConfig,
    data_dir: &Path,
    max_tokens: u32,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/chat/completions",
        config.base_url.trim_end_matches('/')
    );

    let request_body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.3,
    });

    let t0 = std::time::Instant::now();
    let mut error_msg: Option<String> = None;
    let mut response_content = String::new();
    let mut usage: Option<serde_json::Value> = None;

    let result = match client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&request_body)
        .send()
        .await
    {
        Ok(response) => {
            if !response.status().is_success() {
                let status = response.status();
                error_msg = Some(format!("HTTP {status}"));
                Err(error_msg.clone().unwrap())
            } else {
                match response.json::<serde_json::Value>().await {
                    Ok(body) => {
                        response_content = extract_message_content(&body);
                        usage = body.get("usage").cloned();

                        if response_content.is_empty() {
                            Err("LLM returned empty response".to_string())
                        } else {
                            Ok(response_content.clone())
                        }
                    }
                    Err(e) => {
                        error_msg = Some(format!("Failed to parse response: {e}"));
                        Err(error_msg.clone().unwrap())
                    }
                }
            }
        }
        Err(e) => {
            error_msg = Some(format!("Request failed: {e}"));
            Err(error_msg.clone().unwrap())
        }
    };

    // Audit log
    crate::ai::audit::log_llm_call(
        data_dir,
        &config.model,
        messages,
        &response_content,
        usage.as_ref(),
        t0.elapsed().as_millis() as f64,
        error_msg.as_deref(),
    );

    result
}

/// Call an image generation API. Sends a screenshot image + style prompt.
/// Supports:
/// 1. Qwen DashScope multimodal generation API (when base_url contains "dashscope")
/// 2. OpenAI DALL-E style /images/generations
/// 3. Chat completions with image input
pub async fn call_image_gen(
    screenshot_b64: &str,
    style_description: &str,
    config: &LlmConfig,
    data_dir: &Path,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let base = config.base_url.trim_end_matches('/');
    let t0 = std::time::Instant::now();

    // Strategy 1: Qwen DashScope multimodal generation API
    if base.contains("dashscope") {
        log::info!("Using Qwen DashScope image generation API");
        let url = format!("{}/api/v1/services/aigc/multimodal-generation/generation", base);

        let prompt = format!(
            "Based on this 3D interior model screenshot, generate a photorealistic interior rendering. Style: {}. Maintain the exact room layout, proportions, and spatial relationships from the screenshot. Apply realistic lighting, materials, and textures.",
            style_description
        );

        let body = serde_json::json!({
            "model": config.model,
            "input": {
                "messages": [{
                    "role": "user",
                    "content": [
                        {"image": format!("data:image/png;base64,{screenshot_b64}")},
                        {"text": prompt}
                    ]
                }]
            },
            "parameters": {
                "prompt_extend": true,
                "watermark": false,
                "size": "1024*1024"
            }
        });

        match client
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    if let Ok(body) = response.json::<serde_json::Value>().await {
                        // Try to extract image URL from response
                        if let Some(img_url) = body
                            .get("output")
                            .and_then(|o| o.get("choices"))
                            .and_then(|c| c.get(0))
                            .and_then(|c| c.get("message"))
                            .and_then(|m| m.get("content"))
                            .and_then(|c| c.get(0))
                            .and_then(|c| c.get("image"))
                            .and_then(|i| i.as_str())
                        {
                            let duration_ms = t0.elapsed().as_millis() as f64;
                            log::info!("DashScope image gen: {:.0}ms, URL={}", duration_ms, &img_url[..img_url.len().min(80)]);

                            // Fetch the image and convert to base64
                            match client.get(img_url).send().await {
                                Ok(img_resp) => {
                                    if img_resp.status().is_success() {
                                        if let Ok(bytes) = img_resp.bytes().await {
                                            let b64 = base64::Engine::encode(
                                                &base64::engine::general_purpose::STANDARD,
                                                &bytes,
                                            );
                                            log::info!("Fetched rendered image: {} bytes -> {} base64 chars", bytes.len(), b64.len());
                                            return Ok(b64);
                                        }
                                    }
                                }
                                Err(e) => log::warn!("Failed to fetch image URL: {e}"),
                            }
                            // Return URL as fallback
                            return Ok(img_url.to_string());
                        }
                    }
                } else {
                    let status = response.status();
                    let body_text = response.text().await.unwrap_or_default();
                    return Err(format!("DashScope HTTP {status}: {}", &body_text[..body_text.len().min(300)]));
                }
            }
            Err(e) => return Err(format!("DashScope request failed: {e}")),
        }
    }

    // Strategy 2: OpenAI DALL-E style /images/generations
    let images_url = format!("{}/images/generations", base);
    let images_body = serde_json::json!({
        "model": config.model,
        "prompt": format!("Style: {}. Generate a photorealistic interior rendering.", style_description),
        "n": 1,
        "size": "1024x1024",
        "response_format": "b64_json",
    });

    let resp = client
        .post(&images_url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&images_body)
        .send()
        .await;

    if let Ok(response) = resp {
        if response.status().is_success() {
            if let Ok(body) = response.json::<serde_json::Value>().await {
                if let Some(b64) = body
                    .get("data")
                    .and_then(|d| d.get(0))
                    .and_then(|d| d.get("b64_json"))
                    .and_then(|b| b.as_str())
                {
                    let duration_ms = t0.elapsed().as_millis() as f64;
                    log::info!("Image gen via /images/generations: {:.0}ms", duration_ms);
                    return Ok(b64.to_string());
                }
            }
        }
    }

    // Strategy 3: Chat completions with image input
    let chat_url = format!("{}/chat/completions", base);
    let system_prompt = crate::ai::prompts::RENDER_IMAGE_SYSTEM;
    let user_prompt = crate::ai::prompts::RENDER_IMAGE_USER_TEMPLATE
        .replace("{style_description}", style_description);

    let messages = serde_json::json!([
        {
            "role": "system",
            "content": system_prompt,
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": user_prompt,
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": format!("data:image/png;base64,{screenshot_b64}"),
                        "detail": "high",
                    },
                },
            ],
        },
    ]);

    let chat_body = serde_json::json!({
        "model": config.model,
        "messages": messages,
        "max_tokens": 4096,
        "temperature": 0.7,
    });

    let mut error_msg: Option<String> = None;

    let result = match client
        .post(&chat_url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&chat_body)
        .send()
        .await
    {
        Ok(response) => {
            if !response.status().is_success() {
                let status = response.status();
                let body_text = response.text().await.unwrap_or_default();
                Err(format!("HTTP {status}: {}", &body_text[..body_text.len().min(200)]))
            } else {
                match response.json::<serde_json::Value>().await {
                    Ok(body) => {
                        if let Some(content) = body
                            .get("choices")
                            .and_then(|c| c.get(0))
                            .and_then(|c| c.get("message"))
                            .and_then(|m| m.get("content"))
                        {
                            if let Some(arr) = content.as_array() {
                                for part in arr {
                                    if let Some(img_url) = part
                                        .get("image_url")
                                        .and_then(|iu| iu.get("url"))
                                        .and_then(|u| u.as_str())
                                    {
                                        if let Some((_, b64_data)) = img_url.split_once("base64,") {
                                            return Ok(b64_data.to_string());
                                        }
                                        return Ok(img_url.to_string());
                                    }
                                }
                            }
                            if let Some(s) = content.as_str() {
                                if s.len() > 100
                                    && !s.contains('{')
                                    && base64::Engine::decode(
                                        &base64::engine::general_purpose::STANDARD,
                                        &s[..s.len().min(100)],
                                    ).is_ok()
                                {
                                    return Ok(s.to_string());
                                }
                            }
                        }
                        error_msg = Some("Response did not contain an image".to_string());
                        Err("Response did not contain an image".to_string())
                    }
                    Err(e) => {
                        error_msg = Some(format!("Failed to parse response: {e}"));
                        Err(format!("Failed to parse response: {e}"))
                    }
                }
            }
        }
        Err(e) => {
            error_msg = Some(format!("Request failed: {e}"));
            Err(format!("Request failed: {e}"))
        }
    };

    crate::ai::audit::log_llm_call(
        data_dir,
        &config.model,
        &[serde_json::json!({"role": "system", "content": system_prompt})],
        "[image generation]",
        None,
        t0.elapsed().as_millis() as f64,
        error_msg.as_deref(),
    );

    result
}
