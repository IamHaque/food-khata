# Access, security and recovery

Run the server on the host machine, open its local address, and create the owner
on first use. The owner can open a registration window or share a rotated join
code with household members. Give each person their own user and password. Close
the registration window when finished and keep join codes private. Passwords
cannot be recovered from the app.

By default the server binds to loopback. For LAN access, use `food-khata serve
--lan --allow-host your-hostname` with a private data directory, and add
`--tls-cert` and `--tls-key` for HTTPS. The certificate must be trusted by the
clients. Plain HTTP exposes passwords, cookies and order data to network
observers. The host allow-list limits accepted Host headers; it is not a firewall
or a substitute for HTTPS. Restrict network access to trusted devices.

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
