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

## List data marts

```ts
const dataMarts = await client.dataMarts.list();
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
