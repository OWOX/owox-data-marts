---
'owox': minor
---

**Safer custom connector tests in your AI assistant: API keys stay out of the chat**

A Data Owner who builds a custom connector through MCP tests each node before publishing it. Previously `test_custom_connector` also took the manifest and temporary API keys in its arguments, so a key that the user gave the assistant went through the chat, and the test could run a manifest that differed from the saved draft. Now keys go only through saved Credentials, and the test runs the saved draft, so it checks the connector that you publish. **`test_custom_connector` no longer accepts `manifest` or keys in `configuration`: the assistant saves the draft with `save_custom_connector_draft`, then tests it with `connector_id` and a `credential_id`. ChatGPT keeps the tool list from the time when you added the OWOX app: disconnect and reconnect the app to get these changes.**

- `create_custom_connector` and `save_custom_connector_draft` reject a manifest that holds a literal key in `authentication`, in a parameter with `attributes: ["SECRET"]`, or in a credential header or query parameter, or a `[REDACTED]` value. Declare each key as a parameter with `attributes: ["SECRET"]` and select a Credential that holds its value.
- `get_custom_connector_version` shows such a literal key in any version as `[REDACTED]`.
- `start_credential_setup` takes an optional `connector_id`. The Credential form then opens with the hosts and key fields of that connector, and the user enters only the key values.
- The Connector Builder in OWOX, published connectors and Data Mart runs work as before.

See [Custom connector authoring](../../docs/getting-started/setup-guide/mcp.md#custom-connector-authoring) and [how to load new tools](../../docs/getting-started/setup-guide/mcp.md#the-assistant-does-not-see-new-tools-or-tool-rules).

<!-- markdownlint-disable-file MD036 MD041 -->
