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
export OWOX_API_ORIGIN=https://app.owox.com
export OWOX_API_KEY_ID=pmk_xxx
export OWOX_API_KEY_SECRET=your_api_key_secret
```

Then create a client:

```ts
import { OWOXApiClient } from '@owox/api-client';

const client = new OWOXApiClient({
  apiOrigin: process.env.OWOX_API_ORIGIN!,
  apiKeyId: process.env.OWOX_API_KEY_ID!,
  apiKeySecret: process.env.OWOX_API_KEY_SECRET!,
});

const dataMarts = await client.dataMarts.list();

console.log(dataMarts);
```

## List data marts

```ts
const dataMarts = await client.dataMarts.list();
```

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
  apiOrigin: process.env.OWOX_API_ORIGIN!,
  apiKeyId: process.env.OWOX_API_KEY_ID!,
  apiKeySecret: process.env.OWOX_API_KEY_SECRET!,
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

- Do not hard-code API key secrets in source code.
- Use environment variables or a secret manager.
- Do not commit `.env` files containing API key secrets.
- Avoid putting API key secrets in AI agent instructions or prompts.
- Revoke keys that are no longer used.

## Authentication behavior

`@owox/api-client` uses the API key ID and API key secret to request a short-lived access token.

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
