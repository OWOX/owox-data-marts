---
'owox': minor
---

# Count unique records from any joined Data Mart

Every joined Data Mart now offers a `Unique Count` field in the report column picker, counting distinct records by that Data Mart's primary key. It answers "how many orders per customer" without adding an order column to the report. Composite keys are supported. The field can be selected and sorted by, but not filtered or fed into another aggregation.

In the picker it is simply `Unique Count`, listed under the joined Data Mart it belongs to, with a tooltip naming that Data Mart and the key columns being counted. In the produced file it is named like every other joined field: `Unique Count (Orders)` in Google Sheets, `Orders Unique Count` everywhere else.

With no usable primary key the field is shown disabled, and its tooltip says which Data Mart and why — no key set, part of the key disconnected, a nested key, or both of the last two. The report's own Data Mart says instead that no primary key is available for reporting.

A key column marked **Hidden for Report** still counts, on the report's own Data Mart as well as on a joined one. Hiding a column takes it off the list of fields a report can show; counting distinct values of it puts nothing in the output, so there is nothing to hide. On the report's own Data Mart this is new — such a key used to leave the row disabled.

## Some existing reports will show different numbers, and the new ones are correct

Rows whose declared primary key is empty used to be treated as one single record. That was wrong in three ways, and all three are fixed. A Data Mart with no declared key, or one whose key is always filled, is untouched.

- **`Unique Count` on a composite key was too high** and now goes down. Every row with an empty key component counted as one extra record — while a single-column key had always ignored such rows, so the same declaration behaved differently depending only on how many columns it had. This applies to any Data Mart with a composite key, joined or not.
- **`Sum` and `Average` on a joined Data Mart were too low** and now go up. All rows sharing an empty key collapsed into one, so the metric read a single row instead of all of them — verified on BigQuery, where twenty such rows summed to the value of one row before the fix and to all twenty after. `Min`, `Max`, the percentiles and `Combined` can shift for the same reason. The two metrics part ways on such a row on purpose: `Unique Count` does not count a record with no identity, while `Sum` still reads its value, so one report can legitimately say `0 orders, worth 2000`.
- **A key unique only within what it is joined on is now counted per join key**, and the number rises sharply. A line number restarting at 1 in every order reported 12 — the largest order's line count — for a book of 4,300 line items. It now reports 4,300, which is what `Sum` and `Average` on that same key had always meant by it.

Cached report data is cleared on upgrade, so an unedited report shows the corrected numbers on its next run rather than serving what it had cached.

Two smaller corrections in the same direction: two different composite keys that ran together into the same text now count as two records rather than one, and on **Amazon Redshift** a composite key holding a text part longer than 256 characters is no longer cut short and merged.

One correction goes the other way, and removes a column rather than changing a number. On the report's own Data Mart, a **composite** key one of whose columns had **disconnected** from the source was quietly counted by the columns that remained — which merges records the full key keeps apart, so the count read low with nothing to say so. Such a key now withholds the metric entirely, exactly as a joined Data Mart's already did. Reconnect the missing column, or drop it from the key, and the count comes back.

## Primary-key declarations worth a second look

Only where the **report's own** Data Mart is counted on a **composite** key, whose columns are joined into one value and read as text:

- a **floating-point** part can make two records count as one, when their values differ only in digits beyond what the text form shows;
- a **date-time** part can do the same — a warehouse writes it at whatever precision it is configured to show, thousandths of a second on **Snowflake** by default — so two records moments apart count as one;
- a **binary** part can stop the report with the warehouse's own error message rather than an OWOX one.

Prefer whole-number or text columns, or dates without a time part. A **joined** Data Mart's `Unique Count` reads every part of its key as it stands, so none of this applies there. A key declared on a structured column — JSON, geographic, variant — is not one a warehouse can group by, and stops the report either way.

## Also

A joined Data Mart with a declared primary key feeding `Sum`, `Average`, `Min`, `Max`, a percentile or `Combined` now numbers the rows it reads, which it previously skipped. The numbering runs per join key, so the cost follows the joined data the report actually touches — but reports over large joined Data Marts may run slightly slower.

A joined Data Mart with a source column literally named `__owox_rid` is now rejected with an error naming the column, in the one case that previously slipped through and returned wrong numbers instead. Rename the source column, or the join reference pointing at it.
