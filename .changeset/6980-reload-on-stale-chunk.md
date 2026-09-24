---
'owox': minor
---

# Tabs opened before a release now explain why the Models page failed to load

A browser tab opened before a release keeps running the previous version of the app. The first time it opened **Data Marts → Models** or a Data Mart's **Relationships** tab after the release, it asked the server for a file that the new version no longer ships, and the page showed a generic "Something went wrong". The page now says "A new version is available", explains that the app was updated while the tab was open, and offers a **Reload Page** button that picks up the current version.
