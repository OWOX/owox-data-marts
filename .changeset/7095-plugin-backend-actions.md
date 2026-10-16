---
'owox': minor
---

**Plugins can run actions on their own backend**

A plugin can declare actions in a `backend` block of `plugin.json` and run them on its own backend, such as a Cloudflare Worker or a Cloud Run service. The page calls `ctx.actions.invoke(name, input)` and waits for the result, or `ctx.actions.start` to let the action finish after the plugin closes. OWOX Data Marts validates the input against the action's JSON Schema, calls the backend, and gives it an execution token with the installing member's access that works only while the action runs. Credential secrets stay in OWOX Data Marts.

- `@owox/plugin-sdk/server` provides `createBackend`. It checks the execution token with the calling host before a handler runs.
- `createBackend` runs only executions of its own plugin, named by its GitHub repository id. Without `hosts` it calls back only public HTTPS hosts, and on Node `@owox/plugin-sdk/server/node` also refuses names that resolve to private addresses.
- The release check rejects an input schema with `pattern`, `patternProperties`, `format`, `uniqueItems`, `$async` or a recursive or non-local `$ref` (`ACTION_INPUT_UNSUPPORTED`).
- Within a compatibility line, a release cannot remove an action (`ACTIONS_INCOMPATIBLE`), add a backend or move its origin (`BACKEND_ORIGIN_CHANGED`).
- Input and results nested deeper than 100 levels are refused (`INVALID_INPUT`, `BACKEND_INVALID_RESPONSE`). OWOX clears the input, result and a plugin-authored error message 24 hours after an execution finishes.
- At most 5 actions run at once per installation, each for up to 300 seconds; an installation also starts at most 60 per minute and 5,000 per 24 hours, and new starts are refused once 100 MiB of uncleared inputs and results are stored.
- The install dialog names the origin the plugin runs code on.

See [Run code on your backend with actions](../../docs/plugins/authoring-guide.md#run-code-on-your-backend-with-actions).

<!-- markdownlint-disable-file MD041 MD036 -->
