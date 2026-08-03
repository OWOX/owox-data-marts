---
'@owox/api-client': minor
'@owox/plugin-sdk': minor
'@owox/backend': minor
'@owox/web': minor
'@owox/ctl': minor
---

Plugin Gallery: publish, install and run remote-URL plugins described by GitHub releases

Plugins are web apps hosted elsewhere, described by a GitHub repository's releases,
listed in a per-member Gallery and embedded in a sandboxed cross-origin iframe.

- Plugin identity is GitHub's stable numeric repository id, so renaming or transferring a
  repository resolves to the same plugin rather than creating a second one.
- Versions are immutable and anchored to an exact commit: moving, deleting or recreating
  a tag cannot rewrite one that already exists.
- Publications work at three independent authority levels — deployment, project and
  member — and combine into one deduplicated Gallery with no precedence between them.
- Installing is separate from publishing. Each member installs for themselves,
  uninstalling is soft, and a previous installer can restore from history even after the
  plugin stops being published to them.
- An allowlisted publisher key can suspend a plugin across the deployment. Suspension
  blocks opening, installing and restoring while leaving uninstalling and updating
  available, and touches no publication or installation record.

New deployment variables: `OWOX_DEPLOYMENT_PLUGIN_PUBLISHER_API_KEY_IDS`, `GITHUB_TOKEN`,
`GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_API_BASE_URL`,
`PLUGIN_HOST_PUBLIC_ORIGIN`, `PLUGIN_HOST_SYNC_MIN_INTERVAL_SEC`,
`PLUGIN_HOST_MAX_RELEASE_PAGES`, `PLUGIN_HOST_REMOTE_PROBE_TIMEOUT_MS`.

**Behaviour change in `@owox/api-client`.** The package no longer depends on `undici`, so
it can build for a browser and back a plugin's `ctx.owox`. As a result it no longer
supplies a no-timeout dispatcher for streaming reads by default — pass one via the new
`streamDispatcher` option if you call `traverseData` and need reads to run unbounded:

```ts
new OWOXApiClient({ apiKey, streamDispatcher: new Agent({ bodyTimeout: 0, headersTimeout: 0 }) });
```

`owox-ctl` does this already. `OWOXApiClient` additionally accepts `{ transport }` instead
of `{ apiKey }`, which is how a plugin receives a working client while holding no
credential of its own.
