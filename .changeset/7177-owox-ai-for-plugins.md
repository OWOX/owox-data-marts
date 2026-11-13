---
'owox': minor
---

**Plugins that use AI work at once: choose OWOX AI instead of your own AI key**

A project member who installed a plugin that uses AI had to get an API key from an AI provider, add it to the project as an AI Credential and select it before the plugin worked. That was extra work, and a key to look after. Now the install dialog offers OWOX AI, the AI models that the deployment provides, as the first option and selects it, so the plugin works at once in its pages, backend actions and scheduled executions. Members can still choose their own AI Credential, and can switch between it and OWOX AI later on the plugin's Credentials tab. Plugin code and `plugin.json` do not change.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/444daf7318304fb60cfd119159d8baaa/iframe>

- On OWOX Data Marts Cloud, each successful OWOX AI call is billed as an AI Process Run under the existing rules and uses the project's credits. A project that cannot run AI Process Runs gets `403` with the code `PROJECT_OPERATION_BLOCKED`. On a self-managed deployment, OWOX AI calls are not billed.
- OWOX AI always provides the `fast` and `reasoning` models. It provides `embedding` only when `AI_PLUGIN_EMBEDDING_MODEL` is set. The model IDs depend on the deployment.
- A streamed AI response no longer includes the provider's response ID or the model ID, for OWOX AI and for an AI Credential. Plugin code cannot tell which one answered.
- Self-managed operators turn OWOX AI on by setting `AI_BASE_URL`, `AI_API_KEY`, `AI_PLUGIN_FAST_MODEL` and `AI_PLUGIN_REASONING_MODEL`. `AI_MODEL` is not a fallback for plugins.

See [OWOX AI](../../docs/project/credentials.md#owox-ai), [Environment variables](../../docs/getting-started/deployment-guide/environment-variables.md#owox-ai), [Consumption units](../../docs/getting-started/billing/consumption-units.md) and the [plugin authoring guide](../../docs/plugins/authoring-guide.md#use-project-credentials).

<!-- markdownlint-disable-file MD041 MD036 -->
