---
'owox': minor
---

# Help videos now stream from Cloudflare instead of GitHub attachments

Three in-product help videos — "SQL to Google Sheets in Minutes", "Data Studio Setup", and "Getting Started with Data Marts" — used to load from GitHub issue-attachment storage. Those URLs redirect through short-lived signed links and fail entirely for clients whose networks block github.com, so the videos could show up broken.

Now all six help videos use the same Cloudflare Stream player. The three migrated videos keep their previous behavior (autoplay, muted, loop) and their exact aspect ratios.

The documentation site picks up the same fix: pages that embedded the GitHub-hosted files now render the Cloudflare player, while the repository markdown keeps the GitHub links so videos still play inline on github.com. The Google Sheets destination page also gains the setup walkthrough video.
