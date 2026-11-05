---
'owox': minor
---

**Count unique records when reading a Data Mart over the HTTP Data API**

Plugins and scripts that read a Data Mart through the HTTP Data API, or through
`dataMarts.traverseData()` in `@owox/api-client` and `@owox/plugin-sdk`, can now ask
for a Unique Count, the same one reports already offer. Before, there was no way to
count distinct records there, and counting a numeric primary key with
`COUNT_DISTINCT` was refused.

Pass `uniqueCount` with the sources to count: `''` for the Data Mart itself, or the
alias path of a joined Data Mart. Each source counts distinct values of its primary
key, whatever the key type. Without a column selection you get a single total row;
with columns you get a count per group. You can also sort by the Unique Count column,
as in reports. See
[Stream Data Mart rows](../../docs/api/api-client.md#stream-data-mart-rows) for details.

<!-- markdownlint-disable-file MD036 MD041 -->
