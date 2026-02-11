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
