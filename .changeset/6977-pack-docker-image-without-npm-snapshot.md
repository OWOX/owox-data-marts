---
'owox': minor
---

# Snapshot builds are now distributed as container images only

`owox@next` is no longer published to npm. To run a pre-release build, pull
`ghcr.io/owox/owox-data-marts:next`, or an exact `0.x.0-next-<timestamp>` tag to
pin one.

This applies to every package the repository releases, not just `owox`. In
particular `@owox/plugin-sdk`, `@owox/api-client` and `@owox/ctl` no longer get
snapshots either, and they are not part of the container image, so changes to
them now reach consumers only in a release. Existing snapshot versions stay
installable; no new ones appear.

Releases are unchanged: `npm install -g owox` still installs the newest release,
`npm install -g owox@1.8.0` still installs an exact one, and every release still
ships a `latest` container image alongside it.
