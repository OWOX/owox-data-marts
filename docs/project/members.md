# Managing Project Members

Project members are the people who have access to your OWOX Data Marts project. Each member is assigned a role that determines what they can see and do — see [Roles and Permissions](roles-and-permissions.md) for details.

Only **Admins** can invite, edit, or remove members.

## Viewing Members

To see who has access to your project, navigate to the **Admin Dashboard** at `/auth/dashboard`. The list shows each member's name, email, role, and account status.

## Inviting a New Member

1. Open the **Admin Dashboard** at `/auth/dashboard`
2. Click **Add User**
3. Enter the member's email address
4. Select their role
5. Click **Generate Magic Link**
6. Share the generated link with the new member via email

> ☝️ **Important:** Share magic links via email only. Messaging apps may auto-open the URL and invalidate it before the recipient uses it.

The new member uses the link to set their password and sign in for the first time.

## Changing a Member's Role

1. Open the **Admin Dashboard** at `/auth/dashboard`
2. Find the member and click **View**
3. Update their role on the User Details page
4. Save the change

> ☝️ Downgrading a member from **Technical User** to **Business User** automatically removes them from all notification receivers lists.

## Resetting a Member's Password

1. Open the **Admin Dashboard** at `/auth/dashboard`
2. Find the member and click **View**
3. On the User Details page, click one of:
   - **Generate Magic Link** — if the member has not set a password yet
   - **Reset Password** — if the member already has a password (signs them out of all active sessions)
4. Copy the link from the green confirmation box
5. Share it with the member via email

## Removing a Member

1. Open the **Admin Dashboard** at `/auth/dashboard`
2. Find the member and click **View**
3. Click **Delete User** and confirm

Removing a member also cleans them up from all notification receivers lists.

## Created By

Every resource in OWOX Data Marts — Data Mart, Storage, Destination, Report, Trigger, Run — records who created it. This **Created By** field is permanent: it never changes, even if ownership is later transferred to someone else.

**Where it appears:**

- **Data Marts, Storages, Destinations, Reports** — displayed as a sortable column in each list view
- **Run history** — shown inline as "by [member name]" for manually triggered runs

**Creator becomes the initial owner.** When a member creates a resource, they are automatically assigned as its owner:

- Data Mart → assigned as **Technical Owner**
- Storage → assigned as **Owner**
- Destination → assigned as **Owner**
- Report → assigned as **Owner**

Triggers do not have dedicated ownership — they are managed through their parent entity (Data Mart or Report).

Ownership can be reassigned at any time from the resource settings page. The Created By record remains unchanged regardless.

**When a member is removed,** the Created By field retains the original record internally, but the member's name is no longer displayed — the column shows "—" instead. Resources they created are not deleted and remain fully accessible to their current owners.

## Command Line

You can add a member directly from the CLI:

```bash
owox idp add-user user@example.com
```

---

For initial admin account setup, recovery scenarios, and identity provider configuration, see [Better Auth Setup](../getting-started/setup-guide/members-management/better-auth.md).
