# Roles and Permissions

Each project member has one of three roles.

## Roles Overview

| Role | Access level |
|---|---|
| **Project Admin** | Full access across all entities |
| **Technical User** | Build and maintain data resources; can edit any Report they have access to |
| **Business User** | Self-service reporting on Data Marts available to them; manage own Reports and Destinations |

## Project Admin

Assigned to members who manage the project team and need full access to all resources.

**Project administration:**

- Manage project members

**Data access:**

- Create, edit, and delete any Data Mart, Storage, Destination, Report, and Trigger
- Full owner and availability management

**Notifications:**

- Included in default notification receivers

---

## Technical User

Assigned to members who build and maintain the data infrastructure — creating Data Marts, Storages, Destinations, and report pipelines.

**Data access:**

- Create and manage Data Marts, Storages, and Destinations
- Create Reports using Data Marts and Destinations they have access to
- What they can do with a specific resource depends on their ownership status and the resource's availability settings (see [Ownership and Availability](ownership-and-availability.md))
- Manage scheduled triggers for Data Marts they have maintenance access to
- Edit, delete, run, and manage owners of Reports they have access to — either through maintenance access to the parent Data Mart, or as the Report owner

**Notifications:**

- Included in default notification receivers

---

## Business User

Assigned to members who create and run reports on data prepared by Technical Users, without needing access to the underlying infrastructure.

**Data access:**

- View Data Marts and their scheduled triggers made available to them
- Create Reports on Data Marts available for reporting, using Destinations they have access to
- Edit, delete, and run Reports they own
- Create and manage Destinations they own or have maintenance access to
- Cannot create, edit, or delete Data Marts, Storages, or Data Mart scheduled triggers

> ☝️ A Report owner can edit, delete, or run a Report only while its Destination still exists. If the Destination is deleted, the Report becomes read-only for that owner until the Destination is restored or ownership is reassigned.

**Notifications:**

- Not included in default receivers
- Removed from all notification receiver lists when downgraded from Technical User
