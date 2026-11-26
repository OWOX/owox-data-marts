---
'owox': minor
---

**Filters on Google BigQuery calculated fields no longer fail because of a wrong type**

A new calculated field starts with the type `STRING`. When its formula returned another type, for example `TRUE` or `FALSE`, OWOX still offered text filters for it. A filter such as "equals true" then failed in Google BigQuery with `No matching signature for operator =`, in Reports, HTTP Data API reads and plugins. Now, when you save a new or changed calculated field on Google BigQuery, OWOX checks the type the formula returns and uses it.

**When you edit a calculated field that Reports use, its type can change. A number becomes a metric, so the aggregations a Report may use and the Report output can change.** A calculated field saved earlier keeps its type until you edit its formula or its type.

![The Output Schema after Save: the calculated field is_large_order with the formula IF(amount > 50, TRUE, FALSE) has the type BOOLEAN, and a warning says that OWOX changed its type from STRING to BOOLEAN](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/e2e85140-9f60-4765-95fa-66201e1c3b00/public)

- The save shows a warning that names the field, its old type and its new type.
- A numeric type you chose stays when the formula also returns a number. `FLOAT`, `NUMERIC` and `BIGNUMERIC` also stay over a text formula, because OWOX casts the value to them in filters and aggregations.
- To keep a different type, cast the value in the formula, for example `CAST(EXTRACT(YEAR FROM order_date) AS STRING)`.
- A field whose formula reads a field with a new or changed formula gets the same check. Other fields keep their type. Other storages are unaffected.

See [Calculated Fields](../../docs/getting-started/setup-guide/calculated-fields.md).

<!-- markdownlint-disable-file MD041 MD036 -->
