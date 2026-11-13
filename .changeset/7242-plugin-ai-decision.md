---
'owox': minor
---

**Plugins choose from a fixed list faster and cheaper with a decision model**

A plugin author who needed one option from a fixed list, for example the visualization component for a report, had to call a chat model. That is slow, and it costs much for such a small job. Now a plugin declares `{ "id": "ai", "models": ["decision"] }` in `plugin.json` and passes `ctx.credentials.ai.decision` to `experimental_decide` from the `ai` 7.x package. The model answers typed questions (`choice`, `score` and `boolean`) and returns probabilities.

- **Existing AI Credentials change.** Existing OpenAI, Gemini and Anthropic Credentials now serve `decision` with the recommended model. A plugin that declares `decision` sends its data to the provider with the key of the Credential. A maintainer turns it off by setting **Decision** to **Not configured** in the Credential form. OpenRouter and openai-compatible Credentials do not provide `decision`.
- **OWOX AI.** OWOX AI serves `decision` only when the operator sets `AI_PLUGIN_DECISION_PROVIDER`, `AI_PLUGIN_DECISION_BASE_URL`, `AI_PLUGIN_DECISION_API_KEY` and `AI_PLUGIN_DECISION_MODEL`. The operator must choose a model with zero data retention where that matters. Each question needs `instructions`, and the state is text or JSON only. On OWOX Data Marts Cloud, each successful OWOX AI decision call is billed as an AI Process Run under the existing rules. A self-managed deployment does not bill it.
- **Limits.** The `box` question type is not supported. A question type that the selected route does not support gets `400`. Anthropic Credentials return no probabilities for `choice` and `score`.

See [Choose from a fixed list](../../docs/plugins/authoring-guide.md#choose-from-a-fixed-list), [AI mappings](../../docs/project/credentials.md#ai-mappings), [OWOX AI](../../docs/project/credentials.md#owox-ai) and [Environment variables](../../docs/getting-started/deployment-guide/environment-variables.md#owox-ai).

<!-- markdownlint-disable-file MD041 MD036 -->
