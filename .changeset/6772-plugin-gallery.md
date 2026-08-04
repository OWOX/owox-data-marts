---
'owox': minor
---

# Plugin Gallery: publish, install and run plugins described by GitHub releases

Plugins are web apps hosted elsewhere, described by a GitHub repository's releases, listed in a per-member Gallery and opened inside OWOX Data Marts in a sandboxed cross-origin iframe. A plugin holds no credential of its own: it can only ask the host page to make calls the host has already decided are allowed, acting with the authority of the member who installed it.

**Publishing and installing are separate.** A publication controls what a member sees in the Gallery, at three independent levels — deployment, project and member — which combine into one deduplicated list with no precedence between them. Installing is each member's own decision, uninstalling is soft, and a previous installer can restore from history even after the plugin stops being published to them. Unpublishing removes a listing without uninstalling anyone.

**Updates are managed by the deployment, daily.** Every plugin that somebody publishes or has installed is checked once a day for a newer valid release, each at its own time of day so checks spread across the day rather than arriving together. When a check finds a valid higher version it becomes current for everyone using that plugin — versions cannot be pinned, chosen or rolled back, and the plugin page says so plainly along with when the next check happens. **Check now** brings that check forward for anyone who can reach the page; it never decides whether an update happens. A check that fails leaves the working version active and waits for the next daily slot.

**Plugin identity is the GitHub repository**, held by its stable numeric id, so renaming or transferring a repository resolves to the same plugin instead of creating a second one. Versions are immutable and anchored to an exact commit: moving, deleting or recreating a tag cannot rewrite a version that already exists, and an invalid release never displaces a working one.

**Emergency control.** An allowlisted publisher key can suspend a plugin across the deployment. Suspension blocks opening, installing and restoring while leaving uninstalling and update checking available, so a corrective version can still become current before the plugin is resumed. It changes no publication or installation record.

Plugin authors build against the new `@owox/plugin-sdk`, which owns the host handshake and hands the plugin a working OWOX Data Marts API client. `owox-ctl` gains `plugins publish`, `unpublish`, `publications list`, `update`, `suspend` and `resume`.

New deployment variables: `OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS`, `GITHUB_TOKEN`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_API_BASE_URL`, `PLUGIN_HOST_SYNC_MIN_INTERVAL_SEC`, `PLUGIN_HOST_REMOTE_PROBE_TIMEOUT_MS`. The origin a vendor may name in `frame-ancestors` is the existing `PUBLIC_ORIGIN`, not a plugin-specific setting beside it.

**Behaviour change in `@owox/api-client`.** The package no longer depends on `undici`, so it can build for a browser and back a plugin's `ctx.owox`. As a result it no longer supplies a no-timeout dispatcher for streaming reads by default — pass one via the new `streamDispatcher` option if you call `traverseData` and need reads to run unbounded:

```ts
new OWOXApiClient({ apiKey, streamDispatcher: new Agent({ bodyTimeout: 0, headersTimeout: 0 }) });
```

`owox-ctl` does this already. `OWOXApiClient` additionally accepts `{ transport }` instead of `{ apiKey }`, which is how a plugin receives a working client while holding no credential of its own. Errors now carry the backend's stable machine-readable code, so a caller can branch on the failure instead of matching message text, and `error.details` carries the payload directly rather than the whole response body.
