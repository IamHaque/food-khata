# Food Khata runbook

For the person who runs the server. Assumes one household, one machine, one data folder.

## Rules to know first

- **One server per data folder.** A second `serve` on the same folder exits with code 2. The lock (`<data>/.server.lock`) is released when the process dies, so a crash never leaves a stale lock.
- **Backups are not encrypted** for archives and analytics. Provider sessions and vaults stay encrypted. Keep backup files private.
- **After every restart everyone logs in again** (sessions are not kept; their keys live in memory only).
- Provider APIs are unofficial and may block accounts. Default is one sync per provider at a time.

## Run

```
food-khata serve --data-dir /srv/food-khata            # this machine only
food-khata serve --data-dir /srv/food-khata --lan      # household network; prints a one-time setup code at start
food-khata serve --print-config                        # show the effective settings
```

Every flag also reads an environment variable `FOOD_KHATA_<FLAG>` (for example `FOOD_KHATA_PORT=9000`, `FOOD_KHATA_LAN=1`, `FOOD_KHATA_ALLOW_HOSTS=home.lan,nas.lan`). A flag on the command line wins. Behind an HTTPS proxy add `--behind-https-proxy` and `--trusted-proxy <proxy address>`.

Health: `GET /health` (alive), `GET /health/ready` (database opens, migrations current, housekeeping thread alive; 200 or 503, no details).
Logs: `<data>/logs/food-khata.log`, one JSON line per event, passwords, codes and phone numbers scrubbed, 10 MB x 5 files.

## Run as a service

**Linux (systemd)**, `/etc/systemd/system/food-khata.service`:

```
[Unit]
Description=Food Khata
After=network.target

[Service]
User=foodkhata
WorkingDirectory=/opt/food-khata
ExecStart=/opt/food-khata/.venv/bin/food-khata serve --data-dir /srv/food-khata --lan
Restart=on-failure
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now food-khata`. Stopping sends SIGTERM: running syncs checkpoint and become "interrupted (SHUTDOWN)" and can be resumed.

**Windows**, either:

- Task Scheduler: trigger "At startup", action `C:\food-khata\.venv\Scripts\food-khata.exe` with arguments `serve --data-dir D:\food-khata --lan`, "Run whether user is logged on or not", restart on failure.
- NSSM: `nssm install FoodKhata C:\food-khata\.venv\Scripts\food-khata.exe serve --data-dir D:\food-khata --lan`, then `nssm start FoodKhata`.

## Backup and restore

```
food-khata backup --out food-khata-backup.tar.gz --data-dir /srv/food-khata     # safe while the server runs
food-khata restore food-khata-backup.tar.gz --data-dir /srv/food-khata-new      # folder must be empty
```

The backup uses SQLite's backup API for every database and records a checksum for every file; restore refuses a damaged file or a folder that is not empty. Test a restore once on another folder before you need it.

## Update

1. Stop the server.
2. `food-khata backup --out before-update.tar.gz`
3. `git pull`, then `pip install -r requirements-lock.txt` and `npm --prefix dashboard-ui ci && npm --prefix dashboard-ui run build`.
4. Start the server. Database changes are versioned and additive; the first start after an update backs up `app.db` next to itself (`app.db.pre-vN.bak`) before changing it.

## Recovery

| Problem | What to do |
| --- | --- |
| Server will not start: "already using this data folder" | Another server runs on that folder. Stop it, or check `ps` / Task Manager. |
| Owner forgot the password | `food-khata owner reset-password --help` (run on the server, stop the server first). |
| Moving ownership to someone else | `food-khata owner transfer --help`, or Settings in the app. |
| Data damaged or disk replaced | `food-khata restore <backup> --data-dir <empty folder>`, start the server there. |
| Test accounts left from a trial | `food-khata purge-fake --data-dir <folder>` (asks first; `--yes` to skip). |
| Everyone suddenly logged out | Normal after a restart or after 8 hours idle / 7 days. |
| A user must be removed with all their data | There is no button yet. As the owner, send `POST /api/owner/users/<id>/remove` with `{"owner_password": "..."}`; it deletes their sessions, jobs, links and folder. |
