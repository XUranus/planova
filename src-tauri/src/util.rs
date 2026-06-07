/// Generate a new UUID v4 as a simple hex string (no dashes).
pub fn make_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}
