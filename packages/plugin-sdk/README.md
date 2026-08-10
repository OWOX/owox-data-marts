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
| `ctx.collections(name)`                    | Host-stored JSON documents declared by the plugin.                  |
| `ctx.ui.openExternal(url)`                 | Ask the host to open an external https URL in a new tab.            |
| `ctx.ui.navigate(path)`                    | Ask the host to go to a page inside OWOX, in place of your frame.   |
| `ctx.signal`                               | Aborts when the host tears your plugin down.                        |
| `ctx.userId`, `ctx.projectId`, `ctx.theme` | Display context. No tokens.                                         |

Requests time out after 30 seconds; streamed reads do not. At most 32 may be in flight.

## Collections

Collections let a plugin persist JSON without running its own backend. Declare every collection in
the immutable `plugin.json` shipped with the release:

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
