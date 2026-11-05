---
'owox': minor
---

**New features are easier to discover: each release shows what's new right in the app**

OWOX Data Marts ships a release every week, but the app itself never said so: to learn what changed, you had to open **Help → What's new** and read the changelog. A feature that removes a manual step could go unnoticed for weeks while people kept doing that step by hand. Now, once a release's what's-new video is published, the app shows it in a card in the bottom-left corner: the video, its chapters, each of which plays the video from that scene, and a link to the release in the changelog.

- The card appears once per release in each browser. The next release shows its own card.
- On a first visit to a project that has no Data Marts yet, the card stays closed, so a new user starts with the onboarding.
- If another video is already open, the card waits for the next visit. It never opens in view-only sessions.
- A self-hosted instance announces only releases up to its own version, which `/api/flags` now returns as `APP_OWOX_VERSION`. The app reads the list of releases from `https://docs.owox.com/docs/releases.json`, so a browser that cannot reach docs.owox.com shows no card.
