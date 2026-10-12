---
'owox': minor
---

**Clear errors when a plugin's `parentId` does not match the collection's `entityBinding`**

Previously, a plugin's collection `put` whose `parentId` did not match the collection's `entityBinding` could fail with 403 and a message about the member's permissions. It now fails with status 400 and a message naming the collection and the plugin's current version: OWOX reads `entityBinding` from that version's `plugin.json`, not from the author's working copy.

- `parentId` sent to a collection without `entityBinding`: API code `PLUGIN_COLLECTION_NOT_ENTITY_BOUND`.
- `parentId` missing on a collection with `entityBinding`: API code `PLUGIN_COLLECTION_PARENT_ID_REQUIRED`.

A plugin receives both as `HTTP_ERROR` with `status` 400 and the message. See [Bind collection documents to OWOX entities](../../docs/plugins/authoring-guide.md#bind-collection-documents-to-owox-entities).

<!-- markdownlint-disable-file MD041 MD036 -->
