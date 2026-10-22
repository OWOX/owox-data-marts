---
'owox': minor
---

**Tell contexts apart at a glance: pick an icon for each context**

A project that groups its Data Marts, Storages and Destinations by many contexts showed every context as a plain-text badge, so finding the Marketing or the Finance resources in a long list meant reading each label. Now a Project Admin picks an icon for each context, from the same set as Data Mart icons, and it appears before the context name: in the contexts list, on the context badges of Data Marts, Storages, Destinations and members, and in every **Contexts** picker. A context without a picked icon shows the default tag icon.

Watch a Project Admin give the Marketing and Finance contexts their icons, and the Data Marts list pick them up.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/ec24d7794cb0cb2102b7d9b436d6522e/iframe>

Scripts that set up contexts through the API can set the icon too. `PUT /api/contexts/{id}/icon` sets it, or resets it with `null`, and `POST /api/contexts` and `PUT /api/contexts/{id}` accept an optional `icon`. The contexts list and the contexts listed on Data Marts, Storages, Destinations and Credentials now return `icon`. MCP tools are unchanged. See [Contexts](../../docs/project/contexts.md#context-icons).

<!-- markdownlint-disable-file MD041 MD036 -->
