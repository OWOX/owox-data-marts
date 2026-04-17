# Roles and Permissions

Every project member has one of three roles. A role controls what a member can do across the entire project — from managing users to creating and editing resources.

## Roles Overview

| Role | Typical user | Access level |
|---|---|---|
| **Admin** | Data team lead, IT admin | Full access to everything |
| **Technical User** | Data analyst, data engineer | Create and manage own resources |
| **Business User** | Analyst, marketer, business stakeholder | View and use shared resources |

---

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

Technical Users build and manage data resources, and can share them with others.

**Member management:**

- Invite Technical Users and Business Users (cannot invite Admins)

**Data access:**

- Create, edit, and delete their own Data Marts, Storages, Destinations, Reports, Triggers, and Runs
- Configure sharing and manage owners for their own resources
- Access resources that other members have shared with them — the level of access depends on how the resource is shared (see [Access Rights](access-rights.md))

**Notifications:**

- Automatically subscribed to all project notification channels upon joining

---

## Business User

Business Users consume data that has been prepared and shared for them. They cannot create or modify resources.

**Member management:**

- Invite Business Users only

**Data access:**

- View and use Data Marts, Storages, Destinations, Reports, Triggers, and Runs that are explicitly shared with them

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
