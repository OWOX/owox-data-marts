# Credential definitions

An external Credential definition describes how OWOX Data Marts authenticates requests to one
service. It is declarative: the repository cannot provide executable adapter code, callbacks,
expressions, environment-variable references, or a way to read the stored secret.

For project ownership, sharing, and runtime behavior, see
[Credentials](../project/credentials.md).

Public Credential definition repositories work without deployment credentials. Private
repositories use the same configured GitHub access as private plugin repositories: the deployment
GitHub App or, on a self-managed deployment, a `GITHUB_TOKEN` that can read the repository. If the
deployment cannot read a private repository, install or grant the configured GitHub App access and
try again.

Put the definition in `plugin.json` at the repository root and publish it through GitHub Releases:

```json
{
  "name": "Acme CRM Credentials",
  "description": "Authenticate requests to the Acme CRM API",
  "delivery": {
    "type": "credential-definition"
  },
  "credential": {
    "name": "acme",
    "documentationUrl": "https://docs.acme.example/api-keys",
    "authentication": {
      "type": "secret",
      "label": "API key",
      "placement": {
        "type": "header",
        "name": "Authorization",
        "scheme": "Bearer"
      }
    },
    "origins": ["https://api.acme.example"]
  }
}
```

`credential.name` is the stable JavaScript-safe name passed by an exact consumer to
`exactCredential(ctx.credentials, 'acme')`. Built-in names and `ai` are reserved. The current
authentication contract accepts one opaque secret placed in an HTTP header. Origins must use HTTPS
and resolve to public networks; every initial request and redirect remains inside the declared
origin set.

`credential.documentationUrl` is optional. When present, OWOX can show a documentation link next
to the write-only secret field. It must be a parseable absolute HTTPS URL without embedded username
or password. OWOX normalizes and exposes this metadata to the management UI, but the backend never
fetches the documentation URL.

## Optional AI contract

An AI-capable definition selects one trusted Host adapter and supplies model metadata:

```json
{
  "credential": {
    "name": "acmeAi",
    "authentication": {
      "type": "secret",
      "label": "API key",
      "placement": { "type": "header", "name": "Authorization", "scheme": "Bearer" }
    },
    "origins": ["https://api.acme.example"],
    "ai": {
      "adapter": {
        "type": "openai-compatible",
        "baseUrl": "https://api.acme.example/v1"
      },
      "models": {
        "language": [
          { "id": "acme-fast", "name": "Acme Fast" },
          { "id": "acme-reasoning", "name": "Acme Reasoning" }
        ],
        "embedding": [{ "id": "acme-embed", "name": "Acme Embed" }]
      },
      "recommended": {
        "fast": "acme-fast",
        "reasoning": "acme-reasoning",
        "embedding": "acme-embed"
      }
    }
  }
}
```

Supported adapters are `openai`, `anthropic`, `google`, `openrouter`, and `openai-compatible`. The
base URL must belong to a declared origin. Catalog entries contain provider model IDs and display
names; recommendations initialize maintainer-selectable logical mappings.

## Releases and compatibility

OWOX uses the GitHub repository's numeric ID as definition identity, so a rename or transfer does
not create another definition. Eligible releases use SemVer. The compatibility line is the major
version from `1.0.0` onward and the minor version before `1.0.0`.

Compatible releases in the accepted line apply automatically. Changing display metadata, model
catalogs, recommendations, or header-placement details can stay within a line. Adding, removing, or
replacing origins, changing `credential.name`, removing an existing AI interface, or changing its
adapter requires a new compatibility line. Existing Credentials pause until a maintainer accepts
that new line; their secrets and explicit model overrides remain stored.

OWOX checks known external definitions automatically once per day. There is no separate manual
update action. A temporary GitHub failure or invalid release leaves the last accepted definition
active.
