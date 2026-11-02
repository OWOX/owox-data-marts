---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Safer sign-in and request validation: Better Auth and zod security fixes**

**Magic links sent before the upgrade and not yet used stop working: send those users a new one.** Self-hosted deployments ran Better Auth, zod and `@hono/node-server` versions with published security advisories, among them a Better Auth flaw that let an OAuth state value work as a magic link and sign someone in as another user (GHSA-965c-763c-88jm, critical), and a zod flaw where validating an oversized collection could exhaust memory (GHSA-mrhx-c7xc-m3w5). This release moves to versions with the fixes.

- **Magic links.** Better Auth 1.7 stores magic links in a new format, so an unused link sent before the upgrade returns an invalid-token error. Links expire after an hour anyway; an admin can send a new one, see [Adding New Users](../../docs/getting-started/setup-guide/members-management/better-auth.md#adding-new-users). A primary admin without a password gets a new link in the server logs on the next start.
- **MySQL.** On start, the application widens `verification.id` in its sign-in tables to `VARCHAR(255)`: Better Auth 1.7 writes longer ids there than its own MySQL migrations create, and without the change an invited user's first sign-in fails. The database user needs the `ALTER` privilege on that table.
- **API validation errors.** 400 responses word default validation messages differently, for example `Invalid input: expected string, received undefined` instead of `Required`, and raw issues under `errorDetails.errors` follow zod 4: nested issues sit under `errors` instead of `unionErrors`, and enum and literal mismatches are `invalid_value`. Custom messages are unchanged. Update any script that matches on this text.
- **zod 4.** `owox`, `@owox/idp-protocol`, `@owox/idp-better-auth` and `@owox/idp-owox-better-auth` now declare `zod` 4 as a peer dependency.
