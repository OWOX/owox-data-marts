---
'owox': minor
---

# Better Auth: Primary Admin Setup & Password Reset

- **Primary admin auto-creation**: Configure `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL` to automatically create or manage primary admin on server startup
- **Password reset UI**: Admins can reset user passwords through Admin Dashboard (`/auth/dashboard`) with automatic magic link generation
- **Enhanced documentation**: Added comprehensive user management guide at `/docs/getting-started/setup-guide/members-management/better-auth.md`

**Features:**

- Auto-creates admin if doesn't exist (generates magic link in logs)
- Generates new magic link if admin exists without password
- Password reset button for existing users with passwords
- Magic link generation for users without passwords

**New Environment Variables:**

- `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL` – Email for automatic primary admin creation
