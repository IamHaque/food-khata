"""Export the OpenAPI contract without opening a database."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from food_khata.serve.app import create_app  # noqa: E402

path = Path(__file__).resolve().parents[1] / "dashboard-ui/src/types/openapi.json"
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(create_app("unused.db").openapi(), indent=2) + "\n", encoding="utf-8")
