use std::path::{Path, PathBuf};

use image::ImageFormat;

pub fn ensure_dirs(data_dir: &Path) -> Result<(), String> {
    for subdir in ["uploads", "previews", "logs", "llm_audit", "pipeline"] {
        let dir = data_dir.join(subdir);
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create {subdir} dir: {e}"))?;
    }
    Ok(())
}

pub fn upload_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("uploads")
}

pub fn preview_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("previews")
}

pub fn save_upload(data_dir: &Path, file_bytes: &[u8], original_filename: &str) -> Result<String, String> {
    let ext = Path::new(original_filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let filename = format!("{}.{ext}", uuid::Uuid::new_v4().simple());
    let path = upload_dir(data_dir).join(&filename);
    std::fs::write(&path, file_bytes)
        .map_err(|e| format!("Failed to write upload: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

pub fn generate_preview(storage_path: &str, data_dir: &Path) -> Result<String, String> {
    let src = Path::new(storage_path);
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("preview");
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");
    let preview_name = format!("{stem}_preview.{ext}");
    let preview_path = preview_dir(data_dir).join(&preview_name);

    let img = image::open(src).map_err(|e| format!("Failed to open image: {e}"))?;
    let thumbnail = img.resize(512, 512, image::imageops::FilterType::Lanczos3);
    thumbnail
        .save_with_format(&preview_path, ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to save preview: {e}"))?;

    Ok(preview_path.to_string_lossy().to_string())
}

pub fn delete_storage_file(path: &str) {
    if !path.is_empty() {
        let _ = std::fs::remove_file(path);
    }
}

pub fn read_file_as_base64(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("Failed to read file: {e}"))?;
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    };
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}
