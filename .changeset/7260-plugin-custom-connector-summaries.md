---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Plugins can show custom connector logos and link to the Connector Builder**

A plugin such as Data Flow draws one card for each Source. It showed a logo for a bundled connector, but only initials for a custom connector. It could not link the card to the connector's builder page. It could not group custom connectors that call the same API. Plugins could not read custom connectors at all.

Now a plugin can call `GET /api/connectors/custom/summaries`. It returns `id`, `name`, `title`, `logo` and `hosts` for each custom connector, and never a manifest. Pass `names` to read only the connectors you need. See [Read custom connector logos](../../docs/plugins/authoring-guide.md#read-custom-connector-logos).
