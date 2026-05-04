import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

AUDIT_DIR = Path("llm_audit")


def _ensure_audit_dir() -> Path:
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    return AUDIT_DIR


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
        audit_dir = _ensure_audit_dir()
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
    except Exception:
        # Audit logging should never break the main flow
        pass
