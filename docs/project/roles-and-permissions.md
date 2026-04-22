# Roles and Permissions

Every project member has one of three roles. A role controls what a member can do across the entire project — from managing users to creating and editing resources.

## Roles Overview

| Role | Access level |
|---|---|
| **Admin** | Full access to everything |
| **Technical User** | Create and manage data resources; full control over all Reports |
| **Business User** | Self-service reporting on shared Data Marts; manage own Reports and Destinations |

## Admin

Admins have unrestricted access to the entire project.

**Member management:**

- Invite members with any role
- Change any member's role
- Reset passwords and generate magic links
- Delete members

**Data access:**

- Create, edit, and delete any Data Mart, Storage, Destination, Report, Trigger, and Run — regardless of who created it

**Notifications:**

- Automatically subscribed to all project notification channels upon joining

---

## Technical User

Technical Users build and manage data infrastructure, and retain project-wide control over reporting.

**Member management:**

- Invite Technical Users and Business Users (cannot invite Admins)

**Data access:**

- Create, edit, and delete their own Data Marts, Storages, and Destinations
- Create, edit, delete, and manage Data Mart Triggers
- Configure sharing and manage owners for their own Data Marts, Storages, and Destinations
- Access Data Marts, Storages, and Destinations that other members have shared with them — the level of access depends on how the resource is shared (see [Access Rights](access-rights.md))
- Edit and delete any Report in the project, regardless of ownership
- Manage owners of any Report in the project
- Create, edit, and delete Report Triggers on any Report in the project

**Notifications:**

- Automatically subscribed to all project notification channels upon joining

---

## Business User

Business Users build and manage their own reporting assets on top of Data Marts prepared by Technical Users.

**Member management:**

- Invite Business Users only

**Data access:**

- View Data Marts and their Triggers that are shared with them
- Create Reports on Data Marts that are available for reporting
- Edit, delete, run, and manage owners of Reports they own
- Create, edit, and delete Report Triggers on Reports they own
- Create, edit, and delete Destinations
- Access Destinations that other members have shared with them

> ☝️ A Business User can only edit or run a Report as long as its Destination still exists. If the Destination is deleted, the Report becomes read-only for that owner until a Technical User restores the Destination or reassigns ownership.

**Notifications:**

- Not subscribed to notifications by default
- Automatically removed from notification receivers if their role is downgraded from Technical User

---

## Who Can Invite Whom

| Inviting as | Can invite Admin | Can invite Technical User | Can invite Business User |
|---|---|---|---|
| Admin | ✓ | ✓ | ✓ |
| Technical User | — | ✓ | ✓ |
| Business User | — | — | ✓ |
