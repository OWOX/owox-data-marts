---
'owox': minor
---

**Plugins get one typed answer from a fixed list, with no chat reply to parse**

A plugin author who needed one option from a fixed list, for example the visualization component for a report, had to prompt a chat model and parse its text reply. Now a plugin declares `{ "id": "ai", "models": ["decision"] }` in `plugin.json` and passes `ctx.credentials.ai.decision` to `experimental_decide` from the `ai` 7.x package. The call answers typed questions (`choice`, `score` and `boolean`) and returns the selected option, with probabilities where the route gives them. **Existing OpenAI, Gemini and Anthropic AI Credentials now provide `decision` with the recommended model, so a plugin that declares it sends its data to that provider with the key of the Credential.** To turn it off, a maintainer sets **Decision model** to **Not configured** in the Credential form.

- **Credentials.** OpenRouter and openai-compatible Credentials do not provide `decision`. Anthropic Credentials return no probabilities for `choice` and `score`. Setting **Embedding model** to **Not configured** now removes the mapping. Before, the Credential kept it.
- **OWOX AI.** OWOX AI serves `decision` only when the operator sets `AI_PLUGIN_DECISION_PROVIDER`, `AI_PLUGIN_DECISION_BASE_URL`, `AI_PLUGIN_DECISION_API_KEY` and `AI_PLUGIN_DECISION_MODEL`. The operator must choose a model with zero data retention where that matters. Each question needs `instructions`, and the state is text or JSON only. On OWOX Data Marts Cloud, each successful OWOX AI decision call is billed as an AI Process Run under the existing rules. A self-managed deployment does not bill it.
- **Limits.** The `box` question type is not supported.

See [Choose from a fixed list](../../docs/plugins/authoring-guide.md#choose-from-a-fixed-list), [AI mappings](../../docs/project/credentials.md#ai-mappings), [OWOX AI](../../docs/project/credentials.md#owox-ai) and [Environment variables](../../docs/getting-started/deployment-guide/environment-variables.md#owox-ai).

<!-- markdownlint-disable-file MD041 MD036 -->
