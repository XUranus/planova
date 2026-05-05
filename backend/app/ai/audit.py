import json
from datetime import datetime, timezone
from typing import Any

from app.logging_config import get_logger

logger = get_logger("ai.audit")


def log_llm_call(
    model: str,
    messages: list[dict[str, Any]],
    response_content: str,
    usage: dict[str, Any] | None,
    duration_ms: float,
    error: str | None = None,
) -> None:
    """Append an LLM call record to a daily JSONL audit log."""
    try:
        from app.config import settings
        audit_dir = settings.audit_dir
        audit_dir.mkdir(parents=True, exist_ok=True)

        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        filepath = audit_dir / f"llm_{date_str}.jsonl"

        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "model": model,
            "messages": messages,
            "response": response_content,
            "usage": usage or {},
            "duration_ms": round(duration_ms, 1),
            "error": error,
        }

        with open(filepath, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        logger.debug("Audit logged to %s (%d chars response)", filepath, len(response_content))
    except Exception as e:
        logger.warning("Failed to write audit log: %s", e)
