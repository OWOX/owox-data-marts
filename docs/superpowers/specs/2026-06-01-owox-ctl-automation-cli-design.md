# owox-ctl Automation CLI Simplification Design

## Goal

Simplify `owox-ctl` around its primary use case: automation and local agent workflows against an existing OWOX Data Marts instance. The CLI should be predictable for scripts, easy for agents to call, and small enough that implementation and documentation are straightforward.

Non-backward-compatible changes are accepted for `@owox/ctl` because the package has not yet been released into the generated changelog.

## Current State

`owox-ctl` currently carries human-oriented CLI behavior:

- `--format table|json`
- table rendering
- ANSI color support and `--no-color`
- interactive `auth login`
- stored credentials in a platform-specific `ctl/config.json`
- `auth logout`
- `auth status`

It also supports `--env-file`, which is useful for automation because it lets agents and CI load credentials without a dedicated `owox-ctl` config format.

## Target CLI Contract

The supported commands are:

```bash
owox-ctl status [--env-file .env]
owox-ctl data-marts list [--env-file .env]
owox-ctl storages list [--env-file .env]
owox-ctl destinations list [--env-file .env]
```

All command output is JSON. There is no table output, color output, or output format flag.

## Configuration

Configuration is environment-only:

- `OWOX_API_ORIGIN` is optional and defaults to `https://app.owox.com`.
- `OWOX_API_KEY_ID` is required.
- `OWOX_API_KEY_SECRET` is required.
- `--env-file` remains supported and loads environment variables through the existing shared environment manager.

The CLI does not read or write a dedicated JSON config file. `OWOX_CTL_CONFIG_PATH`, `ConfigStore`, `auth login`, and `auth logout` are removed.

If any credential variable is missing after env and optional env-file resolution, the command exits non-zero with a JSON error.

## Status Command

`owox-ctl status` replaces `owox-ctl auth status`.

It resolves configuration, validates credentials by authenticating against the API, masks the API key ID, and emits JSON:

```json
{
  "authenticated": true,
  "apiOrigin": "https://app.owox.com",
  "apiKeyId": "pmk_1234...",
  "envFile": ".env"
}
```

`envFile` is the env file path argument successfully loaded for this command, or `null` when no env file was used. The value preserves the user-provided path string instead of normalizing it to an absolute path:

```json
{
  "authenticated": true,
  "apiOrigin": "https://app.owox.com",
  "apiKeyId": "pmk_1234...",
  "envFile": null
}
```

If `--env-file missing.env` is provided and cannot be loaded, the command exits non-zero with a JSON error.

## Error Handling

All command errors are emitted as JSON to stderr and use a non-zero exit code. Error JSON keeps the current normalized fields where useful:

```json
{
  "error": {
    "message": "OWOX_API_KEY_ID and OWOX_API_KEY_SECRET are required",
    "name": "OWOXConfigError"
  }
}
```

Authentication and API request errors continue to use normalized `OWOXApiError`, `OWOXAuthError`, and `OWOXConfigError` handling.

## Implementation Shape

The CLI keeps oclif and the existing command structure, but simplifies the shared command base:

- `BaseCommand.baseFlags` contains only `--env-file`.
- `BaseCommand.loadEnvironment()` returns the recognized env-file path as `string | null`.
- `BaseCommand.getAuthenticatedClient()` resolves env configuration and creates `OWOXApiClient`.
- `BaseCommand.writeJson()` replaces table-aware row rendering.
- `output.ts` keeps JSON rendering and removes table/color helpers.
- `config-store.ts` is replaced with a smaller env configuration module that resolves credentials from `process.env` and exposes API key masking.
- `commands/auth/*` are removed.
- `commands/status.ts` is added.

Resource list commands return the raw API arrays as JSON.

## API Client Boundary

The `https://app.owox.com` default belongs to `owox-ctl`, not `@owox/api-client`.

`@owox/api-client` stays explicit about `apiOrigin` so lower-level integrations do not inherit CLI-specific configuration behavior. Its constructor options continue requiring `apiOrigin`, `apiKeyId`, and `apiKeySecret`.

Docs for `@owox/api-client` should continue showing `apiOrigin`, typically from `OWOX_API_ORIGIN`. The CLI docs should document that `OWOX_API_ORIGIN` is optional for `owox-ctl` and defaults to OWOX Data Marts Cloud.

## Documentation Scope

Update:

- `docs/api/owox-ctl.md`
- `apps/ctl/README.md`
- `docs/api/api-client.md`, only if related wording needs to distinguish the API client from the CLI default
- `docs/api/api-keys.md`
- `docs/api/index.md`
- `docs/api/openapi.md`, if wording still implies a human/table CLI

Docs should frame `owox-ctl` as an automation and local-agent command surface. They should remove login/logout/table/color guidance, keep `--env-file`, and document Cloud as the default API origin.

## Changeset Scope

Update `.changeset/add-api-control-cli.md` instead of adding a new changeset. The changeset should describe the final simplified CLI surface and mention that the initial `@owox/ctl` release is automation-first, JSON-only, env-configured, and defaults to OWOX Data Marts Cloud.

## Testing

Update focused tests for:

- env-only config resolution
- default `https://app.owox.com` API origin in `@owox/ctl`
- `--env-file` success and failure behavior
- JSON-only list command output
- top-level `status` success output, including nullable `envFile`
- missing credential errors
- removal of auth command behavior from CLI tests

Run at minimum:

```bash
npm run test -w @owox/ctl
```

Run `npm run test -w @owox/api-client` only if implementation changes touch the API client package. Typecheck or lint the touched workspaces if implementation changes TypeScript public types or command registration.
