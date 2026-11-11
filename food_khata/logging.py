"""One JSON line per event with level, time, request id and user id; secrets and phone numbers are scrubbed."""

import contextvars
import json
import logging
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path

request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
user_id: contextvars.ContextVar[str] = contextvars.ContextVar("user_id", default="-")

_PATTERNS = (
    (re.compile(r"(?i)(password|passwd|secret|token|code|authorization|cookie)(['\"]?\s*[:=]\s*)\S+"), r"\1\2[redacted]"),
    (re.compile(r"\b\d{10,}\b"), "[redacted]"),  # phone numbers and long ids
)


def redact(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = None
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "request_id": request_id.get(),
            "user_id": user_id.get(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["exception"] = redact(self.formatException(record.exc_info))
        return json.dumps(entry)


def setup_logging(data_dir: Path | str) -> Path:
    """Rotating JSON log at <data-dir>/logs/food-khata.log: 10 MB, 5 files."""
    folder = Path(data_dir) / "logs"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "food-khata.log"
    handler = RotatingFileHandler(path, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8")
    handler.setFormatter(JsonFormatter())
    handler.addFilter(RedactFilter())
    root = logging.getLogger()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    return path
