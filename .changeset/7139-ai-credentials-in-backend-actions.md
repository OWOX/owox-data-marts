---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Plugin backend actions can use AI Credentials**

A plugin's backend action now gets the AI Credential through `ctx.credentials.ai`, as the plugin
page does, with the fast, reasoning and embedding models the project maps. Previously only exact
Credentials reached a backend, and the AI Credential routes refused its execution token with
`EXECUTION_TOKEN_NOT_ALLOWED`, so a scheduled action that needed AI had to declare an exact
provider Credential and call that provider's API directly.

- **A required AI Credential that is not usable now stops a backend action before its handler
  runs**, as a required exact Credential already did.
- The backend needs `@owox/plugin-sdk` 0.40.0. With an older SDK, its AI calls fail with
  `PROTOCOL_ERROR`.

See [Run code on your backend with actions](../../docs/plugins/authoring-guide.md#run-code-on-your-backend-with-actions).
