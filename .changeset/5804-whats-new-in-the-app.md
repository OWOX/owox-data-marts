---
'owox': minor
---

**New features are easier to discover: each release shows what's new right in the app**

OWOX Data Marts ships a release every week, but the app itself never said so: to learn what changed, you had to open **Help → What's new** and read the changelog. A feature that removes a manual step could go unnoticed for weeks while people kept doing that step by hand. Now, once a release's what's-new video is published, the app shows it in a card in the bottom-left corner: the video, its chapters, each of which plays the video from that scene, and a link to the release in the changelog.

- The card opens every time you open the app until you close it with ×. After that, the release does not come back in that browser; the next release opens its own card.
- If a release still has no video three days after it ships, the card lists the release's changes instead.
- In a browser that has not shown the card before, it opens only in a project that already has a Data Mart, so a new user starts with the onboarding.
- The card and the onboarding videos never cover each other: the card waits for the next visit, and a video waits until the card is closed. The card never opens in view-only sessions.
- A self-hosted instance announces only releases up to its own version, which `/api/flags` now returns as `APP_OWOX_VERSION`. The app reads the list of releases from `https://docs.owox.com/docs/releases.json`, so a browser that cannot reach docs.owox.com shows no card.
