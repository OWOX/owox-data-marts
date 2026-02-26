---
'owox': minor
---

# Data table support in email-based report templates

You can now embed data mart results as a Markdown table in your email report message using the `{{#data-table}}{{/data-table}}` tag.

## Supported parameters

- **`limit`** - max rows to display (default: 10, max: 100)
- **`from`** - `"start"` (default) or `"end"` to show first or last N rows
- **`columns`** - comma-separated list of column names to include

## Examples

Basic table (first 10 rows, all columns):

```handlebars
{{#data-table}}{{/data-table}}
```

Last 20 rows with specific columns:

```handlebars
{{#data-table limit=20 from="end" columns="date, revenue, sessions"}}{{/data-table}}
```

You can also use `{{dataHeadersCount}}` and `{{dataRowsCount}}` variables in your message template.

## Value tag support in deterministic insight templates

You can now insert a single value inline in deterministic insight templates using the `{{value}}` tag.

### Value tag parameters

- **`source`** - source key to read from (default: `main`)
- **`path`** - path syntax like `.revenue[1]` (`row` is optional); cannot be combined with `row`/`column`
- **`row`** - 1-based row index (default: `1`)
- **`column`** - column name or 1-based column index (default: `1`)

### Value tag examples

Inline value by path:

```handlebars
Total revenue: {{value source="main" path=".revenue[1]"}}
```

Inline value by row/column:

```handlebars
Total revenue: {{value source="main" column="revenue" row="1"}}
```

## Chat assistant for deterministic template generation

Added chat assistant support in the Insight Template editor to help generate and refine deterministic templates.

The assistant can be used directly while editing an Insight Template and works with the deterministic template workflow (including template/source updates via proposed actions).
