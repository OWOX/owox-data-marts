---
'owox': minor
---

# API-key exchange and auth context

Project member API keys can now be exchanged for IDP access tokens in Better Auth and the development Null IDP. Exchanged tokens are bound to the API key ID and are rejected from API-key management, project-member administration, user provisioning, Intercom identity, and MCP OAuth authorization endpoints.

`@owox/api-client` now exposes `client.auth.getContext()`, and `owox-ctl status` includes the project and member context resolved from the exchanged token without exposing key secrets. The auth-context endpoint uses IDP token introspection, and Better Auth refreshes API-key token context from current user and membership state during introspection.

Better Auth exchanged API-key tokens now include the project title used by auth-context responses.

Better Auth exchanged API-key tokens now expire after 15 minutes, allowing clients to re-exchange the underlying API key instead of accepting already-issued access tokens indefinitely.

Better Auth magic links now carry the encrypted invite role in the callback path so Better Auth callback query normalization does not drop the role before the user is added to the project.
