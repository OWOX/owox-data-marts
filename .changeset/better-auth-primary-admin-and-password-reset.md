---
'owox': minor
---

# Better Auth: Primary Admin Setup & Password Reset

## What's New

### Automatic Primary Admin Creation

You can now automatically create or manage a primary admin on server startup using an environment variable:

```bash
IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL=admin@yourdomain.com
```

The system will:

- Create the admin if it doesn't exist (generates magic link in logs)
- Generate a new magic link if admin exists but has no password (shown in logs)
- Do nothing if admin is already properly configured

### Password Reset for Admins

Admins can now reset user passwords through the Admin Dashboard UI:

1. Navigate to `/auth/dashboard`
2. Click on a user to view their details
3. Click **Reset Password** (for users with password) or **Generate Magic Link** (for users without password)
4. Copy the generated magic link and share it securely

### Documentation

New documentation added at `/docs/getting-started/setup-guide/better-auth/project-members.md`:

- User management guide
- Password reset procedures
- Handling single-admin scenarios
- Role permissions reference

## Configuration

New environment variable:

| Variable | Description | Default |
|----------|-------------|---------|
| `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL` | Email for automatic primary admin creation | – |
