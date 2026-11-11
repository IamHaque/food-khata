"""Load, soak and kill harness for PR-18."""

import argparse
import multiprocessing
import os
import random
import shutil
import socket
import sqlite3
import statistics
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

PW = "synthetic-pass-14"


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _run_server(data_dir, port):
    os.environ["FOOD_KHATA_ENABLE_FAKE_PROVIDER"] = "1"
    import uvicorn

    from food_khata.providers.fake import FakeProvider
    from food_khata.serve.app import create_app

    app = create_app(Path(data_dir) / "orders.db", app_db_path=Path(data_dir) / "app.db", data_root=Path(data_dir))
    class Paced(FakeProvider):  # 300 orders at about 4 ms each, so a kill 0.1 to 0.6 s in lands mid-sync
        def details(self, order_id):
            time.sleep(0.004)
            return super().details(order_id)

    app.state.provider_factory = lambda provider, phone=None, **kwargs: Paced(
        provider=provider, account_id="id-" + (phone or "x"), total_orders=300, page_size=10, **kwargs
    )
    uvicorn.run(app, host="127.0.0.1", port=port, access_log=False, proxy_headers=False)


def _wait_health(base, timeout=30):
    import httpx

    end = time.time() + timeout
    while time.time() < end:
        try:
            r = httpx.get(f"{base}/health", timeout=2)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(0.2)
    return False


def _csrf(client):
    r = client.get("/api/auth/csrf")
    r.raise_for_status()
    token = r.json()["csrf_token"]
    client.headers["X-CSRF-Token"] = token
    return token


def _claim_owner(client):
    _csrf(client)
    r = client.post("/api/owner/setup", json={"username": "owner", "password": PW})
    r.raise_for_status()
    return r.json()["id"]


def _login(client, username="owner", password=PW):
    _csrf(client)
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    if r.status_code >= 400:
        print("LOGIN FAIL", r.status_code, r.text[:200])
    r.raise_for_status()
    _csrf(client)
    return r


def _link_account(client, provider="fake", phone="9876543210"):
    _csrf(client)
    r = client.post("/api/accounts/link/start", json={"provider": provider, "phone": phone})
    r.raise_for_status()
    handle = r.json()["handle"]
    r = client.post("/api/accounts/link/verify", json={"handle": handle, "code": "123456"})
    r.raise_for_status()
    return r.json()["id"]


def _db_counts(data_dir, user_id):
    db_path = Path(data_dir) / "users" / user_id / "food_analytics.db"
    conn = sqlite3.connect(db_path)
    try:
        orders = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        distinct = conn.execute("SELECT COUNT(DISTINCT platform_order_id) FROM orders").fetchone()[0]
    finally:
        conn.close()
    return orders, orders - distinct


def run_kill_suite(runs, out_root):
    import httpx

    out_root = Path(out_root)
    out_root.mkdir(parents=True, exist_ok=True)

    # baseline uninterrupted run
    base_dir = out_root / "kill-baseline"
    if base_dir.exists():
        shutil.rmtree(base_dir)
    base_dir.mkdir(parents=True)
    port = _free_port()
    proc = multiprocessing.Process(target=_run_server, args=(str(base_dir), port), daemon=True)
    proc.start()
    base_url = f"http://127.0.0.1:{port}"
    assert _wait_health(base_url), "baseline server did not start"
    client = httpx.Client(base_url=base_url, timeout=30)
    owner_id = _claim_owner(client)
    account_id = _link_account(client, "zomato")
    r = client.post("/api/sync/jobs", json={"account_id": account_id, "provider": "zomato", "mode": "all"})
    r.raise_for_status()
    job_id = r.json()["id"]
    # wait done
    end = time.time() + 60
    while time.time() < end:
        jr = client.get(f"/api/sync/jobs/{job_id}")
        if jr.json()["status"] in ("done", "failed", "interrupted", "cancelled"):
            break
        time.sleep(0.2)
    assert jr.json()["status"] == "done", jr.json()
    base_orders, base_dups = _db_counts(base_dir, owner_id)
    client.close()
    proc.kill()
    proc.join(timeout=10)

    for i in range(runs):
        run_dir = out_root / f"kill-run-{i}"
        if run_dir.exists():
            shutil.rmtree(run_dir)
        run_dir.mkdir(parents=True)
        port = _free_port()
        proc = multiprocessing.Process(target=_run_server, args=(str(run_dir), port), daemon=True)
        proc.start()
        base_url = f"http://127.0.0.1:{port}"
        assert _wait_health(base_url), "server did not start"
        client = httpx.Client(base_url=base_url, timeout=30)
        owner_id = _claim_owner(client)
        account_id = _link_account(client, "zomato")
        r = client.post("/api/sync/jobs", json={"account_id": account_id, "provider": "zomato", "mode": "all"})
        r.raise_for_status()
        job_id = r.json()["id"]
        delay = random.uniform(0.1, 0.6)
        time.sleep(delay)
        proc.kill()
        proc.join(timeout=10)

        # restart
        port2 = _free_port()
        # reuse same port? restart on same data folder but port can differ
        proc2 = multiprocessing.Process(target=_run_server, args=(str(run_dir), port2), daemon=True)
        proc2.start()
        base_url2 = f"http://127.0.0.1:{port2}"
        assert _wait_health(base_url2), "restart server did not start"
        client2 = httpx.Client(base_url=base_url2, timeout=30)
        _login(client2, "owner", PW)
        # resume
        r = client2.post(f"/api/sync/jobs/{job_id}/resume")
        if r.status_code not in (200, 201):
            # job may already be done? try list
            pass
        # wait done
        end = time.time() + 60
        while time.time() < end:
            jr = client2.get(f"/api/sync/jobs/{job_id}")
            st = jr.json()["status"]
            if st in ("done", "failed", "interrupted", "cancelled"):
                break
            time.sleep(0.2)
        final_status = jr.json()["status"]
        assert final_status == "done", (i, jr.json())
        orders, dups = _db_counts(run_dir, owner_id)
        client2.close()
        proc2.kill()
        proc2.join(timeout=10)
        if (orders, dups) != (base_orders, base_dups):
            raise AssertionError(f"run {i}: counts {orders}/{dups} != baseline {base_orders}/{base_dups}")
    print(f"kill suite ok: baseline orders={base_orders} dups={base_dups} runs={runs}")


def _percentile(vals, p):
    if not vals:
        return 0.0
    s = sorted(vals)
    idx = int(len(s) * p / 100.0)
    idx = min(idx, len(s) - 1)
    return s[idx]


def mixed_load(args):
    import httpx

    tmp = Path(tempfile.mkdtemp(prefix="food-khata-load-"))
    data_root = tmp / "data"
    data_root.mkdir(parents=True)
    # generate analytics db
    from scripts.make_dev_db import generate

    src_db = generate(tmp / "src", large=True)

    port = _free_port()
    from food_khata.serve.app import create_app

    app = create_app(data_root / "orders.db", app_db_path=data_root / "app.db", data_root=data_root)
    app.state.provider_factory = lambda provider, phone=None, **kwargs: __import__(
        "food_khata.providers.fake", fromlist=["FakeProvider"]
    ).FakeProvider(provider=provider, account_id="id-" + (phone or "x"), **kwargs)

    import uvicorn

    config = uvicorn.Config(app, host="127.0.0.1", port=port, access_log=False, proxy_headers=False)
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    while not server.started:
        time.sleep(0.1)
    base_url = f"http://127.0.0.1:{port}"

    client0 = httpx.Client(base_url=base_url, timeout=30)
    owner_id = _claim_owner(client0)
    # open registration window
    _csrf(client0)
    client0.post("/api/owner/window", json={"action": "open", "duration_seconds": 3600})
    # register 7 more users
    user_ids = [owner_id]
    user_creds = [("owner", PW)]
    for i in range(1, args.users):
        uname = f"user{i}"
        _csrf(client0)
        r = client0.post("/api/auth/register", json={"username": uname, "password": PW})
        r.raise_for_status()
        uid = r.json()["id"]
        user_ids.append(uid)
        user_creds.append((uname, PW))
    client0.close()

    # login each user to create vault, then copy analytics db
    for uname, pw in user_creds:
        c = httpx.Client(base_url=base_url, timeout=30)
        _login(c, uname, pw)
        c.close()
    for uid in user_ids:
        dest = data_root / "users" / uid / "food_analytics.db"
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src_db, dest)

    # link accounts for syncers
    syncer_indices = list(range(args.users - args.syncers, args.users))
    syncer_accounts = {}
    for j, idx in enumerate(syncer_indices):
        uname, pw = user_creds[idx]
        c = httpx.Client(base_url=base_url, timeout=30)
        _login(c, uname, pw)
        phone = f"98765432{10 + j:02d}"
        acc = _link_account(c, "zomato", phone)
        syncer_accounts[idx] = acc
        c.close()

    browsers = list(range(args.browsers))
    syncers = syncer_indices

    stop_event = threading.Event()
    stats_lock = threading.Lock()
    latencies = {"/api/dashboard": [], "/api/orders": [], "/api/meta/filters": [], "/api/items": []}
    counters = {"5xx": 0, "locked": 0, "total": 0}

    def record(endpoint, status, latency_ms, text):
        with stats_lock:
            counters["total"] += 1
            if status >= 500:
                counters["5xx"] += 1
            if "database is locked" in (text or "") or "database_unavailable" in (text or ""):
                counters["locked"] += 1
            if endpoint in latencies:
                latencies[endpoint].append(latency_ms)

    def browser_worker(idx):
        uname, pw = user_creds[idx]
        client = httpx.Client(base_url=base_url, timeout=30)
        _login(client, uname, pw)
        i = 0
        while not stop_event.is_set():
            try:
                # dashboard
                t0 = time.perf_counter()
                body = {"sections": ["overview", "spending", "food", "behavior", "places"]}
                r = client.post("/api/dashboard", json=body)
                record("/api/dashboard", r.status_code, (time.perf_counter() - t0) * 1000, r.text)
                # orders
                t0 = time.perf_counter()
                r = client.get("/api/orders", params={"page": (i % 5) + 1, "page_size": 50, "sort": "date"})
                record("/api/orders", r.status_code, (time.perf_counter() - t0) * 1000, r.text)
                # meta filters
                t0 = time.perf_counter()
                r = client.get("/api/meta/filters")
                record("/api/meta/filters", r.status_code, (time.perf_counter() - t0) * 1000, r.text)
                # items
                t0 = time.perf_counter()
                r = client.get("/api/items")
                record("/api/items", r.status_code, (time.perf_counter() - t0) * 1000, r.text)
            except Exception:
                with stats_lock:
                    counters["5xx"] += 1
            i += 1
            time.sleep(0.05)
        client.close()

    def syncer_worker(idx):
        uname, pw = user_creds[idx]
        acc = syncer_accounts[idx]
        client = httpx.Client(base_url=base_url, timeout=30)
        _login(client, uname, pw)
        while not stop_event.is_set():
            try:
                _csrf(client)
                r = client.post("/api/sync/jobs", json={"account_id": acc, "provider": "zomato", "mode": "all"})
                with stats_lock:
                    counters["total"] += 1
                    if r.status_code >= 500:
                        counters["5xx"] += 1
                    if "database is locked" in (r.text or "") or "database_unavailable" in (r.text or ""):
                        counters["locked"] += 1
                if r.status_code in (200, 201):
                    job_id = r.json()["id"]
                    endw = time.time() + 30
                    while not stop_event.is_set() and time.time() < endw:
                        jr = client.get(f"/api/sync/jobs/{job_id}")
                        if jr.status_code >= 500:
                            with stats_lock:
                                counters["5xx"] += 1
                        if jr.json().get("status") in ("done", "failed", "interrupted", "cancelled"):
                            break
                        time.sleep(0.2)
            except Exception:
                with stats_lock:
                    counters["5xx"] += 1
            time.sleep(0.5)
        client.close()

    threads = []
    for idx in browsers:
        t = threading.Thread(target=browser_worker, args=(idx,), daemon=True)
        threads.append(t)
    for idx in syncers:
        t = threading.Thread(target=syncer_worker, args=(idx,), daemon=True)
        threads.append(t)
    for t in threads:
        t.start()

    # soak sampling
    samples = []
    soak_stop = threading.Event()

    def sampler():
        while not soak_stop.is_set():
            try:
                status_text = Path(f"/proc/{os.getpid()}/status").read_text()
            except Exception:
                status_text = ""
            rss = None
            thr = None
            for line in status_text.splitlines():
                if line.startswith("VmRSS:"):
                    rss = int(line.split()[1])
                if line.startswith("Threads:"):
                    thr = int(line.split()[1])
            try:
                fds = len(os.listdir(f"/proc/{os.getpid()}/fd"))
            except Exception:
                fds = None
            samples.append({"t": time.time(), "rss": rss, "threads": thr, "fds": fds})
            for _ in range(300):
                if soak_stop.is_set():
                    break
                time.sleep(0.1)

    sampler_thread = None
    if args.soak:
        sampler_thread = threading.Thread(target=sampler, daemon=True)
        sampler_thread.start()

    duration = args.duration
    end_time = time.time() + duration
    while time.time() < end_time:
        time.sleep(1)

    stop_event.set()
    if sampler_thread:
        soak_stop.set()
        sampler_thread.join(timeout=5)
    for t in threads:
        t.join(timeout=30)

    # print table
    print("\nMixed load results:")
    print(f"5xx={counters['5xx']} locked={counters['locked']} total={counters['total']}")
    for ep in latencies:
        vals = latencies[ep]
        print(f"{ep}: n={len(vals)} p50={_percentile(vals,50):.1f} p95={_percentile(vals,95):.1f} p99={_percentile(vals,99):.1f}")

    # soak assertions
    if args.soak and len(samples) >= 2:
        # minute 5 sample
        start_t = samples[0]["t"]
        min5_idx = 0
        for idx, s in enumerate(samples):
            if s["t"] - start_t >= 300:
                min5_idx = idx
                break
        else:
            min5_idx = min(len(samples) - 1, 9)
        min5 = samples[min5_idx]
        last = samples[-1]
        print("\nSoak samples:")
        for s in samples:
            print(f"t+{s['t']-start_t:.0f}s rss={s['rss']}KB threads={s['threads']} fds={s['fds']}")
        if min5["rss"] and last["rss"]:
            assert last["rss"] <= 1.10 * min5["rss"], (last["rss"], min5["rss"])
        # fds and threads wobble by a few between samples (open sockets): compare medians, not single samples
        def med(key, rows):
            return statistics.median(r[key] for r in rows)

        base, tail = samples[min5_idx : min5_idx + 10], samples[-10:]
        for key in ("fds", "threads"):
            assert med(key, tail) <= 1.10 * med(key, base) + 2, (key, med(key, tail), med(key, base))

    # write docs table
    try:
        docs = ROOT / "docs" / "PERFORMANCE.md"
        text = docs.read_text()
        marker = "<!-- mixed-load -->"
        i1 = text.index(marker)
        i2 = text.index(marker, i1 + 1)
        rows = ["| Endpoint | p50 ms | p95 ms | p99 ms | n |", "|---|---|---|---|---|"]
        for ep in latencies:
            vals = latencies[ep]
            rows.append(f"| {ep} | {_percentile(vals,50):.1f} | {_percentile(vals,95):.1f} | {_percentile(vals,99):.1f} | {len(vals)} |")
        rows.append(f"| 5xx total | {counters['5xx']} | locked | {counters['locked']} | total {counters['total']} |")
        table = "\n".join(rows)
        text = text[: i1 + len(marker)] + "\n" + table + "\n" + text[i2:]
        docs.write_text(text)
    except Exception as e:
        print("docs write failed:", e)

    server.should_exit = True
    thread.join(timeout=10)

    if counters["5xx"] > 0:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd")
    kill_p = sub.add_parser("kill")
    kill_p.add_argument("--runs", type=int, default=20)

    parser.add_argument("--duration", type=int, default=300)
    parser.add_argument("--users", type=int, default=8)
    parser.add_argument("--browsers", type=int, default=6)
    parser.add_argument("--syncers", type=int, default=2)
    parser.add_argument("--soak", action="store_true")
    args = parser.parse_args()

    if args.cmd == "kill":
        tmp = Path(tempfile.mkdtemp(prefix="food-khata-kill-"))
        run_kill_suite(args.runs, tmp)
        return

    mixed_load(args)


if __name__ == "__main__":
    main()
