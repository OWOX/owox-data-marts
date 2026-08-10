# @owox/api-client

TypeScript/JavaScript client for calling the OWOX Data Marts API from custom
scripts, internal tools, automation, and local agent workflows.

## Install

```bash
npm install @owox/api-client
```

## Usage

```ts
import { OWOXApiClient } from '@owox/api-client';

const client = new OWOXApiClient({
  apiKey: process.env.OWOX_API_KEY!,
});

const context = await client.auth.getContext();
```

## Low-level API methods

Prefer the typed resources such as `client.dataMarts` and `client.project`. Use these
low-level methods only as an escape hatch for an API-key-compatible endpoint that does
not yet have a typed abstraction:

- `getJson<T>(path, query?)`
- `postJson<T>(path, body, accept?)`
- `putJson<T>(path, body)`
- `patchJson<T>(path, body)`
- `deleteJson<T = void>(path)`
- `getStream(path, query?)`

Caller generics are TypeScript-only. The low-level client does not validate the response at runtime.
Validate the data yourself before relying on it. Paths must be root-relative `/api/...` paths and
are limited to 2,048 characters; unsafe or redirecting paths are refused. The API-key client
exchanges and attaches authorization internally.

Custom transports built against the previous interface remain compatible. They can continue
serving existing resources without implementing PATCH or DELETE; calling a new method before the
transport adds support rejects with `OWOXConfigError`.

```ts
type Deleted = { deleted: true };

await client.patchJson('/api/example-resource/item-123', { title: 'Updated' });
const deletion = await client.deleteJson<Deleted>('/api/example-resource/item-123');
await client.deleteJson('/api/example-resource/item-123'); // Empty or 204 response: void
```

## Documentation

- [@owox/api-client guide](https://docs.owox.com/docs/api/api-client/)
- [API Keys](https://docs.owox.com/docs/api/api-keys/)
- [OpenAPI and Swagger UI](https://docs.owox.com/docs/api/openapi/)
