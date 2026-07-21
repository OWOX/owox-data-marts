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

Use `runs.getHistory()` to inspect historical Data Mart executions visible to the current
project member. Pass optional `limit` and `offset` values to page through the project-wide history;
the API defaults to at most 100 runs.

```ts
const history = await client.runs.getHistory({ limit: 50, offset: 0 });

for (const run of history.runs) {
  console.log(run.dataMart.title, run.type, run.status, run.finishedAt);
}
```

Each run includes its Data Mart ID and title, creator metadata when available, execution and trigger
types, status, timestamps, and available logs, errors, metadata, and totals. This makes the method
suitable for monitoring and automation without calling the HTTP endpoint directly.

## List project insight templates

Use `insightTemplates.list()` to discover reusable insight definitions across the Data Marts
visible to the current project member. Pass optional `limit` and `offset` values to page through
the project-wide list; the API defaults to at most 100 templates.

```ts
const templates = await client.insightTemplates.list({ limit: 50, offset: 0 });

for (const template of templates.insights) {
  console.log(template.dataMart.title, template.title, template.canDelete);
}
```

Each result includes the template summary, its Data Mart ID and title, creator metadata when
available, and whether the current member can delete it. This makes the method suitable for
automation and agent workflows that need to find reusable insight definitions without scanning
Data Marts individually.

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
  columns: '*',
  column: ['Revenue: net = USD'],
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

Column selection uses two separate fields:

- `columns: '*'` selects all current Data Mart output columns.
- `columns: '**'` selects all columns available to Reports, including joined fields.
- `column: ['Event Date (local)', 'Revenue: net = USD']` selects exact column names.
- `column: ['*', '**']` selects literal columns named `*` and `**`.

Do not pass comma-separated column lists. Column names are opaque strings and may contain commas, equals signs, spaces, quotes, or other symbols.

Use `filter` and `sort` arrays with the same rule shapes as report output controls. For normal filters on the streamed output, omit `placement` or use `placement: 'post-join'`. Use `placement: 'pre-join'` with `aliasPath` only when filtering a joined source before it is joined into the result.

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
