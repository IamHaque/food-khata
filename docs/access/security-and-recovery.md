# Access, security and recovery

Run the server on the host machine, open its local address, and create the owner
on first use. The owner can open a registration window or share a rotated join
code with household members. Give each person their own user and password. Close
the registration window when finished and keep join codes private. Passwords
cannot be recovered from the app.

By default the server binds to loopback (`127.0.0.1`). For LAN access, use `food-khata serve
--lan --allow-host your-hostname` with a private data directory (binds `0.0.0.0`), and add
`--tls-cert` and `--tls-key` for HTTPS (or `--behind-https-proxy` and `--trusted-proxy ADDR`).
Starting with `--lan` prints a 10-character one-time setup code (valid 30 minutes) at each start.
Claiming the owner from a non-loopback IP requires this setup code; 5 wrong codes within 10 minutes
lock out the IP with HTTP 429. Plain HTTP exposes passwords, cookies and order data to network
observers. The host allow-list limits accepted Host headers; it is not a firewall
or a substitute for HTTPS. Restrict network access to trusted devices.

Security baseline:
- **Cookies**: session cookie only, HttpOnly, SameSite=Lax. Marked `Secure` when TLS is active or `--behind-https-proxy` is set.
- **Proxy**: client IP for throttling uses `--trusted-proxy ADDR` to read `X-Forwarded-For`; untrusted client headers are ignored.
- **Headers**: CSP (`default-src 'self'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- **Limits**: 64 KB request body limit. Passwords must be at least 10 characters.
- **Sessions**: 8-hour idle timeout and 7-day absolute lifetime. All sessions are deleted on server start (re-login required after restart).
- **Audit trail**: Append-only log of logins and admin actions in `app.db`, viewable by the owner in Settings (`GET /api/owner/audit`).
- **Server concurrency**: Exactly one server process per data folder, enforced by `<data>/.server.lock`.

Application authorization separates users' dashboards, linked accounts and
jobs. Provider sessions and phone numbers in account credential metadata are encrypted at rest. Order archives and analytics databases are not encrypted and may retain full phone numbers and other personal data. New analytics imports retain only the last four phone digits for account labels. Protect the data directory and backups with OS
permissions. A host administrator, a compromised host or someone controlling the
running process can read files, passwords or decrypted data: application users
are not protected from the host administrator.

If a password is lost, stop the server and run `food-khata owner reset-password
--data-dir PATH` for the owner, or add `--username USER` for another user. The
command prints a temporary password if one is not supplied. Protect that output;
resetting invalidates sessions and provider credentials must be linked again.
To transfer ownership with the server stopped, use `food-khata owner transfer
--to USER --data-dir PATH`. Back up the private data directory before recovery.

The provider integrations use undocumented mobile APIs, a shared embedded key,
a spoofed app identity and TLS impersonation. This is likely against the
platforms' terms and may lead to account restrictions or blocks. Provider
behavior may change without notice. Decide whether to accept those risks before
linking an account; automated acceptance tests use only synthetic FakeProvider
data and never contact a real provider.

For personal data at rest, enable host full-disk encryption (for example, BitLocker on Windows or FileVault on macOS), restrict data-folder permissions, and encrypt backups separately. Archive payloads and analytics can retain full delivery addresses and coordinates; application credential encryption does not protect those files. Password reset preserves history under this scope. Wider history encryption would require a recovery key independent of the reset password to avoid making history unreadable.

See the [personal-data inventory](personal-data-inventory.md) for confirmed plaintext fields, including full delivery addresses and precise coordinates, and the limits of the synthetic evidence.
