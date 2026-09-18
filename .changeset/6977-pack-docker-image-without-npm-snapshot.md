---
'owox': minor
---

# Snapshot builds are now distributed as container images only

`owox@next` is no longer published to npm. To run a pre-release build, pull
`ghcr.io/owox/owox-data-marts:next`, or an exact `0.x.0-next-<timestamp>` tag to
pin one.

Releases are unchanged: `npm install -g owox` still installs the newest release,
`npm install -g owox@1.8.0` still installs an exact one, and every release still
ships a `latest` container image alongside it.
