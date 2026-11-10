"""Slow synthetic provider for HTTP lifecycle tests."""
import sys
import threading
import time
from pathlib import Path

import uvicorn

from food_khata.contracts import AuthenticationError
from food_khata.providers.fake import FakeProvider
from food_khata.serve.app import create_app

root = Path(sys.argv[1])
app = create_app(root / "orders.db", data_root=root)


class SlowProvider(FakeProvider):
    def pages(self):
        if self.phone == "9876543211":
            raise AuthenticationError("verification required")
        for page in super().pages():
            time.sleep(0.3)
            yield page

    def dump_session(self):
        return {"access_token": "synthetic-checkpoint-token"}


def fast_cleanup():
    while not app.state.job_runner._cleanup_stop.wait(0.05):
        app.state.job_runner.drop_expired_keys(max_age_seconds=1)


@app.get("/api/test/key/{job_id}")
def has_job_key(job_id: str):
    with app.state.job_runner.lock:
        payload = app.state.job_runner.registered_payloads.get(job_id)
        return {"held": bool(payload and (payload.cipher_copy or payload.session_copy))}


app.router.routes.insert(0, app.router.routes.pop())
app.state.job_runner._cleanup_loop = fast_cleanup
app.state.provider_factory = lambda provider, phone=None, account_id=None: SlowProvider(
    provider=provider, phone=phone, account_id=account_id or phone, total_orders=6, page_size=2
)
server = uvicorn.Server(uvicorn.Config(
    app, host="127.0.0.1", port=int(sys.argv[2]), access_log=False, proxy_headers=False
))
if "--shutdown-stdin" in sys.argv[3:]:
    def shutdown_on_stdin():
        if sys.stdin.readline().strip() == "shutdown":
            server.should_exit = True

    threading.Thread(target=shutdown_on_stdin, daemon=True).start()
server.run()
