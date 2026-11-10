---
'owox': minor
---

**New features are easier to discover: each release shows what's new right in the app**

OWOX Data Marts ships a release every week, but the app itself never said so: to learn what changed, you had to open **Help → What's new** and read the changelog. A feature that removes a manual step could go unnoticed for weeks while people kept doing that step by hand. Now the app shows each new release in a card in the bottom-left corner: its what's-new video, the video's chapters, each of which plays the video from that scene, and a link to the release in the changelog.

- The card opens every time you open the app until you close it with ×. After that, the release does not come back in that browser; the next release opens its own card.
- The card waits for the release's video. If there is still no video three days after the release ships, the card lists the release's changes instead; once that card is closed, a video added later does not bring it back.
- In a browser where the card has never been closed, it opens only in a project that already has a Data Mart, so a new user starts with the onboarding.
- The card does not open over another video. A video can take its place, and the card then comes back on the next visit. The card never opens in view-only sessions.
- A self-hosted instance announces only releases up to its own version, which `/api/flags` now returns as `APP_OWOX_VERSION`. The app reads the list of releases from `https://docs.owox.com/docs/releases.json`, so a browser that cannot reach docs.owox.com shows no card.
