---
"owox": minor
---

# Invalidate a user's other sessions on password reset and change

After a successful password change or reset, the user's other active sessions
are now revoked while the session performing the change is preserved. The
exposed Better Auth `/change-password` endpoint always revokes other sessions
(clients can no longer skip it), and a password reset revokes the user's other
Better Auth sessions.
