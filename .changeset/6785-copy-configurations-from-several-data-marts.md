---
'owox': minor
---

# Fix: copying configurations from more than one Data Mart in a single save

Adding one connector configuration copied from one Data Mart and another
copied from a different one failed the whole save with a generic server error,
losing both edits. Only the first source was sent to the server, which then
tried to find every copied configuration in it.

Each copied configuration is now resolved against the Data Mart it was actually
copied from, so a single save can draw on as many as you like. Copying a
configuration that has since been deleted from its source now reports what
happened instead of failing as an unexpected error.
