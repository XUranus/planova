use tauri::{AppHandle, Manager};

const STYLE_DESCRIPTIONS: &[(&str, &str)] = &[
    ("modern_luxury", "Modern luxury interior with marble, gold accents, sleek furniture, and warm ambient lighting"),
    ("cream", "Cream-toned interior with soft neutrals, rounded furniture, plush textures, and warm natural light"),
    ("nordic", "Nordic Scandinavian interior with light wood, white walls, minimal furniture, and natural daylight"),
    ("chinese", "New Chinese style with dark wood lattice, ink paintings, silk textures, and traditional-modern fusion"),
    ("wabi_sabi", "Wabi-sabi interior with raw concrete, imperfect ceramics, natural wood grain, and earthy tones"),
    ("industrial", "Industrial style with exposed brick, steel beams, concrete floors, Edison bulbs, and raw materials"),
];

fn style_to_description(style: &str) -> String {
    for (key, desc) in STYLE_DESCRIPTIONS {
        if *key == style {
            return desc.to_string();
        }
    }
    format!("{} interior design style", style)
}

#[tauri::command]
pub async fn export_render(
    app: AppHandle,
    screenshot_base64: String,
    style: String,
    prompt: Option<String>,
) -> Result<serde_json::Value, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    let config = crate::settings::get_llm_config_for(&data_dir, "image");
    if config.api_key.is_empty() {
        return Err("Image generation API key not configured. Please check Settings > Image Generation Provider.".to_string());
    }
    if config.base_url.is_empty() {
        return Err("Image generation Base URL not configured.".to_string());
    }
    if config.model.is_empty() {
        return Err("Image generation Model not configured.".to_string());
    }

    let render_prompt = prompt.unwrap_or_else(|| style_to_description(&style));

    log::info!(
        "Export render: style={}, model={}",
        style,
        config.model,
    );

    // Strip data URL prefix if present
    let b64_data = screenshot_base64
        .split_once("base64,")
        .map(|(_, b)| b)
        .unwrap_or(&screenshot_base64);

    let result_b64 = crate::ai::client::call_image_gen(b64_data, &render_prompt, &config, &data_dir)
        .await?;

    // Save render to disk
    let render_dir = data_dir.join("renders");
    std::fs::create_dir_all(&render_dir).map_err(|e| format!("Failed to create renders dir: {e}"))?;

    let render_filename = format!("render_{}.png", chrono::Utc::now().format("%Y%m%d_%H%M%S"));
    let render_path = render_dir.join(&render_filename);

    let image_bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        &result_b64,
    )
    .map_err(|e| format!("Failed to decode generated image: {e}"))?;

    std::fs::write(&render_path, &image_bytes)
        .map_err(|e| format!("Failed to write render: {e}"))?;

    log::info!("Render saved to {}", render_path.display());

    Ok(serde_json::json!({
        "success": true,
        "render_path": render_path.to_string_lossy(),
        "render_base64": result_b64,
    }))
}
