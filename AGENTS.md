# Agent Instructions

Preserve unrelated work and use the repository's declared npm workspaces and
commands. Before reviewing or changing code, resolve the affected surface:

- `apps/web`: `app.owox.com` web UI and feature-scoped browser behavior;
- `apps/backend`: NestJS app backend and local persistence;
- `packages/idp-protocol`: identity-provider contracts;
- `packages/idp-owox-better-auth`: OWOX Better Auth implementation and IB C2C
  client boundary.

For every review, read [`docs/review-rules.md`](docs/review-rules.md). For backend
architecture, use [`apps/backend/README.md`](apps/backend/README.md) and
[`apps/backend/MODULAR_CONVENTIONS.md`](apps/backend/MODULAR_CONVENTIONS.md) as
the sources of truth. Use
[`docs/contributing/repository/repository-structure.md`](docs/contributing/repository/repository-structure.md)
for repository structure and
[`docs/contributing/testing.md`](docs/contributing/testing.md) for test commands.

Before completing an implementation, determine whether it needs a changeset by
following the policy in
[`docs/contributing/repository/release-strategy.md`](docs/contributing/repository/release-strategy.md).
A changeset is not required for every change. When one is required for
OWOX-managed work, its filename starts with the owning Fibery Work Item's public
numeric ID. If that ID cannot be determined unambiguously from the task context,
ask the user before creating or renaming the changeset; never guess it.

For changes to database routing, plugin-owned collections, migrations, events,
or internal analytics delivery, also read
[`docs/data-and-event-boundaries.md`](docs/data-and-event-boundaries.md).

When a change crosses OWOX repositories, also use the Factory system map and
cross-repository review skill. Repository-local instructions remain
authoritative for this codebase.

## Managed Runtime Deployment

This repository owns the ODM environment-variable contract: variable names,
types, defaults, validation, documentation, and application behavior. The OWOX
managed staging and production deployment lives in the separate `OWOX/k8s`
repository.

When adding, removing, renaming, or changing the meaning of a deployed variable:

- update or verify `.env.example`, the relevant configuration loader/schema,
  and the deployment documentation under
  `docs/getting-started/deployment-guide/`;
- inspect the `k8s` ODM ConfigMap and both environment overlays for deployed
  consumers and rollout compatibility;
- keep secret values out of both repositories. OWOX-managed secret values live
  in Google Secret Manager; `k8s` owns only their CSI configuration and pinned
  version references.

Requests to deploy, release, roll out, or promote an existing ODM image belong
to `k8s`; do not change application source merely to perform that operation.
