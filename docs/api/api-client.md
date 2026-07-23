# TypeScript/JavaScript API Client

`@owox/api-client` is a TypeScript/JavaScript package for calling the OWOX Data Marts API from custom scripts, internal tools, automation, and AI agent workflows.

Use `owox-ctl` for terminal commands. Use `@owox/api-client` for code-level integrations.

## Install

```bash
npm install @owox/api-client
```

## Create an API key

Before using `@owox/api-client`, create an API key. See [API Keys](./api-keys/).

## Basic usage

Set credentials as environment variables:

```bash
export OWOX_API_KEY=owox_key_xxx
```

Then create a client:

```ts
import { OWOXApiClient } from '@owox/api-client';

const client = new OWOXApiClient({
  apiKey: process.env.OWOX_API_KEY!,
});

const dataMarts = await client.dataMarts.list();

console.log(dataMarts);
```

## Get auth context

Use `auth.getContext()` to validate the configured API key and return the project and member context
resolved from the exchanged access token.

```ts
const context = await client.auth.getContext();

console.log(context.project.id);
console.log(context.project.title);
console.log(context.member.email);
```

## Manage project settings

Use `project.getSettings()` to read the current project's settings. Project members can read the
settings available to their role.

```ts
const settings = await client.project.getSettings();

console.log(settings.description);
```

Project admins can update the project description used as project-specific business context. Pass
`null` to clear it.

```ts
await client.project.updateDescription(
  'Use net revenue after refunds for monthly performance reporting.'
);

await client.project.updateDescription(null);
```

## Check project setup progress

Use `project.getSetupProgress()` to inspect the current project member's merged project- and
user-scoped onboarding state. The response includes the API contract version, persisted steps
schema version, completion percentage, and per-step completion details.

```ts
const setupProgress = await client.project.getSetupProgress();

console.log(setupProgress.progress);

for (const [step, state] of Object.entries(setupProgress.steps)) {
  console.log(step, state.done, state.completedAt);
}
```

## Read project run history

Use `runs.list()` to inspect historical Data Mart executions visible to the current
project member. The API key must resolve to a member with viewer access. Administrators can see
runs for every non-deleted Data Mart in the project. Owners see their owned Data Marts. Editors
can also see shared Data Marts available for reporting or maintenance, subject to configured
context access; viewers can see shared Data Marts available for reporting, subject to the same
context-access filter.

Pass optional `limit` and `offset` values to page through the newest-first history. `limit` defaults
to 100, floors finite fractions, falls back to 100 for non-finite or non-positive values, and caps
at 100. `offset` defaults to 0, floors finite fractions, falls back to 0 for non-finite or
non-positive values, and caps at 100,000. The response has no total or next-page marker. Prefer a
`limit` from 1 through 100, increment `offset` by the number of returned runs, and stop when a page
contains fewer runs than the server-normalized effective limit or the next offset would exceed
100,000. Because new runs can shift newest-first offset pages while a consumer is paging, deduplicate
by `run.id` when walking multiple pages.

```ts
const history = await client.runs.list({ limit: 50, offset: 0 });

for (const run of history.runs) {
  const author =
    run.createdByUser?.fullName ?? run.createdByUser?.email ?? 'System or unavailable author';

  console.log(run.dataMart.title, run.type, run.status, author, run.finishedAt);
}
```

`createdByUser` is the run author field. It is always present, but can be `null` when the run has no
creator ID or the corresponding user projection is unavailable. When an author is available,
`createdByUser.userId` is required; `fullName`, `email`, and `avatar` are optional and can also be
`null`.

`definitionRun` is always present but can be `null` when a historical definition snapshot is
unavailable.

`@owox/api-client` validates the response shape, enum values, nested references and author data,
nullable fields, logs and errors, totals, and the backend's RFC3339 timestamp profile: uppercase
`T`/`Z`, seconds from `00` through `59`, optional fractional seconds, and valid numeric offsets. It
throws `OWOXApiError` when the endpoint returns an incompatible payload.

## List project insight templates

Use `insights.getTemplates()` to discover reusable insight definitions across the Data Marts
visible to the current project member. Pass optional `limit` and `offset` values to page through
the project-wide list. The API defaults `limit` to 100, caps it at 100, and caps `offset` at
100,000; invalid or non-positive values fall back to the defaults.

```ts
const templates = await client.insights.getTemplates({ limit: 50, offset: 0 });

for (const template of templates.insights) {
  console.log(template.dataMart.title, template.title, template.canDelete);
}
```

Each result includes the template summary, its Data Mart ID and title, creator metadata when
available, and whether the current member can delete it. This makes the method suitable for
automation and agent workflows that need to find reusable insight definitions without scanning
Data Marts individually. Because the response has no total or next-page marker, choose a `limit`
from 1 through 100, increment `offset` by the number of returned templates, and stop when a page
contains fewer items than that limit or the next offset would exceed 100,000. The endpoint cannot
page beyond that maximum offset.

## Search project entities

Use `search.query()` to find Data Marts, data storages, and data destinations visible to the
current project member. The server trims surrounding query whitespace and enforces its configured
minimum and maximum query lengths. Pass an optional result limit from 1 through 50, restrict the
search to specific entity types, or exclude draft Data Marts. When omitted, the server's result
limit is used, all supported entity types are searched, and draft Data Marts may be included. Pass
an empty `entityTypes` array to preserve an explicit no-types filter and return no matches.

```ts
const results = await client.search.query('monthly revenue', {
  limit: 25,
  entityTypes: ['DATA_MART', 'DATA_STORAGE'],
  excludeDrafts: true,
});

for (const result of results) {
  console.log(result.entityType, result.title, result.description, result.finalScore);
}
```

Each result includes the entity type and ID, title, nullable description, combined relevance
score, keyword score, and a vector score when semantic matching contributed. Search returns an
empty array when no visible entity matches. When prompt embeddings are unavailable, Search falls
back to keyword matching.

## Convert Markdown to HTML

Use `markdown.parseToHtml()` to render Markdown with the same pipeline and styling wrapper used by
the OWOX Data Marts web interface. The method returns the rendered HTML string directly.

```ts
const html = await client.markdown.parseToHtml({
  markdown: '# Weekly revenue\n\n**Net revenue** after refunds.',
});

console.log(html);
```

The method requires viewer access to the API key's project. Treat the returned HTML according to
the same trust and embedding rules as Markdown rendered in the application.

## List data marts

```ts
const dataMarts = await client.dataMarts.list();
```

## Read the Models canvas

Use `models.getDataMarts()` to read one page of the data marts visible to the current project
member in a storage. Pass the returned `nextOffset` to request the next page.

```ts
const firstPage = await client.models.getDataMarts('storage-id');

if (firstPage.nextOffset !== null) {
  const nextPage = await client.models.getDataMarts('storage-id', firstPage.nextOffset);
  console.log(nextPage.items);
}
```

Use `models.getEdges()` to read the visible relationships between those data marts.

```ts
const edges = await client.models.getEdges('storage-id');

for (const edge of edges) {
  console.log(edge.sourceDataMartId, edge.targetDataMartId, edge.joinConditions);
}
```

## Stream Data Mart rows

Use `dataMarts.traverseData()` to stream rows from a published Data Mart without direct storage credentials.
The method returns stream metadata and exposes `rowChunks()` as the traversal primitive, so callers can append to a cache or write output without loading the full result into memory.

```ts
const data = await client.dataMarts.traverseData('dm_123', {
  column: ['Event Date (local)', 'Revenue: net = USD'],
  filter: [{ column: 'Event Date (local)', operator: 'gte', value: '2026-01-01' }],
  sort: [{ column: 'Event Date (local)', direction: 'asc' }],
  aggregation: [{ column: 'Revenue: net = USD', function: 'SUM' }],
  dateTrunc: [{ column: 'Event Date (local)', unit: 'MONTH' }],
  limit: 1000,
});

console.log(data.runId);

for await (const rows of data.rowChunks()) {
  await cache.appendRows(rows);
}
```

Call `await data.cancel()` if you open a traversal and decide not to iterate `rowChunks()`.
The client rejects a successful response whose media type is not `application/x-ndjson` instead of
attempting to interpret it as row data.
The exported `TraverseDataOptions` and traversal rule types provide compile-time shape validation
of these controls.

Column selection uses two separate fields:

- `columns: '*'` selects all current Data Mart output columns.
- `columns: '**'` selects all columns available to Reports, including joined fields.
- `column: ['Event Date (local)', 'Revenue: net = USD']` selects exact column names.
- `column: ['*', '**']` selects literal columns named `*` and `**`.

Do not pass comma-separated column lists. Column names are opaque strings and may contain commas, equals signs, spaces, quotes, or other symbols.

Use `filter` and `sort` arrays with the same rule shapes as report output controls. For normal filters on the streamed output, omit `placement` or use `placement: 'post-join'`. Use `placement: 'pre-join'` only with a resolved blended column name; the rule's `column` identifies the joined source to filter before it is joined into the result.

To filter an aggregated value after grouping, set the filter rule's `function` to the same aggregate function used for that `column` in `aggregation`. For example, `{ column: 'revenue', function: 'SUM', operator: 'gt', value: 1000 }` applies a `HAVING SUM(revenue) > 1000` condition. The `(column, function)` pair must match an aggregation rule, and a filter with `function` cannot use `placement: 'pre-join'`.

Use `aggregation` and `dateTrunc` arrays to group the streamed rows, with the same rule shapes as report output controls. `aggregation` takes `{ column, function }` rules; `function` is any report aggregate function — `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `COUNT_DISTINCT`, `STRING_AGG`, `ANY_VALUE`, or a percentile (`P25`, `P50`, `P75`, `P95`). `dateTrunc` takes `{ column, unit, timeZone? }` rules that bucket a date/timestamp dimension by `DAY`, `WEEK`, `MONTH`, `QUARTER`, or `YEAR`. Any selected column without an aggregation rule becomes a grouping key. Aggregation and `dateTrunc` require an explicit `column` list — they cannot combine with `columns: '*'` or `columns: '**'` (a wildcard would group by every column). The streamed row keys are the resolved labels: an aggregated column becomes `"<column> | <TOKEN>"` (plus a `"Row Count"` column), where `<TOKEN>` is an uppercase spreadsheet-style token — most match the function name, but `COUNT_DISTINCT` becomes `COUNTUNIQUE`, `P50` becomes `MEDIAN`, `STRING_AGG` becomes `STRINGAGG`, and `ANY_VALUE` becomes `ANYVALUE`.

## List storages

```ts
const storages = await client.storages.list();
```

## List destinations

```ts
const destinations = await client.destinations.list();
```

## Use in AI agents and scripts

AI agents can run scripts that use `@owox/api-client` when they need structured access to OWOX Data Marts from TypeScript or JavaScript.

```ts
import { OWOXApiClient } from '@owox/api-client';

const client = new OWOXApiClient({
  apiKey: process.env.OWOX_API_KEY!,
});

const [dataMarts, storages, destinations] = await Promise.all([
  client.dataMarts.list(),
  client.storages.list(),
  client.destinations.list(),
]);

console.log(
  JSON.stringify(
    {
      dataMarts,
      storages,
      destinations,
    },
    null,
    2
  )
);
```

Security notes:

- Do not hard-code API keys in source code.
- Use environment variables or a secret manager.
- Do not commit `.env` files containing API keys.
- Avoid putting API keys in AI agent instructions or prompts.
- Revoke keys that are no longer used.

## Authentication behavior

`@owox/api-client` parses the `owox_key_...` value and uses the API key ID and secret inside it to request a short-lived access token.

The access token is kept in memory for the current process and is not persisted.

## Error handling

`@owox/api-client` exports typed errors for request and authentication failures.

```ts
import { OWOXApiError, OWOXAuthError } from '@owox/api-client';

try {
  const dataMarts = await client.dataMarts.list();
  console.log(dataMarts);
} catch (error) {
  if (error instanceof OWOXAuthError) {
    console.error('Authentication failed');
  } else if (error instanceof OWOXApiError) {
    console.error(`OWOX API request failed: ${error.message}`);
  } else {
    throw error;
  }
}
```

## Compatibility

The same `@owox/api-client` and OWOX Data Marts server version is supported. Different versions are best effort.

## Related docs

- [API Keys](./api-keys/)
- [owox-ctl](./owox-ctl/)
- [OpenAPI and Swagger UI](./openapi/)
