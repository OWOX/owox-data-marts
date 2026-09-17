/**
 * Canonical, AI-facing reference for authoring OWOX declarative connector
 * manifests. Served verbatim by the connector_manifest_schema MCP tool and mirrored
 * to docs/connectors/manifest-reference.llms.txt (pinned by
 * manifest-reference-docs.spec.ts). Every ManifestParser enum value must be
 * represented here (pinned by manifest-schema.reference.spec.ts). Bump
 * MANIFEST_SCHEMA_VERSION whenever the reference text changes.
 */
export const MANIFEST_SCHEMA_VERSION = '2026-08-29';

export const MANIFEST_SCHEMA_REFERENCE = `# OWOX Declarative Connector — Manifest Authoring Reference

## 1. Role, task, and output contract

You are authoring an OWOX no-code **declarative connector manifest** (a single JSON object) that pulls data from a third-party HTTP API into OWOX Data Marts. Below is the **complete grammar** the engine (\`ManifestParser\` + \`DeclarativeSource\`) accepts — every key, every enum value, every gotcha. Paste the target API's documentation (or a description of it) after this text and author ONE manifest against it.

Output contract: produce exactly ONE JSON object — the manifest itself. No prose, no Markdown code fences, nothing before or after it, unless the tool or conversation you are operating in explicitly asks for a different envelope (e.g. a \`{ "message": ..., "manifest": ... }\` wrapper). Never invent secret values (API keys, client secrets, tokens) — leave the corresponding \`parameters\` entries for a human to fill in.

Lifecycle reminder: this reference is normally fetched first (\`connector_manifest_schema\`), then you author or edit the manifest, then you dry-run it with \`connector_test\` using non-secret configuration only (e.g. date ranges, IDs, filters — never API keys or tokens), fix anything the test reports, and finally persist it (\`connector_publish\`). Secure credentials are entered by the user via the browser, not through the assistant. See §20 for the full workflow.

## 2. Top-level manifest keys

Required:

- \`version\` — always the string \`"1.0"\`.
- \`name\` — a short PascalCase identifier, e.g. \`"MolocoCloud"\`.
- \`baseUrl\` — the API origin, e.g. \`"https://api.example.com"\` (no trailing path).
- \`parameters\` — an object of user-supplied inputs (may be \`{}\` if the connector needs none). See §4.
- \`nodes\` — an object keyed by node name; each value is one data stream. See §6.

Optional:

- \`title\` — a human-friendly display name, e.g. \`"Frankfurter FX (Declarative)"\`.
- \`description\` — a longer description shown in the UI.
- \`docUrl\` — a link to the API's own documentation.
- \`authentication\` — how requests are authenticated. See §5.
- \`accounts\` — fan a single run out across multiple account IDs. See §11.
- \`rateLimit\` — a global request-rate cap. See §16.

## 3. Name-mapping gotchas

These four are the most common rejection causes — the parser is strict and does not accept near-miss names:

- The auth block is \`authentication\`, **not** \`auth\`.
- A request's query string is \`queryParameters\`, **not** \`queryParams\`.
- A record's row-selector is \`recordSelector.recordPath\` (an **array** of keys), **not** \`fieldPath\`.
- \`fields\` is an **object keyed by field name**, **not** an array.

A related, easy-to-miss fifth gotcha (see §7): a **field's** \`dataPath\`/\`apiName\` is a single **dot-string** (\`"stats.spending"\`), but almost every other "path" in the grammar (\`recordSelector.recordPath\`, \`recordFilter.path\`, \`errorHandler\` \`bodyMatch.path\`, pagination \`cursor.path\`/\`stopCondition.path\`, async \`jobIdPath\`/\`statusPath\`/\`resultUrlPath\`/\`download.recordPath\`, \`partitionRouter.parent.recordPath\`) is an **array of key segments** (\`["stats", "spending"]\`). Mixing the two up is a common, silent bug — the parser refuses a dot-string in any of those array positions, so it fails at publish rather than silently at run time.

## 4. \`parameters\`

Each entry describes one user-supplied input, referenced elsewhere via \`{{ parameters.Name }}\`:

\`\`\`json
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
\`\`\`

- \`requiredType\` — one of \`string\` | \`number\` | \`boolean\` | \`date\`.
- \`isRequired\` — boolean; **this**, not an attribute, is what makes a parameter mandatory.
- \`default\` — optional default value used when the user leaves it blank.
- \`label\` — optional display label shown in the configuration form.
- \`description\` — optional help text shown next to the field.
- \`attributes\` — an optional array of flags. The one every author should know is \`SECRET\` (masks the value and stores it encrypted — always set this for API keys, client secrets, tokens, passwords). A few advanced/internal flags also exist (\`HIDE_IN_CONFIG_FORM\`, \`ADVANCED\`, \`OAUTH_FLOW\`, \`DEPRECATED\`, \`PINNED\`, \`MANUAL_BACKFILL\`) but are rarely needed when hand-authoring a manifest.

## 5. \`authentication\` — all 6 types

If the API needs no authentication, omit \`authentication\` entirely. Otherwise \`authentication.type\` must be one of \`apiKey\`, \`bearer\`, \`basic\`, \`tokenExchange\`, \`oauth2\`, \`selective\`.

### apiKey

Injects a templated value into a header or query parameter:

\`\`\`json
{
  "type": "apiKey",
  "inject": { "into": "header", "name": "Api-Key", "format": "{{ parameters.ApiKey }}" }
}
\`\`\`

\`inject.into\` is \`"query"\` or \`"header"\`; \`inject.name\` is the parameter/header name; \`inject.format\` is a template string (often just \`{{ parameters.X }}\`, but can wrap it, e.g. \`"ApiKey {{ parameters.ApiKey }}"\`).

### bearer

Same injection mechanism, fixed to an \`Authorization: Bearer <token>\` header:

\`\`\`json
{
  "type": "bearer",
  "inject": { "into": "header", "name": "Authorization", "format": "Bearer {{ parameters.Token }}" }
}
\`\`\`

### basic

HTTP Basic auth — no \`inject\` block; the engine base64-encodes \`username:password\` itself:

\`\`\`json
{
  "type": "basic",
  "username": "{{ parameters.Username }}",
  "password": "{{ parameters.Password }}"
}
\`\`\`

### tokenExchange

Exchanges a credential for a server-issued token via one POST, then injects that token. Use this for APIs with a simple "trade my API key for a session token" step and a **fixed-length** token lifetime:

\`\`\`json
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
\`\`\`

\`exchange.tokenPath\` is an array locating the token in the JSON response. The token is cached for \`exchange.ttlSeconds\` and re-issued once it expires. Inject templates read it via \`{{ auth.token }}\`.

### oauth2

A standard OAuth2 token endpoint (\`refresh_token\` or \`client_credentials\` grant) — use this instead of \`tokenExchange\` for Google/Microsoft/Facebook/LinkedIn-class APIs, and whenever the provider returns an \`expires_in\` and may rotate the refresh token:

\`\`\`json
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
\`\`\`

Fields:

- \`tokenUrl\` — required.
- \`grantType\` — \`"refresh_token"\` (default) or \`"client_credentials"\`.
- \`clientId\` / \`clientSecret\` — required.
- \`refreshToken\` — required when \`grantType\` is \`"refresh_token"\`.
- \`scope\` — optional, space-separated OAuth scopes.
- \`ttlSeconds\` — optional fallback cache TTL, used only when the token response omits \`expires_in\`; defaults to 300s if also unset. When the response DOES include \`expires_in\`, that value (minus a 60s safety skew) drives the cache lifetime instead.
- \`inject\` — required, same shape as the other types; always reads \`{{ auth.token }}\`.

Behavior worth knowing: on \`refresh_token\` grant, if the provider rotates the refresh token (returns a new one in the response), the engine keeps using the new one for the rest of the run and reports it to the host so it is persisted for the next run — but that persistence only happens for a **stored credential** (a connector saved with credentials in the platform's credential store), not for values typed inline as plain parameters. A \`GeneratedRefreshToken\` parameter is auto-registered by the engine for every \`oauth2\` manifest; do not declare it yourself.

### selective

Picks one of several authentication branches at runtime based on a parameter's value — useful when the same connector supports multiple auth modes (e.g. "API Key" vs "OAuth"):

\`\`\`json
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
\`\`\`

\`selectionParameter\` names a manifest parameter whose runtime value picks the branch key (here, whatever \`{{ parameters.AuthMode }}\` resolves to must equal \`"apikey"\` or \`"oauth"\`). Each branch is itself \`apiKey\` | \`bearer\` | \`basic\` | \`tokenExchange\` | \`oauth2\` — **not** another \`selective\` (no nesting).

## 6. \`nodes\`

\`nodes\` is an object keyed by node name. Each node describes one data stream:

\`\`\`json
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
\`\`\`

- \`overview\` — optional one-line description (shown in the builder UI).
- \`uniqueKeys\` — array of field names forming the row's unique key (used for upsert/dedupe).
- \`destinationName\` — optional; the destination table name (defaults to the node name).
- \`isTimeSeries\` — boolean; marks the node as date-windowed. You rarely need to set it: declaring an \`incremental\` block with a strategy other than \`none\` (§9) already implies it. Set it explicitly only for a node that should take the date-window path without declaring one. It cannot be combined with \`isFullRefresh\`.
- \`defaultFields\` — optional array of field names pre-selected by default (defaults to all declared fields).
- \`request\` — \`{ method, path, queryParameters?, body? }\`. \`method\` is \`GET\` or \`POST\`. \`path\` is relative to \`baseUrl\` and **must start with \`/\`**.
- \`recordSelector.recordPath\` — array of keys locating the row(s) in the JSON response (see §18 for the exact extraction rule). \`recordSelector.responseFormat\` is optional — \`json\` (default), \`csv\`, or \`jsonl\`.
- \`fields\` — object keyed by field name (§7).

A node also optionally carries \`pagination\` (§8), \`incremental\` (§9), \`partitionRouter\` (§10), \`transformations\` (§13), \`recordFilter\` (§14), and \`errorHandler\` (§15) — all covered in their own sections below.

An **async** node (§12) replaces \`request\` + \`recordSelector\` with a \`retriever: { type: "async", submit, poll, download }\` block instead — it must not declare a plain \`request\`/\`recordSelector\` at the node level.

## 7. \`fields\`

\`fields\` is an object keyed by the OUTPUT field name; each value describes how to read it from a raw API record:

\`\`\`json
{
  "date": { "type": "date" },
  "id": { "type": "integer" },
  "spending": { "type": "number", "dataPath": "stats.spending" },
  "raw_json": { "type": "object", "description": "Full nested payload for debugging." }
}
\`\`\`

- \`type\` — one of 8 lowercase types: \`string\`, \`integer\`, \`number\`, \`boolean\`, \`date\`, \`datetime\`, \`object\`, \`array\`.
- \`dataPath\` (preferred) or \`apiName\` (legacy alias, same meaning) — a **dot-string** path into the raw record, e.g. \`"total_market_cap.usd"\` reaches a nested object. When the row itself is an array (e.g. \`[[timestamp, price], ...]\` selected via \`recordPath\`), use the positional index as the path: \`"0"\`, \`"1"\`. If both are omitted, the field name itself is used as the key (i.e. the API's field is assumed to already be named exactly that).
- \`description\` — optional help text.

Gotcha: casting only special-cases \`number\`/\`integer\`/\`boolean\`/\`date\`. \`datetime\`, \`object\`, \`array\`, and \`string\` all fall through to the same default branch, which \`JSON.stringify\`s object/array values instead of keeping them structured — so an \`array\`/\`object\`-typed field is written out as a JSON string, not a nested value.

Remember the dot-string-vs-array distinction from §3: \`dataPath\` is \`"a.b.c"\`, never \`["a","b","c"]\`.

## 8. \`pagination\` — 4 types (sync nodes only)

Optional, node-level. \`pagination.type\` is one of \`none\`, \`offset\`, \`page\`, \`cursor\`.

\`\`\`json
{ "type": "none" }
{ "type": "offset", "offsetParam": "offset", "pageSize": 100 }
{ "type": "page", "pageParam": "page", "startPage": 1 }
{
  "type": "cursor",
  "cursorParam": "cursor",
  "cursor": { "from": "body", "path": ["meta", "next_cursor"] }
}
\`\`\`

- \`offset\` — stops once a page returns fewer than \`pageSize\` records; each subsequent request adds \`pageSize\` to the running offset.
- \`page\` — stops once a page returns zero records; increments the page number by 1 each time, starting from \`startPage\` (default 1).
- \`cursor\` — reads the next cursor value either from the response body (\`cursor.from: "body"\`, \`cursor.path\`: array) or a response header (\`cursor.from: "header"\`, \`cursor.header\`: name, optional \`cursor.linkRel\` to parse a \`Link:\` header's \`rel="next"\` URL). Pagination stops once no cursor value is found.

All types accept an optional \`inject\` describing WHERE the next-page value is written on the following request:

\`\`\`json
"inject": { "into": "query", "name": "offset" }
"inject": { "into": "header", "name": "X-Page-Token" }
"inject": { "into": "body", "path": ["paging", "offset"] }
"inject": { "into": "path" }
\`\`\`

\`inject.into\` is one of \`query\` (default), \`header\`, \`body\` (needs \`inject.path\`, a deep-set array), or \`path\` (replaces the node's request path/URL outright with the value — used when the API returns a full next-page URL to follow verbatim).

An optional \`stopCondition\` halts pagination early regardless of type, when a response field matches a fixed value:

\`\`\`json
"stopCondition": { "path": ["meta", "has_more"], "equals": false }
\`\`\`

## 9. \`incremental\` — 3 strategies

Optional, node-level; drives date-windowed (time-series) extraction. \`incremental.strategy\` is one of \`none\`, \`day-by-day\`, \`range\`.

Declaring a strategy other than \`none\` makes the node a time series on its own — you do not also need \`isTimeSeries: true\`, and \`StartDate\`/\`EndDate\` backfill parameters are registered for you. \`strategy: "none"\` does not, since it states positively that the node has no window.

\`\`\`json
{ "strategy": "none" }
{
  "strategy": "day-by-day",
  "request": { "into": "query", "startName": "date", "format": "YYYY-MM-DD" }
}
{
  "strategy": "range",
  "request": {
    "into": "query",
    "startName": "start_date",
    "endName": "end_date",
    "format": "YYYY-MM-DD"
  }
}
\`\`\`

- \`day-by-day\` — the run is split into one request per calendar day; only \`startName\`/\`startPath\` is used (the window's start and end are the same day).
- \`range\` — one request per configured date range; use \`startName\`+\`endName\` (query) or \`startPath\`+\`endPath\` (body).
- \`request.into\` — \`"query"\` (adds \`startName\`/\`endName\` query parameters) or \`"body"\` (deep-sets \`startPath\`/\`endPath\`, arrays, into the request body).
- \`request.format\` — **UPPERCASE** date-format tokens: \`YYYY\`, \`MM\`, \`DD\` (time components, if present, are always \`00\`); \`X\`/\`x\` mean unix epoch seconds/milliseconds. Omitted or \`YYYY-MM-DD\` means "pass the date through unchanged". Non-token characters pass through literally, so avoid formats containing a token's letters as ordinary text (e.g. don't use \`mm\` inside a literal word).

Inside the node's own \`request\`/\`retriever.submit\`, the current window is also available directly as \`{{ dateWindow.start }}\` / \`{{ dateWindow.end }}\` (both \`YYYY-MM-DD\` strings) — this is how \`transformations.add\` (§13) stamps a \`date\` field onto records the API itself doesn't return dated.

## 10. \`partitionRouter\` — substream & list

Optional, node-level; fans a single node out into one child request per "slice" value, exposed to the child request as \`{{ stream_slice.<partitionField> }}\`. **Mutually exclusive with \`retriever: { type: "async" }\`.** The node's own \`request\` / \`recordSelector\` / \`pagination\` describe the CHILD (per-slice) request.

### substream

Fetches a parent list first, extracts a key from each parent record, and runs the child request once per distinct key value:

\`\`\`json
{
  "type": "substream",
  "parent": {
    "request": { "method": "GET", "path": "/accounts" },
    "recordPath": ["data"],
    "key": "id"
  },
  "partitionField": "account_id"
}
\`\`\`

\`parent.request\` is a full request spec (optionally with its own \`parent.pagination\`, if the parent list itself is paginated). \`parent.recordPath\` extracts the parent rows the same way \`recordSelector.recordPath\` does. \`parent.key\` is a dot-string path into each parent record naming the value to fan out on. \`partitionField\` names the key under \`stream_slice\` that the child request can reference: \`{{ stream_slice.account_id }}\`.

### list

Fans out over a static or parameter-supplied list of values instead of a parent fetch — no \`parent\` allowed:

\`\`\`json
{ "type": "list", "values": ["US", "EU", "APAC"], "partitionField": "region" }
{ "type": "list", "valuesFromParameter": "RegionList", "partitionField": "region" }
\`\`\`

Exactly one of \`values\` (a non-empty array of strings) or \`valuesFromParameter\` (a parameter holding a comma-separated string) must be present.

## 11. \`accounts\` — multi-account fan-out

Optional, top-level; runs every node once per account ID instead of once per connector run:

\`\`\`json
{
  "from": "{{ parameters.AdAccountId }}",
  "parse": { "split": "[,;]", "trim": true }
}
\`\`\`

- \`from\` — a template string (typically \`{{ parameters.X }}\`) resolving to one account id, or several separated by the \`parse.split\` pattern.
- \`parse.split\` — optional regex string used to split \`from\` into multiple ids (default splits on \`,\` or \`;\`).
- \`parse.trim\` — optional boolean (default \`true\`); trims whitespace off each id.
- \`parse.strip\` / \`parse.prefix\` — optional: \`strip\` removes any of the given characters from each id; \`prefix\` prepends a fixed string to each id.

Each resolved id becomes \`{{ account.id }}\` inside that account's requests, and node fetching runs once per id. If \`accounts\` is omitted, the node runs exactly once with no \`account.id\` scope.

Account-level error handling is currently **fail-fast and not manifest-configurable**: if any node fails for any account, the entire run aborts (no later account or node is attempted, and the incremental cursor is not advanced past the partially-failed window). There is no per-account "skip and continue" policy an author can set in the manifest today.

## 12. \`retriever: async\` — submit / poll / download

For APIs that generate a report asynchronously: submit a job, poll until it is ready, then download the result. An async node replaces the node-level \`request\` + \`recordSelector\` entirely:

\`\`\`json
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
\`\`\`

- \`submit\` — a request spec plus \`jobIdPath\` (array), locating the newly created job's id in the submit response.
- \`poll\` — a request spec (its \`path\`/templates may reference \`{{ job.id }}\`) plus \`statusPath\` (array), \`readyValue\`, optional \`failedValue\`, and \`resultUrlPath\` (array) locating a download URL once the job succeeds. \`poll.backoff\` bounds the polling loop: \`maxAttempts\` (default 180), \`initialMs\` (default 3000), \`maxMs\` (default 15000) — delay doubles each attempt up to \`maxMs\`. A response matching \`failedValue\` throws immediately; exhausting \`maxAttempts\` without reaching \`readyValue\` also throws.
- \`download.recordPath\` — array; the downloaded JSON is extracted the same way \`recordSelector.recordPath\` extracts rows (§18).

Note: this poll \`backoff\` is a completely separate mechanism from a node's \`errorHandler.backoff\` (§15) — the former paces the async job-status loop, the latter paces HTTP-error retries. An async node must not carry an \`errorHandler\` at all: the engine wires that for sync retrievers only, so the parser refuses the pairing at publish.

## 13. \`transformations\` — 4 types

Optional, node-level array, applied in order, AFTER \`recordFilter\` and BEFORE field projection/casting:

\`\`\`json
[
  { "type": "add", "field": "date", "value": "{{ dateWindow.start }}" },
  { "type": "remove", "field": "internal_debug_id" },
  { "type": "keysToLower" },
  { "type": "flatten", "separator": "_" }
]
\`\`\`

- \`add\` — \`{ field, value }\`; sets a top-level field to a templated value. Templating here is **lenient** (an unresolved path renders as an empty string instead of throwing) and, uniquely, also exposes the record itself: \`{{ parameters.X }}\`, \`{{ dateWindow.start }}\` / \`{{ dateWindow.end }}\`, \`{{ account.id }}\`, and \`{{ record.<field> }}\` (a field already present on this same record) are all available.
- \`remove\` — \`{ field }\`; deletes a top-level field.
- \`keysToLower\` — no options; lowercases every top-level key (last one wins on a collision).
- \`flatten\` — \`{ separator? }\` (default \`"_"\`); recursively flattens nested objects into separator-joined top-level keys (e.g. \`{"stats":{"clicks":5}}\` → \`{"stats_clicks":5}\`); arrays are left intact, not flattened.

## 14. \`recordFilter\` — 6 operators

Optional, node-level; keeps or drops each raw record BEFORE transformations run. \`path\` is an array (see §3's gotcha) evaluated against the raw record.

\`\`\`json
{ "path": ["status"], "operator": "equals", "value": "ACTIVE" }
{ "path": ["status"], "operator": "notEquals", "value": "DELETED" }
{ "path": ["name"], "operator": "contains", "value": "test" }
{ "path": ["deleted_at"], "operator": "isNull" }
{ "path": ["deleted_at"], "operator": "isNotNull" }
{ "path": ["region"], "operator": "inList", "value": "US,EU,APAC" }
{ "path": ["region"], "operator": "inList", "valuesFromParameter": "AllowedRegions" }
\`\`\`

- \`equals\` / \`notEquals\` — string-compares the value at \`path\` (coerced with \`String(...)\`) against \`value\`.
- \`contains\` — substring match (\`String(value_at_path).includes(value)\`).
- \`isNull\` / \`isNotNull\` — no \`value\` needed; true when the path resolves to \`null\`/\`undefined\` (or not, respectively).
- \`inList\` — true when the value at \`path\` is one of a resolved list, supplied either as a literal comma-string \`value\` or a parameter name via \`valuesFromParameter\` (also comma-split). Exactly one of the two must be present.

Only ONE \`recordFilter\` per node (it is a single object, not an array).

## 15. \`errorHandler\` — actions × backoff

Optional, node-level, and applies to **sync nodes only** — an \`errorHandler\` on an async node is refused at publish, because an async node paces itself through \`poll.backoff\` (§12) instead. Matches an HTTP error response against an ordered list of filters; the first matching filter decides what happens:

\`\`\`json
{
  "responseFilters": [
    {
      "httpCodes": [429],
      "action": "RETRY",
      "backoff": { "type": "waitTimeFromHeader", "header": "Retry-After" }
    },
    {
      "httpCodes": [404],
      "action": "IGNORE"
    },
    {
      "bodyMatch": { "path": ["error", "code"], "equals": "ACCOUNT_DISABLED" },
      "action": "FAIL"
    }
  ],
  "backoff": { "type": "exponential", "factor": 2, "baseMs": 1000 }
}
\`\`\`

Each filter needs at least one of \`httpCodes\` (number array), \`messageContains\` (string, matched against the raw error message/body text), or \`bodyMatch\` (\`{ path: [...], equals?: <string>, contains?: <string> }\`, matched against the parsed JSON body) — plus a required \`action\`. \`action\` is one of \`RETRY\`, \`IGNORE\`, \`FAIL\`:

- \`RETRY\` — retry the request, delayed by this filter's \`backoff\` (or the handler's top-level \`backoff\` if the filter has none).
- \`IGNORE\` — treat the failed request as if it returned zero records; the node continues (does not fail the run).
- \`FAIL\` — do not retry; the error propagates and fails the run (same outcome as an error matching no filter at all).

\`backoff.type\` is one of \`constant\`, \`exponential\`, \`waitTimeFromHeader\`, \`waitUntilTimeFromHeader\`:

- \`constant\` — requires a numeric \`delayMs\`.
- \`exponential\` — optional \`factor\` (default 2) and \`baseMs\` (default is the retry loop's own initial delay); delay = \`baseMs * factor^attempt\`.
- \`waitTimeFromHeader\` — optional \`header\` (default \`"Retry-After"\`); reads either a number of seconds or an HTTP date from that header.
- \`waitUntilTimeFromHeader\` — requires \`header\` (an epoch-seconds value); optional \`regex\` to extract the number out of a larger header string, optional \`minMs\` floor on the computed delay.

A \`backoff\` may also be set directly on \`errorHandler\` (no \`responseFilters\` match required) as the node's default retry pacing.

## 16. \`rateLimit\`

Optional, top-level; a simple global cap shared by every request the connector makes:

\`\`\`json
{ "requests": 60, "perSeconds": 60 }
\`\`\`

\`requests\` — positive integer; \`perSeconds\` — positive number. The example above means "no more than 60 requests per 60 seconds".

## 17. Templating scopes

Every string field that accepts a template uses \`{{ scope.path }}\` syntax (double curly braces; no spaces required but conventionally one space on each side). The scopes an author can reference:

- \`{{ parameters.X }}\` — any declared parameter's resolved value.
- \`{{ account.id }}\` — the current account id, when \`accounts\` (§11) or \`partitionRouter\` account-style fan-out is in play.
- \`{{ auth.token }}\` — the token issued by \`tokenExchange\`/\`oauth2\` (only meaningful inside that same authenticator's \`inject.format\`).
- \`{{ dateWindow.start }}\` / \`{{ dateWindow.end }}\` — the current incremental run's date window (\`YYYY-MM-DD\` strings).
- \`{{ stream_slice.<partitionField> }}\` — the current partition value inside a \`partitionRouter\` child request (§10).
- \`{{ job.id }}\` — the async job id, inside \`retriever.async.poll\` (§12).

An unresolved path normally throws (fails the run) — except inside \`transformations.add.value\` (§13), which resolves leniently and renders an unresolved path as an empty string instead.

## 18. Engine record-mapping rules & limitations

The per-node pipeline, in order: **fetch (+ pagination) → \`recordFilter\` → \`transformations\` → field projection/casting (\`fields\`)**.

- \`recordSelector.recordPath\` (or an async node's \`download.recordPath\`) selects the JSON node holding the row(s), walking the response by array index. The engine turns that node into rows in only two ways: an **ARRAY** → one row per element; a single **OBJECT** → exactly one row. It **cannot** turn an object's KEYS into rows, and there is no "current key" field available to a mapping. So never build a node around an endpoint that returns an object keyed by entity id (e.g. \`{ "bitcoin": {...}, "ethereum": {...} }\`) — there is no way to get one row per key. Prefer an endpoint that returns an array, or fetch one entity per run via a parameter/partition value instead.
- A field's value is read via \`dataPath\` (preferred) or \`apiName\` — a dot-string path (\`"a.b.c"\`) into the (post-filter, post-transformation) record. When the row itself is an array, use the positional index as the path (\`"0"\`, \`"1"\`). Missing/empty values become \`null\` (the engine never emits \`NaN\`); object/array values are JSON-stringified rather than becoming \`"[object Object]"\`.
- \`parameters\` must always be present at the top level, even if empty (\`{}\`).
- A node with \`partitionRouter\` cannot also have \`retriever: { type: "async" }\`, and vice versa.
- An async node (\`retriever.type === "async"\`) must include \`submit\`, \`poll\`, and \`download\`; it must NOT also declare a node-level \`request\`/\`recordSelector\`.
- \`apiKey\`/\`bearer\`/\`basic\` inject a credential the user fills in directly; \`tokenExchange\`/\`oauth2\` exchange it for a server-issued token first.

## 19. Worked examples

All five examples below are complete, parser-valid manifests (or, for the \`partitionRouter\`/\`oauth2\` shapes, a full node built directly from the grammar above).

### 19.1 RatesDeclarative — simple GET, no auth

\`\`\`json
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
\`\`\`

### 19.2 Moloco — tokenExchange auth + async retriever + accounts

\`\`\`json
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
\`\`\`

### 19.3 OAuth2 — refresh_token grant (minimal, illustrative)

A minimal manifest built directly from the \`oauth2\` shape in §5 — swap \`baseUrl\`/\`tokenUrl\`/paths for the real target API's:

\`\`\`json
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
\`\`\`

### 19.4 Coc Coc Ads — apiKey header + day-by-day incremental + offset pagination + nested dataPath + transformations.add

\`\`\`json
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
        "time_start": { "type": "string" },
        "time_end": { "type": "string" },
        "payment_type": { "type": "integer" },
        "payment_limit_type": { "type": "string" },
        "payment_limit_value": { "type": "integer" },
        "tracking_enabled": { "type": "boolean" },
        "shows": { "type": "integer", "dataPath": "stats.shows" },
        "clicks": { "type": "integer", "dataPath": "stats.clicks" },
        "spending": { "type": "number", "dataPath": "stats.spending" },
        "ctr": { "type": "number", "dataPath": "stats.ctr" },
        "cpc": { "type": "number", "dataPath": "stats.cpc" },
        "cpm": { "type": "number", "dataPath": "stats.cpm" }
      }
    },

    "ad_groups": {
      "overview": "Daily ad-group performance + cost.",
      "uniqueKeys": ["date", "id"],
      "incremental": { "strategy": "day-by-day", "request": { "into": "query", "startName": "start", "endName": "end", "format": "YYYY-MM-DD" } },
      "request": { "method": "GET", "path": "/v2/ad-groups", "queryParameters": { "limit": "50", "campaign_id": "{{ parameters.CampaignIds }}" } },
      "recordSelector": { "recordPath": ["data"] },
      "pagination": { "type": "offset", "pageSize": 50, "inject": { "into": "query", "name": "offset" } },
      "transformations": [ { "type": "add", "field": "date", "value": "{{ dateWindow.start }}" } ],
      "fields": {
        "date": { "type": "date" },
        "id": { "type": "integer" },
        "status": { "type": "string" },
        "name": { "type": "string" },
        "campaign_id": { "type": "integer" },
        "campaign_name": { "type": "string" },
        "shows": { "type": "integer", "dataPath": "stats.shows" },
        "clicks": { "type": "integer", "dataPath": "stats.clicks" },
        "spending": { "type": "number", "dataPath": "stats.spending" },
        "ctr": { "type": "number", "dataPath": "stats.ctr" },
        "cpc": { "type": "number", "dataPath": "stats.cpc" },
        "cpm": { "type": "number", "dataPath": "stats.cpm" },
        "avg_pos": { "type": "number", "dataPath": "stats.avg_pos" }
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
        "moderation_status": { "type": "string" },
        "campaign_id": { "type": "integer" },
        "campaign_name": { "type": "string" },
        "ad_group_id": { "type": "integer" },
        "ad_group_name": { "type": "string" },
        "title": { "type": "string" },
        "url": { "type": "string" },
        "shows": { "type": "integer", "dataPath": "stats.shows" },
        "clicks": { "type": "integer", "dataPath": "stats.clicks" },
        "spending": { "type": "number", "dataPath": "stats.spending" },
        "ctr": { "type": "number", "dataPath": "stats.ctr" },
        "cpc": { "type": "number", "dataPath": "stats.cpc" },
        "cpm": { "type": "number", "dataPath": "stats.cpm" },
        "avg_pos": { "type": "number", "dataPath": "stats.avg_pos" }
      }
    }
  }
}
\`\`\`

### 19.5 Substream — partitionRouter: substream, expanded into a full node

Expands the \`partitionRouter: substream\` shape (§10) into one complete node: fetch the list of ad accounts first, then fetch each account's campaigns.

\`\`\`json
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
\`\`\`

## 20. Authoring workflow

1. Call \`connector_manifest_schema\` (this document) if you have not already read it.
2. Research the target API (its own docs, pasted after this reference) and author the manifest — pick the auth type (§5), define one node per data stream you need (§6–§7), and add pagination/incremental/filters/transformations/error-handling only where the API actually needs them.
3. Call \`connector_test\` with the full manifest and non-secret configuration values only (e.g. date ranges, IDs, filters) — this dry-runs one node against the live API. Never put API keys or tokens in \`configuration\`.
4. If it fails, read the returned error, make the SMALLEST change that fixes it (correct a typo in the existing \`baseUrl\`/\`path\`/\`queryParameters\`/field name — do not rewrite working parts, rename nodes, or swap to a different API), and re-run \`connector_test\`.
5. Once it passes, call \`connector_publish\` to persist the manifest. Connecting real credentials happens separately: the user signs in / enters them via the browser, never through the assistant.
`;
