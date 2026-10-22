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

|                                            |                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `ctx.owox`                                 | OWOX API client. The SDK owns its transport; you cannot replace it.                            |
| `ctx.credentials`                          | Declared, installation-bound Credential handles. No raw secrets.                               |
| `ctx.collections(name)`                    | Host-stored JSON documents declared by the plugin.                                             |
| `ctx.actions`                              | Runs your backend's actions through OWOX; `undefined` on a host without backend actions.       |
| `ctx.schedules`                            | Creates cron schedules for your backend's actions; `undefined` on a host without schedules.    |
| `ctx.ui.openExternal(url)`                 | Ask the host to open an external https URL in a new tab.                                       |
| `ctx.ui.navigate(path)`                    | Ask the host to go to a page inside OWOX, in place of your frame.                              |
| `ctx.route`                                | The plugin's own route, e.g. `/dashboards/42`; `undefined` on a host without page links.       |
| `ctx.ui.setRoute(path)`                    | Tells the host which of your pages is showing, so the address in the browser is a link to it.  |
| `ctx.ui.copyLink(path?)`                   | Asks the host to copy a link to one of your pages (the current one by default) and confirm it. |
| `ctx.signal`                               | Aborts when the host tears your plugin down.                                                   |
| `ctx.userId`, `ctx.projectId`, `ctx.theme` | Display context. No tokens.                                                                    |

Requests time out after 30 seconds; streamed reads do not. At most 32 may be in flight.

## Shareable pages

A plugin's pages are reachable at `/ui/<project>/plugins/<pluginId>/open<route>`, where `<route>` is
your own route. Read `ctx.route` after `connect()` and show that page; call `ctx.ui.setRoute(route)`
whenever the member moves to another page, and `ctx.ui.copyLink()` from your own Share button.
`ctx.route` is `undefined` on a host without page links — that is how you detect support; hide your
Share button then.

Treat `ctx.route` as untrusted, link-supplied input: use it only to choose what to show, never to
start a write, a run, or a credential use without the member's own click, and never put secrets or
personal data in a route — it appears in the address bar, history, and analytics. It may still carry
percent-encoded sequences (e.g. `%2F`); decode deliberately.

- A route starts with `/`, may carry `?query` and `#hash`. Its path must not contain `.` or `..`
  segments, `\`, an empty segment, or a trailing space; control, bidi, and invisible characters are
  refused anywhere in the route — the host refuses such a route and opens your plugin at `/`.
  `ctx.route` is percent-encoded, as in the address, and never carries a `utm_*` parameter — one you
  report through `setRoute` or `copyLink` is dropped the same way. A query or hash may carry a
  backslash or a trailing space; percent-encode a bidi or zero-width character you put in a route
  yourself, or it is refused.
- Use `ctx.ui.setRoute` for the plugin's own pages; `ctx.ui.navigate` is for host pages.
- Call `ctx.ui.copyLink()` from a click handler: the host copies only during the member's own
  interaction, one link at a time.
- The host replaces the address rather than adding history entries, so the browser's Back button
  leaves the plugin instead of stepping through its pages.

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
update. A collection without `entityBinding` takes no `parentId`. OWOX reads `entityBinding` from
the current version's `plugin.json`, not from your working copy; a `put` that does not match it
rejects with `payload.code` `HTTP_ERROR`, `status` 400, and a message naming the collection and the
current version (`payload.apiCode` `PLUGIN_COLLECTION_PARENT_ID_REQUIRED` or
`PLUGIN_COLLECTION_NOT_ENTITY_BOUND`). Adding `entityBinding` to an existing collection is a
breaking change and leaves its saved documents unreachable; to bind existing data, declare a new
collection and copy the documents into it. `get` returns `null` when the document is absent or inaccessible, and `list` returns only
documents whose parents the current member may read. To bound authorization work, each list request
for an entity-bound collection inspects at most 10 stored documents. Its `items` may therefore be
shorter than the requested limit, or empty, while `nextCursor` is still non-null. Continue paging
until `nextCursor` is null rather than treating a short page as the end.

Collections survive plugin uninstall, suspension and recoverable deletion. They are subject to
deployment-wide document, collection and project limits. Store JSON application state only:
collections are not a credential store and must never contain passwords, API keys, access tokens
or other secrets.

## Backend actions

A plugin can declare actions that run on its own backend built with `@owox/plugin-sdk/server`,
such as a Cloudflare Worker or a Cloud Run service. OWOX checks each call, then calls the backend,
which acts with the access of the member who installed the plugin until the action's
`timeoutSeconds` run out. It keeps the role the member had when the action started, even if the
member leaves the project or gets another role meanwhile; the installation is checked on every
request. `backend.url` may be relative: it resolves against `delivery.url`, so one
Worker can serve the page and the actions.

```json
{
  "backend": {
    "url": "/owox",
    "actions": {
      "update-document": {
        "timeoutSeconds": 60,
        "input": {
          "type": "object",
          "required": ["documentId"],
          "properties": { "documentId": { "type": "string" } }
        }
      }
    }
  }
}
```

`input` is a JSON Schema 2020-12. The release check refuses one with `pattern`,
`patternProperties`, `format`, `uniqueItems`, `$async` or a recursive or non-local `$ref`, one that
expands to more than 2,000 nodes, and input schemas that together take longer than 2 seconds, or
more memory than allowed, to compile (`ACTION_INPUT_UNSUPPORTED`).

```ts
if (ctx.actions) {
  const result = await ctx.actions.invoke('update-document', { documentId }, { signal });
}
```

- `invoke` waits for the result. Aborting `signal`, or leaving the plugin page, cancels the
  execution. Closing or reloading the tab cancels nothing, and the execution can run until
  `timeoutSeconds`.
- `start` returns `{ id }` at once, and the execution keeps running after the plugin closes. Read
  it later with `get(id)` or `wait(id)`, and stop it with `cancel(id)`.
- A failure rejects with an error whose `name` is `PluginActionError`. Its `code` is one of:
  - a refusal, such as `ACTION_NOT_DECLARED`, `INVALID_INPUT`, `INPUT_TOO_LARGE` or
    `TOO_MANY_EXECUTIONS`;
  - the code your backend failed with;
  - `TIMED_OUT` or `CANCELLED`.

  `executionId` is set once the execution exists. For `INVALID_INPUT`, `errors` lists the fields
  that failed as `{ instancePath, message }`. Refusals map to `PluginActionError` for `start` and
  `invoke` only: a refusal from `get`, `wait` or `cancel`, such as `EXECUTION_NOT_FOUND`, stays a
  `PluginTransportError` that carries `apiCode`. A transport failure stays a
  `PluginTransportError`.

- At most 5 executions of an installation run at once. An installation also starts at most 60 per
  minute and 5,000 per 24 hours; new starts are refused once 100 MiB of uncleared inputs and results
  are stored. Every execution that starts counts, even a cancelled or failed one. These limits, and
  too many inputs being validated at once, answer `TOO_MANY_EXECUTIONS`. While an `invoke` or `wait`
  is waiting, it holds one of the 32 request slots for up to 20 seconds per poll.
- Input is refused with `INVALID_INPUT` when it is nested deeper than 100 levels or its validation
  exceeds its budget.
- OWOX clears an execution's `input`, `result` and the `errorMessage` of a failure your backend
  reported with its own code 24 hours after it finishes.
- `ctx.actions` is `undefined` on a host without backend actions.

## Schedules

`ctx.schedules` creates cron schedules that start one of your backend actions for the member who
installed the plugin, with no browser open. It is `undefined` on a host without schedules.

```ts
if (ctx.schedules) {
  const schedule = await ctx.schedules.create({
    action: 'update-document',
    parameters: { documentId },
    cron: '0 9 * * *',
    timeZone: 'Europe/Kyiv',
    name: 'Morning update',
  });
  await ctx.schedules.pause(schedule.id);
}
```

- `create`, `update`, `pause`, `resume` and `delete` change a schedule; `list` and `get` read. Writes
  work only from the plugin page. The server `ctx.schedules` only reads, with `list()` and
  `get(id)`; a write that a backend action sends to the runtime API directly is refused with
  `EXECUTION_TOKEN_NOT_ALLOWED`.
- `create` makes an enabled schedule unless you pass `enabled: false`. `name` is optional, at most
  200 characters after OWOX trims it; an empty name is stored as no name.
- `parameters` is the action's input and must match its `input` schema. Omit it for an action
  without one.
- `cron` and `timeZone` follow the rules of Data Mart schedules. `cron` takes at most 255
  characters and needs a run in the next eight years. `timeZone`, 1 to 64 characters, must be an
  IANA zone that `Intl.DateTimeFormat` accepts. A schedule runs at most once a minute.
- Schedule ids are UUIDs. Another id rejects with a `PluginTransportError` (`HTTP_ERROR`, status
  400). In the plugin page, the host bridge answers `FORBIDDEN`, without sending a request, to an id
  that contains `/`, `%` or `\`, or is `.` or `..`.
- By default, an installation has at most 20 schedules, and `parameters` take at most 64 KiB; a
  self-managed deployment can change both.
- A schedule that cannot run is disabled and keeps its settings. `disabledReason` says why:
  `ACTION_NOT_DECLARED` or `INVALID_PARAMETERS`. `resume` checks it again. A schedule a project
  admin paused in **Plugins → Schedules** has `PAUSED_BY_ADMIN`, and its `resume` is refused with
  `SCHEDULE_PAUSED_BY_ADMIN`.
- While the installing member is not an active project member, or their account is locked, a
  schedule stays enabled and skips its runs.
- `lastRun` is the schedule's latest execution. A run held back by the start limits has the status
  `QUEUED` and starts when a slot frees up; one still queued after 24 hours ends `TIMED_OUT`. An
  update that changes `action` or `parameters` cancels the queued run.
- A refusal with any OWOX error code rejects with an error whose `name` is `PluginActionError`; its
  `code` is, for example, `INVALID_SCHEDULE`, `ACTION_NOT_DECLARED`, `INVALID_PARAMETERS`,
  `PARAMETERS_TOO_LARGE`, `TOO_MANY_SCHEDULES`, `SCHEDULE_BUSY`, `SCHEDULE_NOT_FOUND`,
  `SCHEDULE_PAUSED_BY_ADMIN` or `TOO_MANY_EXECUTIONS`. For `INVALID_PARAMETERS`, `errors` lists
  the fields that failed as `{ instancePath, message }`. A failure without a code stays a
  `PluginTransportError`, and so does the refusal of a suspended plugin, with the code `SUSPENDED`.
- In a scheduled run, `ctx.execution.trigger` is `'schedule'` and `ctx.execution.scheduleId` names
  the schedule.

## `@owox/plugin-sdk/server`

A plugin's backend is built with `createBackend`. It uses only the Fetch API. On Node, import it
from `@owox/plugin-sdk/server/node` and run it behind `@hono/node-server`: without `hosts`, that
`createBackend` checks every address it connects to and refuses a host name that resolves to a
loopback, private, link-local or other non-public address. `@owox/plugin-sdk/server` without
`hosts` throws at creation outside Cloudflare Workers. Deployed Workers do not connect to private
addresses, but `wrangler dev` does: list `hosts` while a Worker runs locally, especially behind a
tunnel. On other runtimes, such as Bun or Deno, list `hosts`.

```ts
import { createBackend } from '@owox/plugin-sdk/server';

export default createBackend({
  repositoryId: '123456789',
  actions: {
    'update-document': async (input, ctx) => {
      const dataMarts = await ctx.owox.dataMarts.list();
      return { count: dataMarts.length };
    },
  },
});
```

For each request, `createBackend`:

1. refuses a `host` that is not an origin. With `hosts`, a list of exact origins without
   wildcards, it also refuses a host outside that list. Without `hosts` any OWOX Data Marts
   deployment on a public HTTPS origin may call the backend, Cloud or self-managed; a host that
   uses `http:`, is an IP address or a single-label name, or is `localhost` or a name under
   `.localhost`, `.local`, `.internal` or `.home.arpa` gets `HOST_NOT_ALLOWED`. Everything the
   handler reaches through `ctx` goes back to that same host, so a forged host gains nothing from
   OWOX Data Marts. Set `hosts` when a handler also uses the backend's own secrets or storage, and
   to allow an internal or `http:` deployment;
2. reads the execution from that host with the token OWOX sent. A request whose token the named
   host does not accept gets `401`, and no handler runs;
3. refuses an execution of another plugin with `PLUGIN_MISMATCH`. `repositoryId` is the plugin's
   GitHub repository id; find it with `gh api repos/OWNER/NAME --jq .id`. OWOX names the plugin; a
   host you do not list in `hosts` can name any;
4. runs the handler for the execution's action.

The handler's `ctx` provides:

- `owox`: the API client, acting with the access of the member who installed the plugin;
- `credentials`: exact Credential handles, used through
  `exactCredential(ctx.credentials, name).asFetch()`. The secret stays in OWOX;
- `collections(name)`;
- `schedules`: `list()` and `get(id)` of the installation's schedules, read-only. It is always
  defined; on an older OWOX without schedules its calls fail with a 404 transport error;
- `execution`: ids, `trigger` (`'frontend'` or `'schedule'`), `scheduleId` (`null` for a start from
  the plugin page, and from an older OWOX), `deadlineAt`, `pluginVersion` and `plugin`, with the
  plugin's `id` and `repositoryId`;
- `host`: the OWOX origin that accepted the execution token, to build links to OWOX pages with;
- `signal`, which aborts at the action's deadline. When OWOX drops the call, Cloudflare Workers
  cancels the whole invocation: the handler stops, code after an `await` does not run, and
  `request.signal` never fires. Do not rely on cleanup after an `await`. On Node with
  `@hono/node-server`, the handler keeps running and `signal` aborts.

Return any JSON value of at most 1 MiB, nested at most 100 levels; any other result fails with
`BACKEND_INVALID_RESPONSE`. To fail with your own code, throw an error whose `code` matches
`^[A-Z][A-Z0-9_]{0,63}$`, for example `DOCUMENT_LOCKED`. Any other error ends the execution with
`ACTION_FAILED`. Codes that start with `BACKEND_`, and the codes OWOX sets itself, are reserved. AI
Credential handles are not available in a backend.

Deploy the backend, for example with `npx wrangler deploy` or to Cloud Run as the
[authoring guide](https://docs.owox.com/docs/plugins/authoring-guide/) shows, and set
`backend.url`: a relative path such as `/owox` when a Worker also serves the page, because OWOX
resolves it against `delivery.url`, or an absolute `https://` URL when the backend is on another
origin. Within a compatibility line a release cannot add a backend or move its origin
(`BACKEND_ORIGIN_CHANGED`).
