# Review Rules

## Goal

Review for concrete production, security, behavioral, contract, and
architectural risks. Do not invent findings to fill a template. If no meaningful
risk remains, say so and list any validation gap separately.

Review in this order:

1. Resolve the affected application/package and read its local architecture.
2. Check authentication, authorization, data, API/event, and external contracts.
3. Check behavior, tests, compatibility, and maintainability.

## Authoritative Architecture

For `apps/backend`, read
[`apps/backend/README.md`](../apps/backend/README.md) and
[`apps/backend/MODULAR_CONVENTIONS.md`](../apps/backend/MODULAR_CONVENTIONS.md).
Do not treat generated files under `apps/docs/src/content/docs` as sources of
truth; they are synchronized documentation output.

For other areas, follow the nearest existing implementation and package-level
instructions:

- `apps/web`: feature types define browser-facing shapes, services own HTTP
  calls, hooks own asynchronous state, and components render and invoke those
  boundaries.
- `packages/idp-protocol`: provider interfaces and shared schemas are contracts
  for every implementation and caller.
- `packages/idp-owox-better-auth`: OWOX-specific HTTP, C2C authentication, and
  IB response parsing stay inside the client/provider boundary.

## Backend Boundaries

Treat it as a risk when a change:

- puts business decisions, persistence, or multi-layer orchestration in a
  controller;
- injects a repository into orchestration when the affected module already owns
  persistence through an entity/domain service;
- returns a TypeORM entity through a use case, facade, controller, event, or API;
- performs mapping ad hoc instead of at an existing mapper boundary;
- makes a module depend on another module's domain implementation rather than
  its public facade, DTO, or event;
- uses a module's own facade internally or introduces an avoidable cyclic
  dependency;
- changes a facade implementation without meaningful unit coverage.

The normal backend direction is:

```text
Controller -> Mapper -> Use case -> Entity/Domain services -> Mapper -> DTO/Event
```

Intentional deviations are acceptable only when the affected module has a clear
existing pattern and responsibilities remain unambiguous.

## Types, Parsing, and Shared Helpers

- Define outward-facing DTO and metadata types explicitly. Do not derive them
  from persistence entities with `Omit`, `Pick`, or similar utility types:
  entity changes must not silently expose secret or internal fields.
- Use the repository's `zod` schemas for structured runtime parsing when a
  schema can express the contract; do not add a private object-shape parser for
  the same responsibility.
- Normalize unknown errors with `castError` from `@owox/internal-helpers`
  instead of repeating ad hoc `instanceof Error` or `String(error)` branches.
- Search for the existing shared helper before adding local cross-cutting
  logic. For TypeORM unique-constraint handling, use or extend
  `apps/backend/src/common/typeorm/query-error.utils.ts`.
- Do not add speculative retry loops for collisions of cryptographically random
  identifiers unless the product or persistence contract requires retry
  behavior. Keep database uniqueness as the final collision guard.

## Authentication and Cross-Repository Contracts

- Browser UI calls the ODM backend; it does not bypass ODM to call IB or legacy
  Analytics directly.
- App authorization remains in ODM. Legacy membership/project rules remain in
  the system that owns that data.
- Server-to-server calls to trusted IB operations use the OWOX identity client
  and internal/C2C endpoint family.
- Route names, methods, parameters, schemas, nullability, errors, and role
  semantics must match every producer and consumer.
- Translate legacy naming only at the adapter boundary that requires it.
- Preserve mixed-version compatibility or document and verify the rollout order.
- Never log or return access tokens, refresh tokens, authorization codes, client
  secrets, or raw identity payloads.

Client applications and add-ins authenticating for ODM must use the ODM Better
Auth boundary rather than call IB or Analytics directly.

## Deployment and Runtime Configuration

For a change that adds, removes, renames, or changes the semantics of an
environment variable, verify all of the following:

- the ODM loader/schema, default, documentation, and every application consumer
  agree on the contract;
- the OWOX-managed runtime values and all affected workloads in `OWOX/k8s` are
  compatible with the ODM revision that will consume them;
- non-secret values are placed in the shared ConfigMap or the intended
  environment overlay, while credential-bearing values remain in Google Secret
  Manager;
- rollout order and mixed-version behavior are safe when application and
  deployment changes cannot become active atomically.

Treat an unintended staging or production rollout, a secret committed as a
ConfigMap literal, or a required variable missing from any deployed workload as
a blocking deployment risk.

## Data Sources, Events, and Internal Analytics

Read [`data-and-event-boundaries.md`](data-and-event-boundaries.md) for changes
to persistence, plugin collections, event payloads, or structured event logging.

- Treat the main TypeORM connection and the named `pluginCollections` connection
  as separate logical data sources with separate entities and migration histories.
- Preserve local/self-hosted fallback to the main database unless the change
  intentionally changes that deployment contract. In OWOX Cloud, verify the
  separate plugin-collections connection and migration workload in `OWOX/k8s`.
- Do not place ordinary product entities in `pluginCollections` or plugin-owned
  collection documents in the main data source merely to simplify a query.
- An event name or payload change must preserve the OWOX envelope, event time,
  logger transport, payload-size/PII policy, and every downstream sink/model.
- Do not add a direct Pub/Sub or BigQuery dependency merely to emit an internal
  analytics event when the existing dispatcher and logger transport satisfy the
  requirement.
- Do not replicate arbitrary plugin-owned JSON into internal analytics by
  default. Require an explicit purpose, selected fields, PII handling, access,
  retention, and backfill behavior.

## Web Review

Treat it as a risk when UI code:

- duplicates an existing service/hook contract inside a component;
- assumes a project role or authenticated state that the backend does not
  guarantee;
- loses loading, error, cancellation, refetch, or stale-response behavior;
- changes a browser-visible route or API shape without checking backend and
  deep-link compatibility;
- exposes secrets or identifiers in telemetry, URLs, or error output.

Cover meaningful behavior at the service/hook/component layer closest to the
change. Use browser E2E only when the regression requires the real route and
application stack.

## Release Readiness and Changesets

Read the changeset policy in
[`docs/contributing/repository/release-strategy.md`](contributing/repository/release-strategy.md)
and evaluate the observable release impact. Do not require a changeset merely
because application code changed, and do not waive one merely because a change
is implemented in an internal layer.

When the policy requires a changeset, verify that:

- the changed release outcome is covered by a new `.changeset` file;
- for OWOX-managed work, the filename starts with the owning Fibery Work Item's
  public numeric ID followed by a short kebab-case summary;
- the selected package and version bump follow the repository release strategy;
- the title and body accurately explain the user-visible outcome without
  unnecessary implementation detail.

If the owning Fibery ID is missing or ambiguous, request clarification rather
than guessing it or substituting a pull request number. Treat a missing required
changeset, an unconfirmed filename ID, or misleading release text as an
approval-blocking release-readiness gap and report it separately from code-risk
findings. The absence of an optional changeset is not a finding.

## Tests and Validation

Use the narrowest relevant command from
[`docs/contributing/testing.md`](contributing/testing.md), then expand when the
change crosses boundaries. Common commands include:

```sh
npm test -w @owox/backend
npm test -w @owox/web
npm run test:e2e -w @owox/backend
```

For identity packages, run the affected workspace tests. For contract changes,
cover mapping and unhappy paths on both sides of every changed boundary. Never
report a command as passed when it was not run.

## Finding Priority and Output

- **High:** broken authentication/authorization, secret exposure, data
  loss/corruption, broken API/event contract, incompatible deployment, or a
  clear architecture-boundary regression.
- **Medium:** a credible behavioral failure, fragile mapping/retry/side effect,
  or missing meaningful coverage for a risky path.
- **Low:** a concrete local maintainability issue or low-risk test gap; not a
  personal style preference.

Order findings High, Medium, Low. Include file/location, evidence, concrete
failure path, affected contract or architecture source, and whether the finding
blocks approval.
