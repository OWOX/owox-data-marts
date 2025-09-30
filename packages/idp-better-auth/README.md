# @owox/idp-better-auth

Better Auth IDP provider for OWOX Data Marts authentication.

## Setup

### 1. Environment Configuration

Create or update your `.env` file with the required settings:

```env
# Required
IDP_PROVIDER=better-auth
IDP_BETTER_AUTH_SECRET=your-super-secret-key-at-least-32-characters-long

# Database (SQLite - recommended for getting started)
IDP_BETTER_AUTH_DATABASE_TYPE=sqlite
IDP_BETTER_AUTH_SQLITE_DB_PATH=./data/auth.db

# Optional
IDP_BETTER_AUTH_BASE_URL=http://localhost:3000
IDP_BETTER_AUTH_MAGIC_LINK_TTL=3600
IDP_BETTER_AUTH_SESSION_MAX_AGE=86400
IDP_BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000,http://localhost:3001
```

#### Tip

To generate a random secret key, you can use the following command:

```bash
openssl rand -base64 32
```

### 2. MySQL Configuration (Alternative)

If you prefer MySQL instead of SQLite:

```env
IDP_PROVIDER=better-auth
IDP_BETTER_AUTH_SECRET=your-super-secret-key-at-least-32-characters-long

IDP_BETTER_AUTH_DATABASE_TYPE=mysql
IDP_BETTER_AUTH_MYSQL_HOST=localhost
IDP_BETTER_AUTH_MYSQL_USER=root
IDP_BETTER_AUTH_MYSQL_PASSWORD=your-password
IDP_BETTER_AUTH_MYSQL_DATABASE=better_auth
IDP_BETTER_AUTH_MYSQL_PORT=3306
```

#### MySQL SSL

`IDP_BETTER_AUTH_MYSQL_SSL` enables TLS for MySQL (mysql2). Supported formats:

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

### 3. Start the Application

```bash
owox serve
```

or if .env file doesn't exported:

**Linux/macOS:**

```bash
export $(grep -v '^#' .env | grep -v '^$' | xargs) && owox serve
```

**Windows (PowerShell):**

```powershell
Get-Content .env | Where-Object {$_ -notmatch '^#' -and $_ -notmatch '^$'} | ForEach-Object {$name, $value = $_.split('=', 2); Set-Variable -Name $name -Value $value}; owox serve
```

**Windows (Command Prompt):**

```cmd
for /f "usebackq tokens=1,2 delims==" %i in (.env) do set %i=%j
owox serve
```

The authentication system will be available at:

- Sign in page: `http://localhost:3000/auth/sign-in`
- Admin dashboard: `http://localhost:3000/auth/dashboard`

### 4. Add Your First Admin User

```bash
# Add an admin user and get a magic link
export $(grep -v '^#' .env | grep -v '^$' | xargs) && owox idp add-user admin@yourdomain.com
```

Copy the magic link from the output and open it in your browser to set up your admin account.

## Authentication Flow

### For End Users

1. **Sign In**: Navigate to `/auth/sign-in`
2. **Enter credentials**: Email and password
3. **Dashboard access**: After login, access admin features at `/auth/dashboard`

### For New Users (Admin Invitation)

1. **Admin invites**: Admin uses the dashboard to invite new users via magic link
2. **Magic link**: New user receives a magic link from user who invited them
3. **Password setup**: User goes to magic link and sets their password
4. **Access granted**: User can now sign in normally

## Admin Panel Features

The admin dashboard (`/auth/dashboard`) provides:

- **User management**: View all users, their roles, and activity
- **Add users**: Invite new users with specific roles (admin/editor/viewer)
- **Role management**: Assign different permission levels
- **Magic links**: Generate new magic links for existing users

### User Roles

- **Admin**: Full access, can manage all users and invite any role
- **Editor**: Can invite editors and viewers
- **Viewer**: Can only invite other viewers

## Database Management

The database schema is automatically created on first startup. For SQLite, the file will be created at the path specified in `IDP_BETTER_AUTH_SQLITE_DB_PATH` or default path in the system application data directory.

### SQLite (Default)

- File-based database
- No additional setup required
- Good for development and small deployments

### MySQL

- Requires MySQL server
- Create database manually: `CREATE DATABASE better_auth;`
- Create user if needed: `CREATE USER 'better_auth_user'@'localhost' IDENTIFIED BY 'your_password';`
- Grant privileges: `GRANT ALL PRIVILEGES ON better_auth.* TO 'better_auth_user'@'localhost';`
- Flush privileges: `FLUSH PRIVILEGES;`
- Tables are created automatically

## Command Line Tools

### Add User

```bash
owox idp add-user user@example.com
```

## Configuration Reference

| Variable                          | Required |                  Default                  | Description                                  |
| --------------------------------- | :------: |:-----------------------------------------:|----------------------------------------------|
| `IDP_PROVIDER`                    | **Yes**  |                     –                     | Set to `better-auth`                         |
| `IDP_BETTER_AUTH_SECRET`          | **Yes**  |                     –                     | Secret key for signing (min. 32 characters)  |
| `IDP_BETTER_AUTH_DATABASE_TYPE`   |    No    |           `DB_TYPE` → 'sqlite'            | Database type: `sqlite` or `mysql`           |
| `IDP_BETTER_AUTH_SQLITE_DB_PATH`  |    No    |   `<system application data directory>`   | SQLite database file path                    |
| `IDP_BETTER_AUTH_BASE_URL`        |    No    | `PUBLIC_ORIGIN` → '<http://localhost:3000>' | Base URL for magic links                     |
| `IDP_BETTER_AUTH_MAGIC_LINK_TTL`  |    No    |              `3600` (1 hour)              | Magic link expiration (seconds)              |
| `IDP_BETTER_AUTH_SESSION_MAX_AGE` |    No    |             `604800` (7 days)             | Session duration (seconds)                   |
| `IDP_BETTER_AUTH_MYSQL_HOST`      |    No    |                 `DB_HOST`                 | MySQL host                                   |
| `IDP_BETTER_AUTH_MYSQL_USER`      |    No    |                 `DB_USER`                 | MySQL user                                   |
| `IDP_BETTER_AUTH_MYSQL_PASSWORD`  |    No    |               `DB_PASSWORD`               | MySQL password                               |
| `IDP_BETTER_AUTH_MYSQL_DATABASE`  |    No    |               `DB_DATABASE`               | MySQL database                               |
| `IDP_BETTER_AUTH_MYSQL_PORT`      |    No    |                 `DB_PORT`                 | MySQL port                                   |
| `IDP_BETTER_AUTH_MYSQL_SSL`       |    No    |                  `false`                  | Enable SSL: `true`, JSON, or string          |
| `IDP_BETTER_AUTH_TRUSTED_ORIGINS` |    No    |        `IDP_BETTER_AUTH_BASE_URL`         | Trusted origins for auth service             |

## Troubleshooting

### "IDP_BETTER_AUTH_SECRET is not set" Error

Make sure your `.env` file contains a valid `IDP_BETTER_AUTH_SECRET` with at least 32 characters.

### Database Connection Issues

For MySQL, verify your connection settings and ensure the database exists.

### Magic Links Not Working

Check that `IDP_BETTER_AUTH_BASE_URL` matches your application URL and that the magic link hasn't expired.

### Permission Denied

Ensure the user has the correct role permissions for the action they're trying to perform.
