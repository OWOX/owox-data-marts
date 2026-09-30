# Project Settings

**Project Settings** is where Project Admins manage the people, permissions, and keys of an OWOX Data Marts project.

## What Project Settings covers

A project is the workspace that holds your [Data Marts](../data-marts/), [Storages](../storages/), [Destinations](../destinations/), and [Reports](../reports/). Project Settings controls who belongs to it and what each person can do.

Every member has one of three roles:

| Role | Access level |
| --- | --- |
| **Project Admin** | Full access across all entities |
| **Technical User** | Builds and maintains data resources |
| **Business User** | Self-service reporting on shared Data Marts |

Access to a specific resource combines the member's role, their ownership status, and the resource's sharing settings. [Contexts](./contexts.md) add business-domain labels, such as Marketing or Finance. They limit visibility only for members whose **Role scope** is **Selected contexts only**.

## When to use Project Settings

- You invite teammates and assign them roles.
- Different teams should see different subsets of Data Marts, Storages, or Destinations.
- You want a clear owner for each Storage, Destination, and Report.
- A self-managed deployment needs a license key from your Cloud project.

## Get started

1. Open **Project Settings → Members** and invite your team.
2. Assign each member a [role](./roles-and-permissions.md).
3. If teams need scoped visibility, add [Contexts](./contexts.md) and attach them to resources. Then set members' **Role scope** to **Selected contexts only**.

## Learn more

| Need | Read |
| --- | --- |
| Invite, remove, or provision members | [Managing Project Members](./members.md) |
| Understand the three roles in detail | [Roles and Permissions](./roles-and-permissions.md) |
| Control access to specific resources | [Ownership and Sharing](./ownership-and-sharing.md) |
| Scope visibility by business domain | [Contexts](./contexts.md) |
| Connect a self-managed deployment to Cloud | [License Keys](./license-keys.md) |
| Alert the team about run results | [Notification Settings](../notifications/notification-settings.md) |
