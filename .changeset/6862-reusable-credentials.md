---
'owox': minor
---

# Reuse project Credentials across plugins

Projects can now store and manage reusable Credentials with owners, sharing, Contexts, operational
state, and dependency visibility. Plugins declare exact provider or logical AI requirements and
members explicitly select eligible Credentials during installation, while raw secrets remain in
the host. External Credential definitions can be added from public GitHub repositories or private
repositories available through the deployment's configured GitHub access. Plugin authors use the
same typed `exactCredential` helper for built-in and external definitions.

See [Credentials](../docs/project/credentials.md) and
[Credential definitions](../docs/plugins/credential-definitions.md) for setup and authoring details.
