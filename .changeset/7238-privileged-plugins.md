---
'owox': minor
---

**Deployment operators can mark plugins as privileged: a relaxed sandbox and the member's access token**

By default every plugin page runs in a sandbox that blocks popups and the clipboard, hides the page's origin, and gives the page no credential. A deployment operator can now mark specific plugins as privileged with two environment variables. Only those plugins get a relaxed sandbox and may ask for the signed-in member's access token. A deployment that does not set the variables is unaffected.

- A plugin is privileged only when its GitHub repository id is in `OWOX_PRIVILEGED_PLUGIN_REPOSITORY_IDS` and the origin of its delivery URL is in `OWOX_PRIVILEGED_PLUGIN_ORIGINS`. Only https origins count. When either variable is unset or blank, no plugin is privileged. A plugin served from the deployment's own host is never accepted.
- For a privileged plugin the host adds `allow-same-origin`, `allow-popups` and `allow-popups-to-escape-sandbox` to the iframe sandbox and grants clipboard read and write.
- A privileged plugin gets the member's access token with `ctx.userToken()`, a new method in `@owox/plugin-sdk`. When your API answers `401`, call `ctx.userToken({ fresh: true })`.
- Every other plugin keeps the default sandbox and receives no token; for it `ctx.userToken` is `undefined`. The mark does not depend on publication: a Verified plugin does not get it automatically.
- The code of a privileged plugin acts with the member's rights. List only plugins you own, on hosting you control, and serve them with `Content-Security-Policy: frame-ancestors` limited to your deployment.

See [Privileged plugins](../../docs/plugins/trusted-plugins.md#privileged-plugins), [Environment variables](../../docs/getting-started/deployment-guide/environment-variables.md#plugins) and the [plugin authoring guide](../../docs/plugins/authoring-guide.md#use-the-plugin-sdk).

<!-- markdownlint-disable-file MD041 MD036 -->
