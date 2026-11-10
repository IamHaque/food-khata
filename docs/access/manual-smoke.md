# Manual real-account smoke checklist

Only the user should run this checklist, after reviewing the provider risks in
[security and recovery](security-and-recovery.md). Automated tests must never use
real provider accounts. Use a private data directory and trusted device; do not
share passwords, verification codes, sessions, logs or screenshots containing
personal data.

- [ ] Start the server, create the owner, and verify login and logout.
- [ ] Open a registration window, register a separate user, then close it.
- [ ] As that user, link one provider account and complete its verification.
- [ ] Start a background sync; verify progress, completion and imported orders.
- [ ] Check the dashboard at desktop and phone widths and verify the other user
      cannot see these orders or the linked account.
- [ ] If using LAN, verify the expected hostname and HTTPS certificate on each
      device. Confirm plain HTTP displays its warning.
- [ ] Review the result and explicitly approve or reject Gate GB. This checklist
      does not itself grant approval.
