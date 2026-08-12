---
'owox': patch
---

# Plugin publishing no longer fails during a safe synchronization cooldown

Repeated publishing now reuses the plugin's last validated version while a GitHub synchronization is cooling down. Authenticated GitHub App and server-token reads use a 30-second default cooldown; anonymous reads retain the safer 300-second default. A separate in-progress error is returned while another synchronization is still running.
