# @owox/idp-owox-better-auth

Better Auth IDP provider for OWOX Data Marts authentication.

## Setup

### 1. Environment Configuration

```env
# Core IdP (shared DB) — SQLite (default) or MySQL
IDP_PROVIDER=owox-better-auth
IDP_OWOX_DB_TYPE=mysql
IDP_OWOX_MYSQL_HOST=localhost
IDP_OWOX_MYSQL_USER=root
IDP_OWOX_MYSQL_PASSWORD=your-password
IDP_OWOX_MYSQL_DB=idp_owox
IDP_OWOX_MYSQL_PORT=3306
IDP_OWOX_MYSQL_SSL=true

IDP_OWOX_BASE_URL=https://idp.example.com
IDP_OWOX_BACKCHANNEL_API_PREFIX=/your-custom-prefix
IDP_OWOX_C2C_SERVICE_ACCOUNT=service-account@example.com
IDP_OWOX_C2C_TARGET_AUDIENCE=audience-string
IDP_OWOX_CLIENT_ID=your-client-id
IDP_OWOX_PLATFORM_SIGN_IN_URL=https://platform.example.com/auth/sign-in
IDP_OWOX_PLATFORM_SIGN_UP_URL=https://platform.example.com/auth/sign-up
IDP_OWOX_CALLBACK_URL=/auth/callback
IDP_OWOX_ALLOWED_REDIRECT_ORIGINS=https://platform.example.com
IDP_OWOX_JWT_ISSUER=https://idp.example.com
IDP_OWOX_JWT_CACHE_TTL=1h
IDP_OWOX_JWT_CLOCK_TOLERANCE=5s

# Better Auth UI/auth-only settings
IDP_BETTER_AUTH_SECRET=your-super-secret-key-at-least-32-characters-long
IDP_BETTER_AUTH_BASE_URL=http://localhost:3000
IDP_BETTER_AUTH_SESSION_MAX_AGE=604800
IDP_BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001

# Social login (Google)
IDP_BETTER_AUTH_GOOGLE_CLIENT_ID=xx
IDP_BETTER_AUTH_GOOGLE_CLIENT_SECRET=xx
```

## Configuration Reference

| Variable                              | Required |                   Default                   | Description                                 |
| ------------------------------------- | :------: | :-----------------------------------------: | ------------------------------------------- |
| `IDP_PROVIDER`                        | **Yes**  |                      –                      | Set to `owox-better-auth`                    |
| `IDP_OWOX_DB_TYPE`                    |    No    |                  `sqlite`                  | Database type: `sqlite` or `mysql` |
| `IDP_OWOX_SQLITE_DB_PATH`             |    No    | `<app data>/sqlite/idp/owox-better-auth.db` | SQLite database file path                   |
| `IDP_OWOX_MYSQL_HOST`                 |    No    |                      –                      | MySQL host                                  |
| `IDP_OWOX_MYSQL_USER`                 |    No    |                      –                      | MySQL user                                  |
| `IDP_OWOX_MYSQL_PASSWORD`             |    No    |                      –                      | MySQL password                              |
| `IDP_OWOX_MYSQL_DB`                   |    No    |                      –                      | MySQL database                              |
| `IDP_OWOX_MYSQL_PORT`                 |    No    |                   `3306`                    | MySQL port                                  |
| `IDP_OWOX_MYSQL_SSL`                  |    No    |                   `false`                   | Enable SSL: `true`, JSON, or string         |
| `IDP_OWOX_BASE_URL`                   | **Yes**  |                      –                      | Identity client base URL                    |
| `IDP_OWOX_BACKCHANNEL_API_PREFIX`     | **Yes**  |                      –                      | Path prefix for backchannel endpoints        |
| `IDP_OWOX_C2C_SERVICE_ACCOUNT`        | **Yes**  |                      –                      | Service account email for C2C impersonation |
| `IDP_OWOX_C2C_TARGET_AUDIENCE`        | **Yes**  |                      –                      | Target audience for C2C impersonation       |
| `IDP_OWOX_CLIENT_ID`                  | **Yes**  |                      –                      | Client id for PKCE                          |
| `IDP_OWOX_PLATFORM_SIGN_IN_URL`       | **Yes**  |                      –                      | Platform sign-in URL (redirect target)      |
| `IDP_OWOX_PLATFORM_SIGN_UP_URL`       | **Yes**  |                      –                      | Platform sign-up URL (redirect target)      |
| `IDP_OWOX_ALLOWED_REDIRECT_ORIGINS`   |    No    |     origins from platform sign-in/up URLs   | Allowlist for redirect-to/app-redirect-to   |
| `IDP_OWOX_JWT_ISSUER`                 | **Yes**  |                      –                      | Expected JWT issuer                         |
| `IDP_OWOX_JWT_CACHE_TTL`              |    No    |                    `1h`                     | JWKS cache TTL                              |
| `IDP_OWOX_JWT_CLOCK_TOLERANCE`        |    No    |                    `5s`                     | Clock skew tolerance                        |
| `IDP_BETTER_AUTH_SECRET`              | **Yes**  |                      –                      | Secret key for signing (min. 32 characters) |
| `IDP_BETTER_AUTH_BASE_URL`            |    No    | `PUBLIC_ORIGIN` → '<http://localhost:3000>' | Base URL for Better Auth callbacks          |
| `IDP_BETTER_AUTH_SESSION_MAX_AGE`     |    No    |              `604800` (7 days)              | Session duration (seconds)                  |
| `IDP_BETTER_AUTH_TRUSTED_ORIGINS`     |    No    |         `IDP_BETTER_AUTH_BASE_URL`          | Trusted origins for auth service            |
| `IDP_BETTER_AUTH_GOOGLE_CLIENT_ID`    |    No    |                      –                      | Google OAuth client id (enables Google)     |
| `IDP_BETTER_AUTH_GOOGLE_CLIENT_SECRET`|    No    |                      –                      | Google OAuth client secret                  |

## Troubleshooting

### "IDP_BETTER_AUTH_SECRET is not set" Error

Make sure your `.env` file contains a valid `IDP_BETTER_AUTH_SECRET` with at least 32 characters.

### Database Connection Issues

For MySQL, verify your connection settings and ensure the database exists.

### Permission Denied

Ensure the user has permission for the action they're trying to perform.
