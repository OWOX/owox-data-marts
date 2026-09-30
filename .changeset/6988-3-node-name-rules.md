---
'owox': minor
---

**The Connector Builder checks node and parameter names as you type**

A node or parameter name must start with a letter and contain only letters, digits and
underscores. The builder used to accept any name and the rule surfaced only when **Test** was
refused, so a node named after its endpoint, such as `v1/balance/history`, looked like a broken
API path. The **Node name** field now explains the rule under the field and suggests a name that
fits, such as `v1_balance_history`, and reminds you that the API path goes in the node's
**Request**. A rename to such a name keeps the old one and says why. In **Parameters**, a row
whose name breaks the rule is flagged with the same explanation and counted with the other
rows to fix.

**Test** also runs the right node after a rename in **Code**. Renaming a node in the JSON used to
leave **Test** asking for the old name, which the manifest no longer had, and the run failed with
`Unknown node`.

<!-- markdownlint-disable-file MD041 MD036 -->
