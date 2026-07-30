---
'owox': minor
---

# Fix: "Copy from..." no longer shares or deletes another Data Mart's credentials

Using "Copy from..." to reuse a connector configuration from another Data Mart
made both Data Marts point at the same stored credentials row instead of
copying the values. Saving the new Data Mart could then delete that shared
row, wiping the credentials on both.

Copying a configuration now always creates its own credentials row, and a
save can no longer delete another Data Mart's stored credentials.
