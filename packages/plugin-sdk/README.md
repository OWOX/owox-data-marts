# @owox/plugin-sdk

Build a plugin that runs inside OWOX Data Marts.

```ts
import { connect } from '@owox/plugin-sdk';

const ctx = await connect();
const dataMarts = await ctx.owox.dataMarts.list();
```

`connect()` completes a handshake with the OWOX host page and returns a context
carrying `ctx.owox` — a real OWOX API client.

## What to know before you build

Your plugin runs in a cross-origin iframe with an **opaque origin**. That means no
cookies, no `localStorage`, no `IndexedDB`, no service workers, and requests to your own
backend arrive with `Origin: null`, so it must send `Access-Control-Allow-Origin: *` and
cannot use cookie sessions.

The same applies to **your own assets**: an opaque origin matches nothing, not even the
server that delivered the page, so a bundled `<script type="module">` is fetched in CORS
mode and needs that header too. Without it the page loads and runs no code at all — the
failure looks like a plugin that does nothing rather than one that could not start.
GitHub Pages sends the header; a plain static server usually does not.

Your entry page must **not** send `X-Frame-Options` or a restrictive
`Content-Security-Policy: frame-ancestors`, or OWOX will refuse to publish it.

`connect()` and the host agree on a protocol version during the handshake, so a page built
against an SDK the deployment cannot speak fails to start rather than misbehaving.

Your plugin never holds a credential. `ctx.owox` calls are brokered by the host page,
which attaches the token — so requests act with **the authority of the member who
installed your plugin**, and never more. Do not assume you are trusted beyond that.
Protected routes still apply their server-side authorization and reject calls the member
may not make.

Use low-level methods only for endpoints without a typed resource:
`getJson<T>(path, query?)`, `postJson<T>(path, body, accept?)`, `putJson<T>(path, body)`,
`patchJson<T>(path, body)`, `deleteJson<T = void>(path)`, and `getStream(path, query?)`.
Their generics do not validate responses at runtime, so validate returned data yourself.
Paths must be root-relative `/api/...` and are limited to 2,048 characters; unsafe or
redirecting paths are refused.

## Context

|                                            |                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `ctx.owox`                                 | OWOX API client. The SDK owns its transport; you cannot replace it. |
| `ctx.credentials`                          | Declared, installation-bound Credential handles. No raw secrets.    |
| `ctx.collections(name)`                    | Host-stored JSON documents declared by the plugin.                  |
| `ctx.ui.openExternal(url)`                 | Ask the host to open an external https URL in a new tab.            |
| `ctx.ui.navigate(path)`                    | Ask the host to go to a page inside OWOX, in place of your frame.   |
| `ctx.signal`                               | Aborts when the host tears your plugin down.                        |
| `ctx.userId`, `ctx.projectId`, `ctx.theme` | Display context. No tokens.                                         |

Requests time out after 30 seconds; streamed reads do not. At most 32 may be in flight.

## Credentials

Declare only the provider access the plugin needs in the release's immutable `plugin.json`:

```json
{
  "credentials": [
    "github",
    { "id": "ai", "models": ["fast", "reasoning", "embedding"] },
    { "id": "openai", "optional": true }
  ]
}
```

The installer explicitly selects a project-owned Credential for each requirement. Optional
requirements may be left unconfigured. A declared handle is absent from `ctx.credentials` until it
is configured and usable for the current installation.

An exact provider handle exposes only a guarded, authenticated `fetch` implementation. The host
injects the secret, restricts requests to the definition's HTTPS origins, and never sends the raw
secret to the plugin frame:

```ts
import { exactCredential } from '@owox/plugin-sdk';

const github = exactCredential(ctx.credentials, 'github');
if (!github) throw new Error('GitHub access is not configured');

const response = await github.asFetch()('https://api.github.com/user');
const user = await response.json();
```

The logical `ai` handle exposes only the model capabilities declared in the manifest. They
implement the Vercel AI SDK provider v4 contract, so the plugin chooses a capability while the
project maintainer chooses the underlying provider and provider model:

```ts
import { generateText } from 'ai';

const model = ctx.credentials.ai;
if (!model) throw new Error('Fast AI is not configured');

const result = await generateText({ model, prompt: 'Summarize this report' });
```

The common `"ai"` requirement declares `fast`, so the logical handle itself is the fast model and
`ctx.credentials.ai.fast` is an alias for the same object. `reasoning` and `embedding` are available
only when declared. Logical AI does not expose `asFetch()`. Provider-specific APIs require an exact
provider requirement.

The same accessor resolves a dynamic external handle without an SDK provider-name list:

```ts
const acme = exactCredential(ctx.credentials, 'acme');
if (!acme) throw new Error('Acme access is not configured');
const response = await acme.asFetch()('https://api.acme.example/v1/items');
```

## Collections

Collections let a plugin persist JSON without running its own backend. Declare every collection in
the immutable `plugin.json` shipped with the release. The declared structure is a contract within
a compatibility line: a release may add collections and change action mappings, but cannot remove
a collection or change its name, scope, or entity binding — such a release is rejected and the
previous version stays current. Ship a breaking collection change by opening a new line: a major
version bump, or a minor bump while the plugin is still below 1.0.0.

```json
{
  "collections": [
    {
      "name": "dashboards",
      "scope": "project",
      "entityBinding": {
        "type": "data-mart",
        "actions": {
          "read": "SEE",
          "create": "SEE",
          "update": "SEE",
          "delete": "SEE"
        }
      }
    }
  ]
}
```

`project` collections are shared across eligible members of the project. `member` collections are
private to the current project member. An entity-bound collection additionally authorizes every
operation against its parent entity using the action map from the manifest.

```ts
interface Dashboard {
  title: string;
  layout: Array<{ chartId: string; x: number; y: number }>;
}

const dashboards = ctx.collections<Dashboard>('dashboards');

await dashboards.put(
  'executive-summary',
  { title: 'Executive summary', layout: [] },
  { parentId: dataMartId }
);

const dashboard = await dashboards.get('executive-summary');
if (dashboard) {
  console.log(dashboard.document, dashboard.parentId, dashboard.updatedAt);
}

let cursor: string | undefined;
do {
  const page = await dashboards.list({ limit: 50, cursor });
  for (const item of page.items) {
    console.log(item.id, item.document);
  }
  cursor = page.nextCursor ?? undefined;
} while (cursor);

await dashboards.delete('executive-summary');
```

For an entity-bound collection, pass `parentId` on every `put`. It cannot be changed by a later
update. `get` returns `null` when the document is absent or inaccessible, and `list` returns only
documents whose parents the current member may read. To bound authorization work, each list request
for an entity-bound collection inspects at most 10 stored documents. Its `items` may therefore be
shorter than the requested limit, or empty, while `nextCursor` is still non-null. Continue paging
until `nextCursor` is null rather than treating a short page as the end.

Collections survive plugin uninstall, suspension and recoverable deletion. They are subject to
deployment-wide document, collection and project limits. Store JSON application state only:
collections are not a credential store and must never contain passwords, API keys, access tokens
or other secrets.
