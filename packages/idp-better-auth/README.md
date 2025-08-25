# @owox/idp-better-auth

Better Auth IDP provider for OWOX Data Marts authentication.

## Setup

### 1. Environment Configuration

Create or update your `.env` file with the required settings:

```env
# Required
IDP_PROVIDER=better-auth
IDP_SECRET=your-super-secret-key-at-least-32-characters-long

# Database (SQLite - recommended for getting started)
IDP_DATABASE_TYPE=sqlite
IDP_SQLITE_DB_PATH=./data/auth.db

# Optional
IDP_BASE_URL=http://localhost:3000
IDP_MAGIC_LINK_TTL=3600
IDP_SESSION_MAX_AGE=86400
```

### 2. MySQL Configuration (Alternative)

If you prefer MySQL instead of SQLite:

```env
IDP_PROVIDER=better-auth
IDP_SECRET=your-super-secret-key-at-least-32-characters-long

IDP_DATABASE_TYPE=mysql
IDP_MYSQL_HOST=localhost
IDP_MYSQL_USER=root
IDP_MYSQL_PASSWORD=your-password
IDP_MYSQL_DATABASE=owox_auth
IDP_MYSQL_PORT=3306
```

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
owox idp add-user admin@yourdomain.com
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

The database schema is automatically created on first startup. For SQLite, the file will be created at the path specified in `IDP_SQLITE_DB_PATH` or default path in system application temp directory.

### SQLite (Default)

- File-based database
- No additional setup required
- Good for development and small deployments

### MySQL

- Requires MySQL server
- Create database manually: `CREATE DATABASE owox_auth;`
- Tables are created automatically

## Command Line Tools

### Add User

```bash
owox idp add-user user@example.com
```

## Configuration Reference

| Variable              | Required | Default  | Description                             |
| --------------------- | -------- | -------- | --------------------------------------- |
| `IDP_PROVIDER`        | Yes      | -        | Set to `better-auth`                    |
| `IDP_SECRET`          | Yes      | -        | Key for signing secret (32+ characters) |
| `IDP_DATABASE_TYPE`   | No       | `sqlite` | Database type: `sqlite`, `mysql`        |
| `IDP_SQLITE_DB_PATH`  | No       | -        | SQLite database file path               |
| `IDP_BASE_URL`        | No       | -        | Base URL for magic links                |
| `IDP_MAGIC_LINK_TTL`  | No       | `3600`   | Magic link expiration (seconds)         |
| `IDP_SESSION_MAX_AGE` | No       | -        | Session duration (seconds)              |

## Troubleshooting

### "IDP_SECRET is not set" Error

Make sure your `.env` file contains a valid `IDP_SECRET` with at least 32 characters.

### Database Connection Issues

For MySQL, verify your connection settings and ensure the database exists.

### Magic Links Not Working

Check that `IDP_BASE_URL` matches your application URL and that the magic link hasn't expired.

### Permission Denied

Ensure the user has the correct role permissions for the action they're trying to perform.
