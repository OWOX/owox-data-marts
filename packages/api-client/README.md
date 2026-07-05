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

## Documentation

- [@owox/api-client guide](https://docs.owox.com/docs/api/api-client/)
- [API Keys](https://docs.owox.com/docs/api/api-keys/)
- [OpenAPI and Swagger UI](https://docs.owox.com/docs/api/openapi/)
