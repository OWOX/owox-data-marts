---
'owox': minor
---

**Plugin AI calls no longer fail with a timeout after 30 seconds**

A plugin that uses an AI Credential, such as Gyroscope when it rebuilds its model, can wait more than 30 seconds for a reasoning model on a large project. Previously such a call failed with `HTTP_ERROR 408 Request timeout after 30 seconds`, and the plugin showed that the AI model did not answer. The plugin SDK and the server wait 120 seconds for an AI call, but a general 30-second request limit stopped it first. Now a plugin's AI call gets the 120 seconds, as [Handle request errors](../../docs/plugins/authoring-guide.md#handle-request-errors) describes.

A Credential `fetch` still times out after 30 seconds.

<!-- markdownlint-disable-file MD041 MD036 -->
