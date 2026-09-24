---
'owox': minor
---

# Models page no longer shows "Something went wrong" in tabs opened before a release

A browser tab opened before a release kept running the previous version of the app. The first time it opened **Data Marts → Models** or a Data Mart's **Relationships** tab after the release, it asked the server for a file that the new version no longer ships, and the page showed "Something went wrong" until you reloaded it yourself. The app now detects that case and reloads the tab once, so the page opens on the current version.
