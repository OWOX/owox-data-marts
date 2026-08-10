---
'owox': minor
---

# Connecting a Google account no longer fails intermittently

Authorizing Google BigQuery storage or a Google Sheets destination could fail at random — the popup would show a sign-in screen or an authorization error, and the connection would only succeed after several attempts.

The cause: the OAuth popup used to boot the entire application and sign in on its own. That sign-in competed with the main tab for the same single-use session credentials, and whichever window lost the race failed. The popup could also end up in a different project context than the tab that started the connection, which made the authorization attempt be rejected.

Now the popup only hands the authorization result back to the tab where you clicked "Connect with Google", and that tab completes the connection using its own session. One attempt is all it takes.
