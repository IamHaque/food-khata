"""Host validation, LAN security, and origin verification (AC-11)."""

import ipaddress
import socket
from urllib.parse import urlsplit

from fastapi import Request
from fastapi.responses import JSONResponse

LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "testclient"})


def _get_system_hosts() -> set[str]:
    """Return local hostnames and bound interface IPs for LAN host validation."""
    hosts = set()
    try:
        name = socket.gethostname().lower()
        hosts.add(name)
        hosts.add(f"{name}.local")
        fqdn = socket.getfqdn().lower()
        hosts.add(fqdn)
        for info in socket.getaddrinfo(name, None):
            hosts.add(str(info[4][0]).lower())
    except Exception:
        pass
    return hosts


def get_allowed_hosts(
    allowed_hosts: list[str] | set[str] | None = None,
    lan: bool = False,
) -> set[str]:
    """Assemble normalized set of allowed hosts."""
    hosts = set(LOOPBACK_HOSTS)
    if lan:
        hosts.update(_get_system_hosts())
    if allowed_hosts:
        for item in allowed_hosts:
            if item:
                # Support comma-separated strings as well
                for sub in str(item).split(","):
                    norm = sub.strip().lower()
                    if norm:
                        hosts.add(norm)
    return hosts


def is_host_allowed(
    host: str,
    allowed_hosts: set[str] | list[str] | None = None,
    lan: bool = False,
) -> bool:
    """Validate whether an extracted hostname is allowed.

    - Loopback hosts are always allowed.
    - Explicitly allowed hosts (via allowed_hosts) are allowed.
    - In LAN mode, private network IP addresses and system hostnames/IPs are allowed.
    - Any unknown host returns False.
    """
    if not host or not isinstance(host, str):
        return False

    norm_host = host.strip().lower()
    if not norm_host:
        return False

    allowed_set = {h.lower() for h in allowed_hosts} if allowed_hosts else set()
    if "*" in allowed_set:
        return True

    # Check exact match in configured allowed hosts or base loopback
    if norm_host in allowed_set or norm_host in LOOPBACK_HOSTS:
        return True

    # Check IP addresses
    try:
        ip = ipaddress.ip_address(norm_host)
        if ip.is_loopback:
            return True
        if lan and ip.is_private:
            return True
    except ValueError:
        pass

    # Check against system hostnames and IPs if in LAN mode
    if lan:
        system_hosts = _get_system_hosts()
        if norm_host in system_hosts:
            return True

    return False


def validate_host_and_origin(
    request: Request,
    allowed_hosts: set[str] | list[str] | None = None,
    lan: bool = False,
) -> JSONResponse | None:
    """Validate Host and Origin headers on incoming HTTP requests.

    Returns HTTP 400 Bad Request for unknown/missing Host header.
    Returns HTTP 403 Forbidden for disallowed Origin or non-loopback access when LAN mode is off.
    Returns None if request is valid.
    """
    raw_host = request.headers.get("host", "").strip()
    if not raw_host:
        return JSONResponse(
            {"error": {"code": "bad_request", "message": "Host header is required."}},
            status_code=400,
        )

    try:
        parsed = urlsplit("//" + raw_host)
        hostname = parsed.hostname
    except Exception:
        hostname = None

    if not hostname or not is_host_allowed(hostname, allowed_hosts=allowed_hosts, lan=lan):
        return JSONResponse(
            {"error": {"code": "bad_request", "message": "Invalid or disallowed Host header."}},
            status_code=400,
        )

    # Maintain safety middleware origin check
    origin = request.headers.get("origin")
    if origin:
        origin_lower = origin.strip().lower()
        expected = {
            f"http://{raw_host.lower()}",
            f"https://{raw_host.lower()}",
            f"http://{hostname.lower()}",
            f"https://{hostname.lower()}",
        }
        if origin_lower not in expected:
            return JSONResponse(
                {"error": {"code": "forbidden", "message": "Disallowed origin."}},
                status_code=403,
            )

    # Check loopback enforcement when not in LAN mode
    allowed_set = {h.lower() for h in allowed_hosts} if allowed_hosts else set()
    is_explicitly_allowed = hostname in allowed_set or "*" in allowed_set

    try:
        is_loopback_host = (
            hostname in LOOPBACK_HOSTS
            or is_explicitly_allowed
            or bool(hostname and ipaddress.ip_address(hostname).is_loopback)
        )
    except ValueError:
        is_loopback_host = is_explicitly_allowed

    client_ip = request.client.host if request.client else "127.0.0.1"
    try:
        is_loopback_client = (
            client_ip in LOOPBACK_HOSTS
            or is_explicitly_allowed
            or bool(client_ip and ipaddress.ip_address(client_ip).is_loopback)
        )
    except ValueError:
        is_loopback_client = is_explicitly_allowed

    if not lan and (not is_loopback_host or not is_loopback_client):
        return JSONResponse(
            {"error": {"code": "forbidden", "message": "Local requests only."}},
            status_code=403,
        )

    return None
