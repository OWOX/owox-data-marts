---
"@owox/idp-owox": minor
---

# Initial release of OWOX Identity Platform IDP provider

- Implemented integration with OWOX Identity Platform (OAuth2/PKCE flow)
- Added support for token management: access, refresh, introspection, and revocation
- Provided database persistence with SQLite (default) and MySQL
- Configurable via environment variables with validation (Zod-based)
- JWT verification with RS256, issuer validation, and JWKS caching
- Ready-to-use Express middlewares for sign-in, sign-out, access-token, and user APIs
