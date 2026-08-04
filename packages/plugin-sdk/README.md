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

## Context

|                                            |                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `ctx.owox`                                 | OWOX API client. The SDK owns its transport; you cannot replace it. |
| `ctx.ui.openExternal(url)`                 | Ask the host to open an external https URL in a new tab.            |
| `ctx.ui.navigate(path)`                    | Ask the host to go to a page inside OWOX, in place of your frame.   |
| `ctx.signal`                               | Aborts when the host tears your plugin down.                        |
| `ctx.userId`, `ctx.projectId`, `ctx.theme` | Display context. No tokens.                                         |

Requests time out after 30 seconds; streamed reads do not. At most 32 may be in flight.
