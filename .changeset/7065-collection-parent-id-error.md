---
'owox': minor
---

**Clear error when a plugin sends parentId to an unbound collection**

Previously, a plugin's collection `put` with `parentId` on a collection that declares no `entityBinding` failed with 403 and a message about the member's permissions. It now fails with 400, code `PLUGIN_COLLECTION_NOT_ENTITY_BOUND`, and a message naming the collection and the plugin's current version: OWOX reads `entityBinding` from that version's `plugin.json`, not from the author's working copy.

See [Bind collection documents to OWOX entities](../../docs/plugins/authoring-guide.md#bind-collection-documents-to-owox-entities).

<!-- markdownlint-disable-file MD041 MD036 -->
