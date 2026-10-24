---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Plugin backend actions can use AI Credentials**

A plugin's backend action now gets the AI Credential through `ctx.credentials.ai`, as the plugin
page does: the models the plugin declares, as the project maps them. Previously only exact
Credentials reached a backend, and the AI Credential routes refused its execution token with
`EXECUTION_TOKEN_NOT_ALLOWED`, so a scheduled action that needed AI had to declare an exact
provider Credential and call that provider's API directly.

- **With `@owox/plugin-sdk` 0.40.0, a required AI Credential that is not usable stops a backend
  action with `EXECUTION_CONTEXT_UNAVAILABLE` before its handler runs**, as a required exact
  Credential already did.
- A backend on an older SDK keeps getting only exact Credentials, as before.

See [Run code on your backend with actions](../../docs/plugins/authoring-guide.md#run-code-on-your-backend-with-actions).
