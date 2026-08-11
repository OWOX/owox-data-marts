# Declarative Connector Manifest Reference

A **declarative connector manifest** is a single JSON document that tells OWOX Data Marts how to pull data from a third-party HTTP API — no code required. You describe the API's shape (base URL, authentication, endpoints, pagination, how a raw record maps to output fields) and the engine (`ManifestParser` + `DeclarativeSource`) does the rest: making requests, paging through results, applying your date window, filtering and transforming records, and casting fields to their declared types.

This page is the complete grammar the engine accepts, written for a person authoring or reviewing a manifest by hand — every key, every enum value, and the mistakes that most often make the parser reject a manifest.

## Contents

- [How the engine turns responses into rows](#how-the-engine-turns-responses-into-rows)
- [Top-level manifest keys](#top-level-manifest-keys)
- [Common naming mistakes](#common-naming-mistakes)
- [Parameters](#parameters)
- [Authentication](#authentication)
- [Nodes](#nodes)
- [Fields](#fields)
- [Pagination](#pagination)
- [Incremental (date-windowed) extraction](#incremental-date-windowed-extraction)
- [Partition router: substream and list](#partition-router-substream-and-list)
- [Multi-account fan-out](#multi-account-fan-out)
- [Asynchronous retriever](#asynchronous-retriever)
- [Transformations](#transformations)
- [Record filter](#record-filter)
- [Error handling](#error-handling)
- [Rate limiting](#rate-limiting)
- [Templating scopes](#templating-scopes)
- [Authoring workflow](#authoring-workflow)
- [Worked examples](#worked-examples)

## How the engine turns responses into rows

Every node runs the same pipeline, in this order:

**fetch (+ pagination) → `recordFilter` → `transformations` → field projection/casting (`fields`)**

The step that most often trips up a new manifest is the first one: how a raw HTTP response becomes a set of rows. `recordSelector.recordPath` (or, for an async node, `download.recordPath`) is an array of keys that walks the JSON response down to the node holding your records. From there, the engine turns that node into rows in exactly two ways:

- An **array** → one row per element.
- A single **object** → exactly one row.

There is no third case. The engine cannot turn an object's *keys* into rows, and there is no "current key" available to a field mapping. So never point a node at an endpoint that returns an object keyed by entity id, such as:

```json
{ "bitcoin": { "usd": 65000 }, "ethereum": { "usd": 3400 } }
```

There is no `recordPath` that produces one row per currency here. Prefer an endpoint that returns an array instead, or — if the API only offers the dictionary shape — fetch one entity per run via a parameter or a [partition router](#partition-router-substream-and-list) value.

Once records are selected, `recordFilter` (optional, keep-or-drop) runs first, then `transformations` (optional, add/remove/reshape), and finally each field's `dataPath`/`apiName` reads its value out of the (post-filter, post-transformation) record and casts it to the declared type.

## Top-level manifest keys

| Key | Required | Description |
|---|---|---|
| `version` | Yes | Always the string `"1.0"`. |
| `name` | Yes | A short PascalCase identifier, e.g. `MolocoCloud`. |
| `baseUrl` | Yes | The API origin, e.g. `https://api.example.com` (no trailing path). |
| `parameters` | Yes | An object of user-supplied inputs — may be `{}` if the connector needs none. See [Parameters](#parameters). |
| `nodes` | Yes | An object keyed by node name; each value is one data stream. See [Nodes](#nodes). |
| `title` | No | A human-friendly display name, e.g. `"Frankfurter FX (Declarative)"`. |
| `description` | No | A longer description shown in the UI. |
| `docUrl` | No | A link to the API's own documentation. |
| `authentication` | No | How requests are authenticated. See [Authentication](#authentication). |
| `accounts` | No | Fan a single run out across multiple account IDs. See [Multi-account fan-out](#multi-account-fan-out). |
| `rateLimit` | No | A global request-rate cap. See [Rate limiting](#rate-limiting). |

## Common naming mistakes

The parser is strict and rejects near-miss names outright. These five are the most common causes of a rejected manifest:

- The auth block is **`authentication`**, not `auth`.
- A request's query string is **`queryParameters`**, not `queryParams`.
- A record's row-selector is **`recordSelector.recordPath`** — an array of keys — not `fieldPath`.
- **`fields`** is an object keyed by field name, not an array.
- A **field's** `dataPath`/`apiName` is a single dot-string (e.g. `"stats.spending"`), but almost every other "path" in the grammar — `recordSelector.recordPath`, `recordFilter.path`, `errorHandler`'s `bodyMatch.path`, pagination's `cursor.path`/`stopCondition.path`, an async node's `jobIdPath`/`statusPath`/`resultUrlPath`/`download.recordPath`, and `partitionRouter.parent.recordPath` — is an **array** of key segments (e.g. `["stats", "spending"]`). Mixing the two conventions up is a common, silent bug.

## Parameters

Each entry in `parameters` describes one user-supplied input, referenced elsewhere via `{{ parameters.Name }}`:

```json
{
  "ApiKey": {
    "requiredType": "string",
    "isRequired": true,
    "label": "API Key",
    "description": "Found under Settings → API in your account.",
    "attributes": ["SECRET"]
  },
  "Region": {
    "requiredType": "string",
    "isRequired": false,
    "default": "us",
    "label": "Region"
  }
}
```

| Field | Meaning |
|---|---|
| `requiredType` | One of `string`, `number`, `boolean`, `date`. |
| `isRequired` | Boolean — this, not an attribute, is what makes the parameter mandatory. |
| `default` | Optional default used when the user leaves the field blank. |
| `label` | Optional display label shown in the configuration form. |
| `description` | Optional help text shown next to the field. |
| `attributes` | Optional flags. The one every author should know is `SECRET` — it masks the value in the UI and stores it encrypted; always set it for API keys, client secrets, tokens, and passwords. A few advanced/internal flags also exist (`HIDE_IN_CONFIG_FORM`, `ADVANCED`, `OAUTH_FLOW`, `DEPRECATED`, `PINNED`, `MANUAL_BACKFILL`) but are rarely needed when hand-authoring a manifest. |

Marking a parameter `SECRET` only changes how the *manifest* declares it — the user still enters the actual value themselves, through the connector's configuration form in the browser. A manifest should never contain a real credential value.

## Authentication

If the API needs no authentication, omit `authentication` entirely. Otherwise, `authentication.type` must be one of `apiKey`, `bearer`, `basic`, `tokenExchange`, `oauth2`, `selective`.

### API key

Injects a templated value into a header or query parameter:

```json
{
  "type": "apiKey",
  "inject": { "into": "header", "name": "Api-Key", "format": "{{ parameters.ApiKey }}" }
}
```

`inject.into` is `"query"` or `"header"`; `inject.name` is the parameter/header name; `inject.format` is a template string — often just `{{ parameters.X }}`, but it can wrap it, e.g. `"ApiKey {{ parameters.ApiKey }}"`.

### Bearer token

The same injection mechanism, fixed to an `Authorization: Bearer <token>` header:

```json
{
  "type": "bearer",
  "inject": { "into": "header", "name": "Authorization", "format": "Bearer {{ parameters.Token }}" }
}
```

### Basic auth

HTTP Basic auth — no `inject` block; the engine base64-encodes `username:password` itself:

```json
{
  "type": "basic",
  "username": "{{ parameters.Username }}",
  "password": "{{ parameters.Password }}"
}
```

### Token exchange

Exchanges a credential for a server-issued token via one POST, then injects that token. Use this for APIs with a simple "trade my API key for a session token" step and a **fixed-length** token lifetime:

```json
{
  "type": "tokenExchange",
  "exchange": {
    "method": "POST",
    "url": "https://api.example.com/auth/tokens",
    "body": { "api_key": "{{ parameters.ApiKey }}" },
    "tokenPath": ["token"],
    "ttlSeconds": 3600
  },
  "inject": { "into": "header", "name": "Authorization", "format": "Bearer {{ auth.token }}" }
}
```

`exchange.tokenPath` is an array locating the token in the JSON response. The token is cached for `exchange.ttlSeconds` and re-issued once it expires. `inject` templates read the cached token via `{{ auth.token }}`.

### OAuth2

A standard OAuth2 token endpoint (`refresh_token` or `client_credentials` grant). Prefer this over `tokenExchange` for Google/Microsoft/Facebook/LinkedIn-class APIs, and whenever the provider returns an `expires_in` or may rotate the refresh token:

```json
{
  "type": "oauth2",
  "tokenUrl": "https://oauth2.googleapis.com/token",
  "grantType": "refresh_token",
  "clientId": "{{ parameters.ClientId }}",
  "clientSecret": "{{ parameters.ClientSecret }}",
  "refreshToken": "{{ parameters.RefreshToken }}",
  "scope": "https://www.googleapis.com/auth/spreadsheets.readonly",
  "ttlSeconds": 300,
  "inject": { "into": "header", "name": "Authorization", "format": "Bearer {{ auth.token }}" }
}
```

| Field | Notes |
|---|---|
| `tokenUrl` | Required. |
| `grantType` | `"refresh_token"` (default) or `"client_credentials"`. |
| `clientId` / `clientSecret` | Required. |
| `refreshToken` | Required when `grantType` is `"refresh_token"`. |
| `scope` | Optional, space-separated OAuth scopes. |
| `ttlSeconds` | Optional fallback cache TTL, used only when the token response omits `expires_in` — defaults to 300s if also unset. When the response *does* include `expires_in`, that value (minus a 60s safety skew) drives the cache lifetime instead. |
| `inject` | Required, same shape as the other auth types; always reads `{{ auth.token }}`. |

On a `refresh_token` grant, if the provider rotates the refresh token (returns a new one in the response), the engine keeps using the new one for the rest of the run and reports it back so it is persisted for the next run — but only for a connector saved with credentials in the platform's credential store, not for values typed inline as plain parameters. A `GeneratedRefreshToken` parameter is auto-registered by the engine for every `oauth2` manifest; don't declare it yourself.

### Selective

Picks one of several authentication branches at runtime based on a parameter's value — useful when the same connector supports multiple auth modes (e.g. "API Key" vs "OAuth"):

```json
{
  "type": "selective",
  "selectionParameter": "AuthMode",
  "authenticators": {
    "apikey": {
      "type": "apiKey",
      "inject": { "into": "header", "name": "Api-Key", "format": "{{ parameters.ApiKey }}" }
    },
    "oauth": {
      "type": "oauth2",
      "tokenUrl": "https://oauth2.googleapis.com/token",
      "clientId": "{{ parameters.ClientId }}",
      "clientSecret": "{{ parameters.ClientSecret }}",
      "refreshToken": "{{ parameters.RefreshToken }}",
      "inject": { "into": "header", "name": "Authorization", "format": "Bearer {{ auth.token }}" }
    }
  }
}
```

`selectionParameter` names a manifest parameter whose runtime value picks the branch key — here, `{{ parameters.AuthMode }}` must resolve to `"apikey"` or `"oauth"`. Each branch is itself `apiKey` | `bearer` | `basic` | `tokenExchange` | `oauth2` — never another `selective` (no nesting).

## Nodes

`nodes` is an object keyed by node name. Each node describes one data stream:

```json
{
  "overview": "One-line human description of what this node returns.",
  "uniqueKeys": ["date", "id"],
  "destinationName": "my_table_name",
  "isTimeSeries": true,
  "defaultFields": ["date", "id", "name"],
  "request": {
    "method": "GET",
    "path": "/v1/things",
    "queryParameters": { "limit": "50" },
    "body": {}
  },
  "recordSelector": { "recordPath": ["data"], "responseFormat": "json" },
  "fields": { "...": { "type": "string" } }
}
```

| Field | Meaning |
|---|---|
| `overview` | Optional one-line description, shown in the builder UI. |
| `uniqueKeys` | Field names forming the row's unique key (used for upsert/dedupe). |
| `destinationName` | Optional; the destination table name (defaults to the node name). |
| `isTimeSeries` | Boolean; enables date-window incremental processing for this node. |
| `defaultFields` | Optional field names pre-selected by default (defaults to all declared fields). |
| `request` | `{ method, path, queryParameters?, body? }`. `method` is `GET` or `POST`. `path` is relative to `baseUrl` and must start with `/`. |
| `recordSelector.recordPath` | Array of keys locating the row(s) — see [How the engine turns responses into rows](#how-the-engine-turns-responses-into-rows). `recordSelector.responseFormat` is optional: `json` (default), `csv`, or `jsonl`. |
| `fields` | Object keyed by field name. See [Fields](#fields). |

A node can also optionally carry `pagination`, `incremental`, `partitionRouter`, `transformations`, `recordFilter`, and `errorHandler` — each covered in its own section below.

An **async** node (see [Asynchronous retriever](#asynchronous-retriever)) replaces `request` + `recordSelector` with a `retriever: { type: "async", submit, poll, download }` block instead — it must not also declare a plain `request`/`recordSelector` at the node level.

## Fields

`fields` is an object keyed by the **output** field name; each value describes how to read it from a raw API record:

```json
{
  "date": { "type": "date" },
  "id": { "type": "integer" },
  "spending": { "type": "number", "dataPath": "stats.spending" },
  "raw_json": { "type": "object", "description": "Full nested payload for debugging." }
}
```

- `type` — one of eight lowercase types: `string`, `integer`, `number`, `boolean`, `date`, `datetime`, `object`, `array`.
- `dataPath` (preferred) or `apiName` (legacy alias, same meaning) — a **dot-string** path into the raw record, e.g. `"total_market_cap.usd"` reaches a nested object. When the row itself is an array (for example `[[timestamp, price], ...]` selected via `recordPath`), use the positional index as the path: `"0"`, `"1"`. If both are omitted, the field name itself is used as the key — the API's field is assumed to already be named exactly that.
- `description` — optional help text.

Casting only special-cases `number`/`integer`/`boolean`/`date`. `datetime`, `object`, `array`, and `string` all fall through to the same default branch, which `JSON.stringify`s object/array values instead of keeping them structured — so an `array`/`object`-typed field is written out as a JSON string, not a nested value.

Remember the dot-string-vs-array distinction from [Common naming mistakes](#common-naming-mistakes): `dataPath` is `"a.b.c"`, never `["a", "b", "c"]`.

## Pagination

Optional, node-level, and only for sync nodes. `pagination.type` is one of `none`, `offset`, `page`, `cursor`.

### No pagination

```json
{ "type": "none" }
```

### Offset pagination

```json
{ "type": "offset", "offsetParam": "offset", "pageSize": 100 }
```

Stops once a page returns fewer records than `pageSize`; each subsequent request adds `pageSize` to the running offset.

### Page pagination

```json
{ "type": "page", "pageParam": "page", "startPage": 1 }
```

Stops once a page returns zero records; increments the page number by 1 each time, starting from `startPage` (default 1).

### Cursor pagination

```json
{
  "type": "cursor",
  "cursorParam": "cursor",
  "cursor": { "from": "body", "path": ["meta", "next_cursor"] }
}
```

Reads the next cursor value either from the response body (`cursor.from: "body"`, `cursor.path` as an array) or a response header (`cursor.from: "header"`, `cursor.header` as the name, with an optional `cursor.linkRel` to parse a `Link:` header's `rel="next"` URL). Pagination stops once no cursor value is found.

### Where the next-page value goes

All four types accept an optional `inject` describing **where** the next-page value is written on the following request:

```json
"inject": { "into": "query", "name": "offset" }
"inject": { "into": "header", "name": "X-Page-Token" }
"inject": { "into": "body", "path": ["paging", "offset"] }
"inject": { "into": "path" }
```

`inject.into` is one of `query` (default), `header`, `body` (needs `inject.path`, a deep-set array), or `path` — which replaces the node's request path/URL outright with the value, used when the API returns a full next-page URL to follow verbatim.

An optional `stopCondition` halts pagination early, regardless of type, when a response field matches a fixed value:

```json
"stopCondition": { "path": ["meta", "has_more"], "equals": false }
```

## Incremental (date-windowed) extraction

Optional, node-level; drives date-windowed (time-series) extraction. `incremental.strategy` is one of `none`, `day-by-day`, `range`.

### No incremental strategy

```json
{ "strategy": "none" }
```

### Day-by-day

```json
{
  "strategy": "day-by-day",
  "request": { "into": "query", "startName": "date", "format": "YYYY-MM-DD" }
}
```

The run is split into one request per calendar day; only `startName`/`startPath` is used, since the window's start and end are the same day.

### Range

```json
{
  "strategy": "range",
  "request": {
    "into": "query",
    "startName": "start_date",
    "endName": "end_date",
    "format": "YYYY-MM-DD"
  }
}
```

One request per configured date range; use `startName` + `endName` (query) or `startPath` + `endPath` (body).

`request.into` is `"query"` (adds `startName`/`endName` query parameters) or `"body"` (deep-sets `startPath`/`endPath`, arrays, into the request body). `request.format` uses **UPPERCASE** date-format tokens: `YYYY`, `MM`, `DD` (time components, if present, are always `00`); `X`/`x` mean unix epoch seconds/milliseconds. Omitted, or `YYYY-MM-DD`, means "pass the date through unchanged." Non-token characters pass through literally, so avoid formats containing a token's letters as ordinary text (for example, don't put `mm` inside a literal word).

Inside the node's own `request` (or `retriever.submit`), the current window is also available directly as `{{ dateWindow.start }}` / `{{ dateWindow.end }}` (both `YYYY-MM-DD` strings) — this is how [`transformations.add`](#transformations) stamps a `date` field onto records the API itself doesn't return dated.

## Partition router: substream and list

Optional, node-level; fans a single node out into one child request per "slice" value, exposed to the child request as `{{ stream_slice.<partitionField> }}`. **Mutually exclusive with an async retriever.** The node's own `request` / `recordSelector` / `pagination` describe the child (per-slice) request.

### Substream

Fetches a parent list first, extracts a key from each parent record, and runs the child request once per distinct key value:

```json
{
  "type": "substream",
  "parent": {
    "request": { "method": "GET", "path": "/accounts" },
    "recordPath": ["data"],
    "key": "id"
  },
  "partitionField": "account_id"
}
```

`parent.request` is a full request spec (optionally with its own `parent.pagination`, if the parent list itself is paginated). `parent.recordPath` extracts the parent rows the same way `recordSelector.recordPath` extracts rows. `parent.key` is a dot-string path into each parent record naming the value to fan out on. `partitionField` names the key under `stream_slice` that the child request can reference, e.g. `{{ stream_slice.account_id }}`.

### List

Fans out over a static or parameter-supplied list of values instead of a parent fetch — no `parent` is allowed:

```json
{ "type": "list", "values": ["US", "EU", "APAC"], "partitionField": "region" }
```

```json
{ "type": "list", "valuesFromParameter": "RegionList", "partitionField": "region" }
```

Exactly one of `values` (a non-empty array of strings) or `valuesFromParameter` (a parameter holding a comma-separated string) must be present.

## Multi-account fan-out

Optional, top-level (`accounts`); runs every node once per account ID instead of once per connector run:

```json
{
  "from": "{{ parameters.AdAccountId }}",
  "parse": { "split": "[,;]", "trim": true }
}
```

- `from` — a template string (typically `{{ parameters.X }}`) resolving to one account id, or several separated by the `parse.split` pattern.
- `parse.split` — optional regex string used to split `from` into multiple ids (default splits on `,` or `;`).
- `parse.trim` — optional boolean (default `true`); trims whitespace off each id.
- `parse.strip` / `parse.prefix` — optional: `strip` removes any of the given characters from each id; `prefix` prepends a fixed string to each id.

Each resolved id becomes `{{ account.id }}` inside that account's requests, and node fetching runs once per id. If `accounts` is omitted, the node runs exactly once with no `account.id` scope.

Account-level error handling is currently **fail-fast and not manifest-configurable**: if any node fails for any account, the entire run aborts — no later account or node is attempted, and the incremental cursor is not advanced past the partially-failed window. There is no per-account "skip and continue" policy an author can set today.

## Asynchronous retriever

For APIs that generate a report asynchronously: submit a job, poll until it's ready, then download the result. An async node replaces the node-level `request` + `recordSelector` entirely with `retriever: { type: "async", submit, poll, download }`:

```json
{
  "type": "async",
  "submit": {
    "method": "POST",
    "path": "/reports",
    "body": { "ad_account_id": "{{ account.id }}" },
    "jobIdPath": ["id"]
  },
  "poll": {
    "method": "GET",
    "path": "/reports/{{ job.id }}/status",
    "statusPath": ["status"],
    "readyValue": "READY",
    "failedValue": "FAILED",
    "resultUrlPath": ["location_json"],
    "backoff": { "maxAttempts": 180, "initialMs": 3000, "maxMs": 15000 }
  },
  "download": { "recordPath": ["rows"] }
}
```

- `submit` — a request spec plus `jobIdPath` (array), locating the newly created job's id in the submit response.
- `poll` — a request spec (its `path`/templates may reference `{{ job.id }}`) plus `statusPath` (array), `readyValue`, optional `failedValue`, and `resultUrlPath` (array) locating a download URL once the job succeeds. `poll.backoff` bounds the polling loop: `maxAttempts` (default 180), `initialMs` (default 3000), `maxMs` (default 15000) — the delay doubles each attempt up to `maxMs`. A response matching `failedValue` throws immediately; exhausting `maxAttempts` without reaching `readyValue` also throws.
- `download.recordPath` — array; the downloaded JSON is extracted the same way `recordSelector.recordPath` extracts rows.

This `poll.backoff` is a completely separate mechanism from a node's [`errorHandler.backoff`](#error-handling) — the former paces the async job-status loop, the latter paces HTTP-error retries.

## Transformations

Optional, node-level array, applied in order, **after** `recordFilter` and **before** field projection/casting:

```json
[
  { "type": "add", "field": "date", "value": "{{ dateWindow.start }}" },
  { "type": "remove", "field": "internal_debug_id" },
  { "type": "keysToLower" },
  { "type": "flatten", "separator": "_" }
]
```

- **`add`** — `{ field, value }`; sets a top-level field to a templated value. Templating here is uniquely lenient — an unresolved path renders as an empty string instead of throwing — and, uniquely, also exposes the record itself: `{{ parameters.X }}`, `{{ dateWindow.start }}` / `{{ dateWindow.end }}`, `{{ account.id }}`, and `{{ record.<field> }}` (a field already present on this same record) are all available.
- **`remove`** — `{ field }`; deletes a top-level field.
- **`keysToLower`** — no options; lowercases every top-level key (last one wins on a collision).
- **`flatten`** — `{ separator? }` (default `"_"`); recursively flattens nested objects into separator-joined top-level keys (e.g. `{"stats":{"clicks":5}}` → `{"stats_clicks":5}`); arrays are left intact, not flattened.

## Record filter

Optional, node-level; keeps or drops each raw record **before** transformations run. `path` is an array (see [Common naming mistakes](#common-naming-mistakes)) evaluated against the raw record. Only one `recordFilter` per node — it's a single object, not an array.

```json
{ "path": ["status"], "operator": "equals", "value": "ACTIVE" }
```

```json
{ "path": ["deleted_at"], "operator": "isNull" }
```

```json
{ "path": ["region"], "operator": "inList", "value": "US,EU,APAC" }
```

| Operator | Behavior |
|---|---|
| `equals` / `notEquals` | String-compares the value at `path` (coerced with `String(...)`) against `value`. |
| `contains` | Substring match: `String(value_at_path).includes(value)`. |
| `isNull` / `isNotNull` | No `value` needed; true when the path resolves to `null`/`undefined` (or not, respectively). |
| `inList` | True when the value at `path` is one of a resolved list, supplied either as a literal comma-string `value` or a parameter name via `valuesFromParameter` (also comma-split). Exactly one of the two must be present. |

## Error handling

Optional, node-level, and applies to **sync nodes only** — an async node paces itself through `poll.backoff` instead. `errorHandler` matches an HTTP error response against an ordered list of filters; the first matching filter decides what happens:

```json
{
  "responseFilters": [
    {
      "httpCodes": [429],
      "action": "RETRY",
      "backoff": { "type": "waitTimeFromHeader", "header": "Retry-After" }
    },
    { "httpCodes": [404], "action": "IGNORE" },
    {
      "bodyMatch": { "path": ["error", "code"], "equals": "ACCOUNT_DISABLED" },
      "action": "FAIL"
    }
  ],
  "backoff": { "type": "exponential", "factor": 2, "baseMs": 1000 }
}
```

Each filter needs at least one of `httpCodes` (number array), `messageContains` (string, matched against the raw error message/body text), or `bodyMatch` (`{ path: [...], equals?: <string>, contains?: <string> }`, matched against the parsed JSON body) — plus a required `action`:

| Action | Effect |
|---|---|
| `RETRY` | Retry the request, delayed by this filter's `backoff` (or the handler's top-level `backoff` if the filter has none). |
| `IGNORE` | Treat the failed request as if it returned zero records; the node continues without failing the run. |
| `FAIL` | Do not retry; the error propagates and fails the run (same outcome as an error matching no filter at all). |

`backoff.type` is one of:

| Type | Fields |
|---|---|
| `constant` | Requires a numeric `delayMs`. |
| `exponential` | Optional `factor` (default 2) and `baseMs` (default is the retry loop's own initial delay); delay = `baseMs * factor^attempt`. |
| `waitTimeFromHeader` | Optional `header` (default `"Retry-After"`); reads either a number of seconds or an HTTP date from that header. |
| `waitUntilTimeFromHeader` | Requires `header` (an epoch-seconds value); optional `regex` to extract the number out of a larger header string, optional `minMs` floor on the computed delay. |

A `backoff` may also be set directly on `errorHandler` (no `responseFilters` match required) as the node's default retry pacing.

## Rate limiting

Optional, top-level (`rateLimit`); a simple global cap shared by every request the connector makes:

```json
{ "requests": 60, "perSeconds": 60 }
```

`requests` is a positive integer; `perSeconds` is a positive number. The example above means "no more than 60 requests per 60 seconds."

## Templating scopes

Every string field that accepts a template uses `{{ scope.path }}` syntax (double curly braces; conventionally one space on each side).

| Scope | Available |
|---|---|
| `{{ parameters.X }}` | Any declared parameter's resolved value. |
| `{{ account.id }}` | The current account id, when `accounts` or a partition router's account-style fan-out is in play. |
| `{{ auth.token }}` | The token issued by `tokenExchange`/`oauth2` — only meaningful inside that same authenticator's `inject.format`. |
| `{{ dateWindow.start }}` / `{{ dateWindow.end }}` | The current incremental run's date window (`YYYY-MM-DD` strings). |
| `{{ stream_slice.<partitionField> }}` | The current partition value inside a partition-router child request. |
| `{{ job.id }}` | The async job id, inside `retriever.async.poll`. |

An unresolved path normally throws and fails the run — except inside `transformations.add.value`, which resolves leniently and renders an unresolved path as an empty string instead.

## Authoring workflow

1. Read this reference (or, if you're an AI assistant with MCP access, call the `connector_manifest_schema` tool) before writing or editing a manifest.
2. Research the target API and author the manifest: pick the authentication type, define one node per data stream you need, and add pagination, incremental extraction, filters, transformations, or error handling only where the API actually needs them.
3. Dry-run one node with `connector_test`, passing **non-secret configuration values only** — date ranges, IDs, filters, and similar. Never put API keys, tokens, or any credential in that configuration; `connector_test` is not where credentials are entered.
4. If the test fails, read the returned error and make the smallest change that fixes it — correct a typo in an existing `baseUrl`/`path`/`queryParameters`/field name rather than rewriting working parts, renaming nodes, or switching to a different API — then re-run `connector_test`.
5. Once it passes, call `connector_publish` to persist the manifest.

Real credentials are connected separately, afterward: the person setting up the connector signs in or enters their API key/token through the connector's configuration form in the browser. Credentials are never typed into a manifest, into `connector_test`, or into an AI assistant.

## Worked examples

### 1. Simple GET, no auth (RatesDeclarative)

A minimal connector with no `authentication` block at all, one node, and an empty `recordPath` because the response body itself is the record:

```json
{
  "version": "1.0",
  "name": "RatesDeclarative",
  "title": "Frankfurter FX (Declarative)",
  "baseUrl": "https://api.frankfurter.dev",
  "parameters": {
    "Base": { "requiredType": "string", "isRequired": true, "default": "EUR", "label": "Base Currency" }
  },
  "nodes": {
    "latest": {
      "overview": "Latest exchange rates snapshot",
      "destinationName": "frankfurter_latest",
      "isTimeSeries": false,
      "uniqueKeys": ["date", "base"],
      "defaultFields": ["date", "base"],
      "request": { "method": "GET", "path": "/v1/latest", "queryParameters": { "base": "{{ parameters.Base }}" } },
      "recordSelector": { "recordPath": [] },
      "fields": {
        "date": { "apiName": "date", "type": "date" },
        "base": { "apiName": "base", "type": "string" }
      }
    }
  }
}
```

### 2. `tokenExchange` auth + async retriever + accounts (Moloco)

Combines a token exchange, a `range` incremental strategy writing into the request body, an async submit/poll/download retriever, and account fan-out:

```json
{
  "version": "1.0",
  "name": "MolocoCloud",
  "baseUrl": "https://api.moloco.cloud",
  "parameters": {
    "ApiKey": { "requiredType": "string", "isRequired": true },
    "AdAccountId": { "requiredType": "string", "isRequired": true }
  },
  "authentication": {
    "type": "tokenExchange",
    "exchange": {
      "method": "POST",
      "url": "https://api.moloco.cloud/cm/v1/auth/tokens",
      "body": { "api_key": "{{ parameters.ApiKey }}" },
      "tokenPath": ["token"],
      "ttlSeconds": 57600
    },
    "inject": { "into": "header", "name": "Authorization", "format": "Bearer {{ auth.token }}" }
  },
  "nodes": {
    "performance_report": {
      "destinationName": "moloco_performance_report",
      "isTimeSeries": true,
      "uniqueKeys": ["date", "campaign"],
      "fields": {
        "date": { "apiName": "date", "type": "date" },
        "campaign": { "apiName": "campaign", "type": "string" },
        "spend": { "apiName": "metric.spend", "type": "number" }
      },
      "incremental": {
        "strategy": "range",
        "request": {
          "into": "body",
          "startPath": ["date_range", "start"],
          "endPath": ["date_range", "end"],
          "format": "YYYY-MM-DD"
        }
      },
      "retriever": {
        "type": "async",
        "submit": {
          "method": "POST",
          "path": "/cm/v1/reports",
          "body": { "ad_account_id": "{{ account.id }}", "dimensions": ["DATE", "CAMPAIGN"] },
          "jobIdPath": ["id"]
        },
        "poll": {
          "method": "GET",
          "path": "/cm/v1/reports/{{ job.id }}/status",
          "statusPath": ["status"],
          "readyValue": "READY",
          "failedValue": "FAILED",
          "resultUrlPath": ["location_json"],
          "backoff": { "maxAttempts": 180, "initialMs": 3000, "maxMs": 15000 }
        },
        "download": { "recordPath": ["rows"] }
      }
    }
  },
  "accounts": { "from": "{{ parameters.AdAccountId }}", "parse": { "split": "[,;]", "trim": true } }
}
```

### 3. `oauth2` refresh_token grant (minimal, illustrative)

A minimal manifest built directly from the `oauth2` shape above — swap `baseUrl`/`tokenUrl`/paths for the real target API's:

```json
{
  "version": "1.0",
  "name": "ExampleOAuth2Api",
  "title": "Example OAuth2 API",
  "baseUrl": "https://api.example.com",
  "parameters": {
    "ClientId": { "requiredType": "string", "isRequired": true, "label": "Client ID", "attributes": ["SECRET"] },
    "ClientSecret": { "requiredType": "string", "isRequired": true, "label": "Client Secret", "attributes": ["SECRET"] },
    "RefreshToken": { "requiredType": "string", "isRequired": true, "label": "Refresh Token", "attributes": ["SECRET"] }
  },
  "authentication": {
    "type": "oauth2",
    "tokenUrl": "https://oauth2.googleapis.com/token",
    "grantType": "refresh_token",
    "clientId": "{{ parameters.ClientId }}",
    "clientSecret": "{{ parameters.ClientSecret }}",
    "refreshToken": "{{ parameters.RefreshToken }}",
    "scope": "https://www.googleapis.com/auth/spreadsheets.readonly",
    "ttlSeconds": 300,
    "inject": { "into": "header", "name": "Authorization", "format": "Bearer {{ auth.token }}" }
  },
  "nodes": {
    "items": {
      "overview": "Items visible to the authenticated account.",
      "uniqueKeys": ["id"],
      "request": { "method": "GET", "path": "/v1/items", "queryParameters": { "pageSize": "100" } },
      "recordSelector": { "recordPath": ["items"] },
      "pagination": { "type": "cursor", "cursorParam": "pageToken", "cursor": { "from": "body", "path": ["nextPageToken"] } },
      "fields": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "updatedAt": { "type": "datetime", "dataPath": "updated_at" }
      }
    }
  }
}
```

### 4. `apiKey` header + day-by-day incremental + offset pagination + nested `dataPath` + `transformations.add` (Cốc Cốc Ads)

A larger, realistic manifest: a header-injected API key, three sibling nodes, `day-by-day` incremental extraction, offset pagination, metrics nested under `stats.*`, and a `transformations.add` step that stamps the window's date onto every record:

```json
{
  "title": "Cốc Cốc Ads (Declarative, v2)",
  "name": "CocCocAds",
  "version": "1.0",
  "docUrl": "https://api.qc.coccoc.com/docs/v2/",
  "baseUrl": "https://api.qc.coccoc.com",

  "authentication": {
    "type": "apiKey",
    "inject": { "into": "header", "name": "Api-Key", "format": "{{ parameters.ApiKey }}" }
  },

  "rateLimit": { "requests": 500, "perSeconds": 3600 },

  "parameters": {
    "ApiKey": { "requiredType": "string", "isRequired": true, "label": "API Key", "attributes": ["SECRET"] },
    "CampaignIds": { "requiredType": "string", "isRequired": false, "label": "Campaign IDs filter (comma-separated), e.g. 123,456" }
  },

  "nodes": {

    "account": {
      "overview": "Account snapshot: balance and budget limit (VND).",
      "uniqueKeys": ["id"],
      "request": { "method": "GET", "path": "/v2/users/info" },
      "recordSelector": { "recordPath": ["data"] },
      "fields": {
        "id": { "type": "integer" },
        "balance": { "type": "number" },
        "budget_limit": { "type": "number" }
      }
    },

    "campaigns": {
      "overview": "Daily campaign performance + cost. cost = stats.spending (VND).",
      "uniqueKeys": ["date", "id"],
      "incremental": { "strategy": "day-by-day", "request": { "into": "query", "startName": "start", "endName": "end", "format": "YYYY-MM-DD" } },
      "request": { "method": "GET", "path": "/v2/campaigns", "queryParameters": { "limit": "50" } },
      "recordSelector": { "recordPath": ["data"] },
      "pagination": { "type": "offset", "pageSize": 50, "inject": { "into": "query", "name": "offset" } },
      "transformations": [ { "type": "add", "field": "date", "value": "{{ dateWindow.start }}" } ],
      "fields": {
        "date": { "type": "date" },
        "id": { "type": "integer" },
        "name": { "type": "string" },
        "status": { "type": "string" },
        "shows": { "type": "integer", "dataPath": "stats.shows" },
        "clicks": { "type": "integer", "dataPath": "stats.clicks" },
        "spending": { "type": "number", "dataPath": "stats.spending" },
        "ctr": { "type": "number", "dataPath": "stats.ctr" },
        "cpc": { "type": "number", "dataPath": "stats.cpc" },
        "cpm": { "type": "number", "dataPath": "stats.cpm" }
      }
    },

    "ads": {
      "overview": "Daily ad performance + cost.",
      "uniqueKeys": ["date", "id"],
      "incremental": { "strategy": "day-by-day", "request": { "into": "query", "startName": "start", "endName": "end", "format": "YYYY-MM-DD" } },
      "request": { "method": "GET", "path": "/v2/ads", "queryParameters": { "limit": "50", "campaign_id": "{{ parameters.CampaignIds }}" } },
      "recordSelector": { "recordPath": ["data"] },
      "pagination": { "type": "offset", "pageSize": 50, "inject": { "into": "query", "name": "offset" } },
      "transformations": [ { "type": "add", "field": "date", "value": "{{ dateWindow.start }}" } ],
      "fields": {
        "date": { "type": "date" },
        "id": { "type": "integer" },
        "status": { "type": "string" },
        "campaign_id": { "type": "integer" },
        "title": { "type": "string" },
        "shows": { "type": "integer", "dataPath": "stats.shows" },
        "clicks": { "type": "integer", "dataPath": "stats.clicks" },
        "spending": { "type": "number", "dataPath": "stats.spending" }
      }
    }
  }
}
```

*(Shortened for readability: this shows 3 of the connector's 4 nodes — the `ad_groups` node follows the same pattern — and a subset of each node's fields. For the complete, byte-for-byte manifest, see [`manifest-reference.llms.txt`](https://github.com/OWOX/owox-data-marts/blob/main/docs/connectors/manifest-reference.llms.txt) or the `connector_manifest_schema` MCP tool.)*

### 5. `partitionRouter: substream`, expanded into a full node

Expands the `substream` shape into one complete node: fetch the list of ad accounts first, then fetch each account's campaigns, with the parent id available to the child request as `{{ stream_slice.account_id }}`:

```json
{
  "version": "1.0",
  "name": "ExampleSubstreamApi",
  "baseUrl": "https://api.example.com",
  "parameters": {
    "ApiKey": { "requiredType": "string", "isRequired": true, "label": "API Key", "attributes": ["SECRET"] }
  },
  "authentication": {
    "type": "apiKey",
    "inject": { "into": "header", "name": "Authorization", "format": "Bearer {{ parameters.ApiKey }}" }
  },
  "nodes": {
    "campaigns_by_account": {
      "overview": "Campaigns for every ad account visible to this API key.",
      "uniqueKeys": ["account_id", "id"],
      "partitionRouter": {
        "type": "substream",
        "parent": {
          "request": { "method": "GET", "path": "/accounts" },
          "recordPath": ["data"],
          "key": "id"
        },
        "partitionField": "account_id"
      },
      "request": {
        "method": "GET",
        "path": "/accounts/{{ stream_slice.account_id }}/campaigns",
        "queryParameters": { "limit": "100" }
      },
      "recordSelector": { "recordPath": ["data"] },
      "pagination": { "type": "offset", "offsetParam": "offset", "pageSize": 100 },
      "fields": {
        "id": { "type": "string" },
        "account_id": { "type": "string", "dataPath": "account.id" },
        "name": { "type": "string" },
        "status": { "type": "string" }
      }
    }
  }
}
```

---

> **Authoring with an AI?** Paste [`manifest-reference.llms.txt`](https://github.com/OWOX/owox-data-marts/blob/main/docs/connectors/manifest-reference.llms.txt)
> into your assistant, or have an MCP client call the `connector_manifest_schema` tool —
> both return the same machine-optimized reference.
