"""Run the local dashboard server."""

import ipaddress
from pathlib import Path


def serve(host: str, port: int, db_path: Path, dev: bool = False) -> int:
    try:
        if host != "localhost" and not ipaddress.ip_address(host).is_loopback:
            raise ValueError
    except ValueError:
        print("Only loopback hosts are allowed.")
        return 1
    if not isinstance(port, int) or isinstance(port, bool) or not 1 <= port <= 65535:
        print("Port must be between 1 and 65535.")
        return 1
    try:
        import fastapi  # noqa: F401
        import uvicorn

        from .app import create_app
    except ImportError:
        print('Install the serve dependencies: pip install -e ".[serve]"')
        return 1
    app = create_app(db_path, dev=dev)
    dist = Path(__file__).resolve().parents[2] / "dashboard-ui" / "dist" / "index.html"
    if not dist.is_file():
        print("Dashboard build missing; API only. Run the dashboard UI separately.")
    print(f"http://{host if ':' not in host else '[' + host + ']'}:{port}")
    try:
        uvicorn.run(app, host=host, port=port, access_log=False)
    except OSError:
        print("Unable to start the server.")
        return 1
    except KeyboardInterrupt:
        print("Server stopped.")
        return 130
    return 0
