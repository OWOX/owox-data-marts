# Project Members

This guide explains how to manage users and team members in your OWOX Data Marts project.

## Better Auth

When using Better Auth as your identity provider (`IDP_PROVIDER=better-auth`), you have a complete user management system with role-based access control.

### Adding New Users

Admins can invite new users through the Admin Dashboard:

1. Navigate to the Admin Dashboard at `/auth/dashboard`
2. Click **Add User** button
3. Enter the user's email address
4. Select their role (admin, editor, or viewer)
5. Click **Generate Magic Link**
6. Share the generated magic link with the user via email

> ☝️ **Important**: Share magic links carefully via email only. Messengers can auto-open URLs and make the link unusable.

The invited user will receive a one-time magic link to set their password and access the system.

### User Roles

Better Auth supports three role levels with different permissions:

| Role | Permissions in Better Auth | Permissions in OWOX Data Marts |
|------|-------------|-------------|
| **Admin** | Full access: can manage all users, invite any role, reset passwords, and delete users | Full access: can create, edit, delete any data mart, storage, destination, report, trigger, run |
| **Editor** | Can invite editors and viewers | Can create, edit, delete self-created data mart, storage, destination, report, trigger, run |
| **Viewer** | Can only invite other viewers | Can only view data mart, storage, destination, report, trigger, run |

### Automatic Primary Admin Setup

You can automatically create a primary admin on first startup using an environment variable:

```bash
# In your .env file or environment
IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL=admin@yourdomain.com
```

When the server starts:

- **If admin doesn't exist**: Creates the user and generates a magic link (shown in server logs)
- **If admin exists but has no password**: Generates a new magic link (shown in server logs)
- **If admin exists with password**: Does nothing (admin is properly configured)

The magic link will be displayed in the server output:

```text
Primary admin created. Magic link: http://domain.com/auth/magic-link/verify?token=...
```

Copy this link and use it to set up the admin password.

### Resetting Admin Password

If an admin needs to reset their password or loses access, another admin can help through the Admin Dashboard.

#### Steps to Reset Password

1. Log in as an admin user
2. Navigate to the Admin Dashboard (`/auth/dashboard`)
3. Find the user in the list and click **View**
4. On the User Details page, click the **Reset Password** or **Generate Magic Link** button
   - **Reset Password** (red button): Shown when the user already has a password. This will sign them out and generate a new magic link
   - **Generate Magic Link** (blue button): Shown when the user has no password set
5. Copy the generated magic link from the green box below
6. Share the magic link with the user securely via email

The user can then use the magic link to set a new password and regain access.

#### What if There's Only One Admin?

If you have only one admin and they lose access, you'll need to create a new admin account first:

> **☝️ Important:** You can't use the same email for the new admin as the original admin.

1. Stop the application server
2. Set the `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL` environment variable to a new admin email or set it in the `.env` file:

   ```bash
   export IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL="newadmin@example.com"
   ```

3. Restart the server:

   ```bash
   owox serve
   ```

4. The system will automatically create the new admin and display a magic link in the server logs:

   ```text
   Primary admin 'newadmin@example.com' not found. Creating admin user...
   Primary admin created. Magic link: http://domain.com/auth/magic-link/...
   ```

5. Copy the magic link from the logs and use it to set up the new admin account
6. Once logged in as the new admin, you can reset the password for the original admin

> **⚠️ Security Note**: Only users with admin role can reset passwords. This action revokes all active sessions for the target user (except when resetting your own password).

### Managing User Details

On the User Details page (`/auth/user/{userId}`), admins can view:

- Full name
- Email address
- User role
- User ID
- Organization
- Password status (Yes/No)
- Account creation date
- Last update date

And perform actions:

- **Reset Password** / **Generate Magic Link**: Generate a new authentication link
- **Delete User**: Remove the user from the system (requires confirmation)

## Command Line Tools

You can also manage users via the command line:

### Add User

```bash
# Add a user and get a magic link
owox idp add-user user@example.com
```
