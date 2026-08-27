# Blended query internals

SQL generation for a report that spans more than one Data Mart. `AbstractBlendedQueryBuilder`
(in `../interfaces/`) owns the warehouse dialect and orchestrates one query; everything that
actually writes SQL lives here, behind the `BlendedSqlDialect` port.

## The two-level shape

A blended report joins a **main** Data Mart to one or more **joined** ones. Joins are built
bottom-up: each joined mart is aggregated to its parent's join key first, then LEFT JOINed in.
That is what guarantees the result never has more rows than the main mart has.

```sql
WITH
  main       AS (SELECT ... FROM <main table>),
  orders_raw AS (SELECT ... FROM <orders table>),           -- untouched rows
  orders     AS (SELECT order_id, SUM(amount) AS orders__amount
                 FROM orders_raw GROUP BY order_id)          -- one row per join key ("dedup CTE")
SELECT main.country, orders.orders__amount
FROM main LEFT JOIN orders ON main.order_id = orders.order_id
```

## Why a "sleeve"

The dedup CTE has already collapsed the join's fan-out. Re-aggregating it therefore answers a
different question than the report asked:

- `SUM` over it adds the same underlying row once per report row it fans out to — too much.
- `COUNT DISTINCT` over it counts per-key results, not distinct entities — too few, or too many.
- `AVG` becomes an unweighted average of averages.
- A percentile is weighted by how many times the join repeated each value.

`COUNT` deliberately counts the rows that survive the join, and `ANY_VALUE` is indifferent to how
often a value repeats — everything else is routed (`SLEEVE_ROUTING`, which also states the SQL
SHAPE each one's sleeve takes).

`MIN`/`MAX` are idempotent under repetition, so they are routed for a different reason: a joined
field's pre-join roll-up collapses several raw rows into ONE value per join key, so off the sleeve
they would read that collapsed value while `SUM`/`AVG`/percentiles read the raw rows — the same
column measured at two grains, where `MIN <= AVG <= MAX` stops holding (raw `[10, 20]` gives
`MIN = 20`, `AVG = 15`, `MAX = 20`). Routing them puts every metric on a joined column at one
grain.

A **metric sleeve** is a separate CTE for one such metric that re-joins the RAW path — bypassing
the dedup — and recomputes the metric at the REPORT's own dimension grain. The outer query then
reads the value back with `ANY_VALUE` over a NULL-safe join on the dimension tuple, so it never
re-aggregates it:

```sql
  sleeve_orders__amount AS (               -- the sleeve
    SELECT _owox_dim_0, SUM(_val) AS "orders__amount | SUM"
    FROM (SELECT DISTINCT main.country AS _owox_dim_0, orders_raw.__owox_rid AS _oid,
                          orders_raw.order_id AS _oid_key_0, orders_raw.amount AS _val
          FROM main LEFT JOIN orders_raw ON ...) _dedup
    GROUP BY _owox_dim_0
  )
SELECT main.country, ANY_VALUE(sleeve_orders__amount."orders__amount | SUM") AS "orders__amount | SUM"
FROM main LEFT JOIN orders ON ...
-- the join back reads the sleeve's PRIVATE dimension alias, not the column's own name:
-- LEFT JOIN sleeve_orders__amount ON (main.country = sleeve_orders__amount._owox_dim_0 OR ...)
LEFT JOIN sleeve_orders__amount ON (main.country = sleeve_orders__amount._owox_dim_0 OR ...)
GROUP BY main.country
```

The inner `SELECT DISTINCT` is what makes `SUM`/`AVG` set-based: a row that fans out to several
report rows still contributes once, identified by `_oid` (+ `_oid_key_<i>`; see below).

**These are symmetric, non-additive aggregates.** An entity reachable under two dimension values
counts once in each group but once overall, so a column's per-group values need not add up to its
Totals value. That is correct, not a bug.

## Files

| File                              | Holds                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `metric-sleeve.planner.ts`        | WHICH metrics need a sleeve, who owns each, how they merge, what each CTE is named. Pure functions — no SQL, no dialect.                                                                                                                                                                                                                                           |
| `metric-sleeve.builder.ts`        | Turns those decisions into SQL: the counting and dedup-then-aggregate sleeve shapes, their joins, the in-sleeve WHERE. A calculated field's joined aggregate call takes the dedup-then-aggregate shape with a rendered EXPRESSION in the value slot (`buildFormulaSleeveCte`); the outer query splices its pull into the metric's formula instead of selecting it. |
| `blend-cte.builder.ts`            | The `_raw` / `_joined` / dedup CTE tree above, plus pre-join filter push-down.                                                                                                                                                                                                                                                                                     |
| `blended-filter-partition.ts`     | Splits report filters into pre-join (pushed into `_raw`) and post-join.                                                                                                                                                                                                                                                                                            |
| `blended-sql-dialect.ts`          | The narrow port the builders need from a warehouse, plus `createColumnQualifier`.                                                                                                                                                                                                                                                                                  |
| `blended-query.types.ts`          | Shared shapes and the reserved internal names.                                                                                                                                                                                                                                                                                                                     |
| `../utils/kept-groups.utils.ts`   | The Totals group restriction: its CTE name, its private key aliases, and the projection/join pair builders both paths share.                                                                                                                                                                                                                                       |
| `../utils/sql-clause-renderer.ts` | The flat (non-blended) counterpart. `renderAggregatedQuery` assembles a whole aggregated query — restriction included — so the five dialects cannot each forget a piece of it.                                                                                                                                                                                     |

## Invariants worth knowing before editing

- **The sleeve's dimension expression must be byte-identical to the outer GROUP BY key.** Both are
  built from the same `qualify(column)` resolver for that reason. `buildBlendedQuery` asserts it
  in both directions — a mismatch means the join-back silently matches nothing (NULL, or 0 after
  the `COUNT DISTINCT` coalesce) or, the other way round, spreads a coarser value over several
  groups.
- **A sleeve reproduces the report's post-join WHERE inside itself.** Its value is pulled through
  `ANY_VALUE`, which the outer WHERE cannot reach.
- **A relationship's join condition is rendered in exactly one place.** Four call sites need it —
  a parent's `_joined` CTE, the outer query, a sleeve's raw-ancestor join and a sleeve's dedup
  join — and a sleeve joining differently from the query it feeds aggregates over a different row
  set. Only the two aliases and the indentation are a caller's choice.
- **Params are pushed in WITH-clause order, with a per-sleeve prefix.** Athena binds positionally,
  so any reordering shifts every later value silently.
- **`__owox_rid` is numbered per parent-join key** and therefore identifies a row only together
  with that key — which is why the DISTINCT tuple carries `_oid_key_<i>` too.
- **`_oid`, `_oid_key_<n>`, `_val`, `_val_<n>`, `_dedup` and `__owox_rid` are reserved.** A report
  dimension colliding with one is rejected rather than silently corrupting the dedup set.
  `_kept_groups` is reserved too — the sleeve-name disambiguator seeds it, so no sleeve can take it.
- **The Totals restriction never projects a key under its dimension's own name.** `_kept_groups`
  emits `<group key> AS _owox_kg_<i>`, and the join reads those aliases. The same restriction is
  joined into flat queries whose columns are unqualified, where a same-named column would make
  every outer reference to it ambiguous.
- **The restriction is regrouped at the REPORT's grain, from its own `dateTruncs`.** A Totals query
  carries none of its own, so reading the query's buckets would regroup by raw date — and a month
  that clears a metric filter can contain no single day that does.

## Known limitations

- A metric (`HAVING`) filter on ANY sleeve-routed joined metric is rejected: HAVING renders from
  the dedup CTE, so it would filter on a different value than the SELECT returns. That applies to
  the Totals restriction's own `having` as well, not just the outer query's.
- A percentile's ANSWER, not just its spelling, differs per warehouse: BigQuery and Athena
  approximate, the `PERCENTILE_CONT` dialects interpolate exactly (see `renderPercentile`).
- `SUM`/`AVG`/percentiles de-duplicate by the pre-join group key, or — for a raw passthrough
  field — by the joined mart's declared primary key, falling back to a per-row surrogate when it
  declares none. The key is all-or-nothing: a partial one would merge rows the key itself keeps
  distinct (`collectPrimaryKeyRowIdentity`).

Arithmetic is proven by the live suites in `apps/backend/test/integration/*.integration.ts`
(`-t 'fan-out'`), not by the unit tests — those can only check the SQL text.
