---
'owox': minor
---

# Reports no longer deliver duplicate rows when no aggregation was chosen

A report with an explicit column selection but no aggregation, date bucket, or Unique Count set anywhere used to be able to deliver duplicate rows — most commonly from a join that fans a source row out across several joined rows. OWOX now closes that gap automatically:

- A selection made only of dimensions is returned **distinct**.
- A selection that includes a metric gets the **first aggregation its Data Mart governance allows**, in a fixed priority order (`SUM` → `AVG` → `MIN` → `MAX` for numbers, `MIN` → `MAX` for dates and times). A boolean metric is left alone, and so is a text metric under its default governance — nothing that set allows returns the column you selected — though explicitly allowing `MIN` or `MAX` on a text field opts it back in. A report selecting a column from a joined Data Mart is left alone too.
- A row-level calculated formula may be rewritten to its group-level equivalent instead of becoming a grouping key, when OWOX can prove the rewrite returns the same value — for example `{{revenue}} / {{cost}}`. A formula it cannot prove safe (a product of two references, a conditional, or a division that would truncate on Athena or Redshift) is left as a grouping key instead of guessed at, so the report keeps its duplicates rather than risk a wrong number. A formula that another calculated field reads is left alone too, because rewriting it would silently change that other field as well.

A report that collapses this way relabels its aggregated column exactly as a manually chosen aggregation always has: `sessions` becomes `sessions | SUM` in the delivered output. If a downstream Google Sheets formula or Looker Studio binding reads the plain `sessions` header, it stops resolving once the report starts auto-aggregating. The report editor marks every auto-aggregated column with a dot on the Aggregations button (dismissed on first hover) and names the columns in its tooltip, and run history records what was applied.

**If your Data Mart is defined by SQL and its storage credential is read-only, check it before upgrading.** A report that only picked columns previously ran its definition as an inline subquery and wrote nothing to the warehouse. Once it collapses it counts as having output controls, which takes the same path a filter or a sort already takes: OWOX materialises the definition as a view (`CREATE OR REPLACE VIEW`) using that Data Mart's credential, on each run and on each Generated SQL preview. A credential that may read but not create will now fail where it worked before.

Ad-hoc queries are unchanged: HTTP Data, the MCP `query_data_mart` tool, `apps/ctl`, the Looker Studio cache-fill query, "copy as Data Mart", and the report's save-time dry run all keep returning exactly what was asked for, duplicates included. **Microsoft Excel** and **Looker Studio** reports are unchanged too — OWOX does not run them, the add-in and the connector read the report over those same ad-hoc paths. A report is also left alone when a sort names a column it does not display, or when a filter already targets an aggregate-level calculated field: the Report Aggregations setup guide lists every such case.
