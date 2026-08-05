---
'owox': minor
---

# Plugin collections: host-stored JSON documents for installed plugins

Plugins can declare project- or member-scoped collections in `plugin.json` and access them through `ctx.collections(name)`. The host persists JSON documents, applies the collection's entity authorization rules, and keeps credentials out of the plugin frame.

The SDK collection facade supports paginated `list`, nullable `get`, `put`, and `delete` operations. Entity-bound writes include an immutable `parentId`, allowing the host to authorize every operation against the current member's access to the parent entity.
