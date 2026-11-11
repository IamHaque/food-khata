"""Run the local dashboard server."""

import ipaddress
from pathlib import Path


def serve(
    host: str = "127.0.0.1",
    port: int = 8765,
    db_path: Path | str | None = None,
    dev: bool = False,
    lan: bool = False,
    allow_hosts: list[str] | None = None,
    tls_cert: Path | str | None = None,
    tls_key: Path | str | None = None,
    data_root: Path | str | None = None,
    app_db_path: Path | str | None = None,
) -> int:
    is_https = False
    if tls_cert or tls_key:
        if not (tls_cert and tls_key):
            print("Both --tls-cert and --tls-key must be provided for HTTPS.")
            return 1
        cert_p = Path(tls_cert)
        key_p = Path(tls_key)
        if not cert_p.is_file():
            print(f"TLS certificate file not found: {tls_cert}")
            return 1
        if not key_p.is_file():
            print(f"TLS key file not found: {tls_key}")
            return 1
        is_https = True

    if lan:
        if host in ("127.0.0.1", "localhost", None, ""):
            host = "0.0.0.0"
    else:
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

    db = Path(db_path) if db_path is not None else Path("food_analytics.db")
    root = db.parent
    effective_data_root = data_root or root
    app = create_app(
        db,
        dev=dev,
        data_root=effective_data_root,
        app_db_path=app_db_path,
        lan=lan,
        allow_hosts=allow_hosts,
        is_https=is_https,
    )

    if lan:
        from food_khata.auth import connect_app_db, get_or_create_setup_code, has_owner

        conn = connect_app_db(app.state.app_db_path)
        try:
            if not has_owner(conn):
                setup_code = get_or_create_setup_code(conn)
                print(f"One-time setup code: {setup_code}")
        finally:
            conn.close()

    dist = Path(__file__).resolve().parents[2] / "dashboard-ui" / "dist" / "index.html"
    if not dist.is_file():
        print("Dashboard build missing; API only. Run the dashboard UI separately.")

    proto = "https" if is_https else "http"
    print(f"{proto}://{host if ':' not in host else '[' + host + ']'}:{port}")

    uvicorn_kwargs: dict[str, object] = {
        "host": host,
        "port": port,
        "access_log": False,
        "proxy_headers": False,
    }
    if is_https:
        uvicorn_kwargs["ssl_certfile"] = str(tls_cert)
        uvicorn_kwargs["ssl_keyfile"] = str(tls_key)

    try:
        uvicorn.run(app, **uvicorn_kwargs)
    except OSError:
        print("Unable to start the server.")
        return 1
    except KeyboardInterrupt:
        print("Server stopped.")
        return 130
    return 0
