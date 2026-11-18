---
'owox': minor
---

**Context lists are easier to read: one line for each context, with a plain-text description**

When you assign contexts to a Data Mart, a Storage, a Destination, a Credential or a member, the list showed each description as raw Markdown: `## Mission`, `**Owner:**` and full link URLs. A two-word name such as "Customer Success" wrapped to two lines, and a long description ran past the list. So it was hard to see which context is which.

Now each context is one line: its name, then its description as plain text. Text that does not fit ends with an ellipsis. To read the full name or description, move the pointer onto it. The contexts list in **Project Settings → Contexts** also shows descriptions as plain text. Open a context to read its description with formatting. See [Contexts](../../docs/project/contexts.md).

![The Contexts card of a Data Mart: each context on one line, with its name and a plain-text description cut with an ellipsis](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4b6668b6-73a9-4fdd-395d-e406893f2b00/public)

The help text about contexts is now only in the (i) tooltip of the Contexts block. On a Data Mart and a Destination, the tooltip also tells who can see the item: a member with the **Selected contexts only** scope sees it only if they own it, or it is shared and has one of their contexts. On a Storage, the same rule applies to editors.

<!-- markdownlint-disable-file MD041 MD036 -->
