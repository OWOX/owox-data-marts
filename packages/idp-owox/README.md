# @owox/idp-owox

OWOX Identity Provider implementation for OWOX Data Marts authentication.  
This package provides the **IdP integration with OWOX Identity Platform**, handling tokens, introspection, and persistence (SQLite/MySQL).

## Setup

### 1. Environment Configuration

Create or update your `.env` file with the required settings:

```env
# Database (SQLite is default and recommended for getting started)
IDP_OWOX_DB_TYPE=sqlite
IDP_OWOX_SQLITE_DB_PATH=./data/auth.db
IDP_OWOX_SQLITE_PRAGMA=journal_mode=WAL,synchronous=NORMAL

# IdentityOwox client (OWOX Identity Platform backend)
IDP_OWOX_BASE_URL=https://integrated-backend.bi.owox.com
IDP_OWOX_TIMEOUT=3s
# Optional: pass default headers to every request
IDP_OWOX_DEFAULT_HEADERS={"x-trace-id":"debug-local"}

# IDP App configuration
IDP_OWOX_CLIENT_ID=app-owox
IDP_OWOX_PLATFORM_SIGN_IN_URL=https://platform.owox.com/ui/p/signin
IDP_OWOX_PLATFORM_SIGN_UP_URL=https://platform.owox.com/ui/p/signup
IDP_OWOX_CALLBACK_URL=/auth/callback

# JWT validation
IDP_OWOX_JWT_ISSUER=https://idp.owox.com
IDP_OWOX_JWT_CLOCK_TOLERANCE=5s
IDP_OWOX_JWT_CACHE_TTL=1h
IDP_OWOX_JWT_ALGORITHM=RS256
```

#### SQLite Default Path

If `IDP_OWOX_SQLITE_DB_PATH` is not provided, the database file will be created automatically in the system application data directory (using env-paths).

### 2. MySQL Configuration (Alternative)

If you prefer MySQL instead of SQLite:

```env
IDP_OWOX_DB_TYPE=mysql
IDP_OWOX_MYSQL_HOST=localhost
IDP_OWOX_MYSQL_PORT=3306
IDP_OWOX_MYSQL_USER=idp_user
IDP_OWOX_MYSQL_PASSWORD=your-secret
IDP_OWOX_MYSQL_DB=idp_owox
# Optional
IDP_OWOX_MYSQL_CONNECTION_LIMIT=10
IDP_OWOX_MYSQL_SSL=
```

#### MySQL SSL

`IDP_OWOX_MYSQL_SSL` enables TLS for MySQL (mysql2). Supported formats:

- Boolean-like (strings)
  - `true` → `{}` (enable TLS with default options: `rejectUnauthorized: true`)
  - `false` or empty → no `ssl` field (TLS disabled)

- JSON object (forwarded to mysql2 TLS options)
  - Strict CA verification:
    - `{"rejectUnauthorized": true}`
  - Custom CA bundle (inline PEM):
    - `{"rejectUnauthorized": true, "ca": "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----\\n"}`
  - Mutual TLS (client cert + key):
    - `{"rejectUnauthorized": true, "cert": "-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----\\n", "key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"}`
  - Minimum TLS version (TLS 1.2):
    - `{"minVersion": "TLSv1.2", "rejectUnauthorized": true}`

### 3. Authentication Flow

1. Sign In: User is redirected to OWOX Platform sign-in page (`IDP_OWOX_PLATFORM_SIGN_IN_URL`)
2. Callback: On success, user is redirected back to `IDP_OWOX_CALLBACK_URL`
3. Introspection: Tokens are validated against OWOX Identity Platform
4. App Sign-In: Application redirects user to Sign-In page

#### Install dependencies

```bash
npm install
```

#### Build

```bash
npm run build
```

#### Type checking

```bash
npm run typecheck
```

#### Linting

```bash
npm run lint
npm run lint:fix
```

#### Formatting

```bash
npm run format
npm run format:check
```
