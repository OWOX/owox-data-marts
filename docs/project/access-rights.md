# Access Rights

A member's [role](roles-and-permissions.md) defines their capabilities across the whole project. **Access rights** go one level deeper: they control what a member can do with a specific resource, based on two factors — their **ownership status** and the resource's **sharing state**.

---

## Ownership

Every resource — Storage, Data Mart, Destination, Report — has owners. The member who creates a resource is automatically assigned as its owner. Owners can assign additional owners from the resource settings page.

| Entity | Owner type | Who can be owner |
|---|---|---|
| **Storage** | Owner | Technical Users |
| **Data Mart** | Technical Owner | Technical Users |
| **Data Mart** | Business Owner | Any role |
| **Destination** | Owner | Any role |
| **Report** | Owner | Any role |

**Data Marts support two distinct owner types:**

| Owner type | Responsibility | Access level |
|---|---|---|
| **Technical Owner** | Data definition, schema, and source connections | Full control |
| **Business Owner** | Business requirements and usage | View and use only |

> ☝️ A Business Owner can be any project member regardless of their role. Their access to the Data Mart is limited to viewing and running it — they cannot edit, delete, or configure sharing.

**Effective ownership depends on role.** For Data Marts and Storages, owner-level maintenance access only activates when the owner's role is Technical User or Admin:

| Entity | Owner type | Requires Technical User or Admin role? |
|---|---|---|
| Data Mart | Technical Owner | Yes — stored but inactive if Business User |
| Storage | Owner | Yes — stored but inactive if Business User |
| Destination | Owner | No — effective for any role |
| Report | Owner | No — effective for any role |

If a Business User is assigned as Technical Owner of a Data Mart or as Storage Owner, the assignment is stored but grants no maintenance access until the member's role changes to Technical User. The product shows a warning when this situation is detected.

**Triggers do not have dedicated ownership.** Data Mart Triggers are managed under their parent Data Mart; Report Triggers are managed under their parent Report. Access to triggers follows the access rules of the parent entity.

---

## Sharing States

Sharing controls what non-owners can do with a resource. Owners and Admins always have full access regardless of sharing state.

Each resource has two independent sharing toggles. The combination determines the effective sharing state:

| Sharing state | What it enables for non-owners |
|---|---|
| **Not Shared** | Visible only to owners and Admins |
| **Shared for Reporting** | Others can view and run the Data Mart *(Data Mart only)* |
| **Shared for Use** | Others can view and use the resource — for example, link a shared Storage to their own Data Mart *(Storage, Destination)* |
| **Shared for Maintenance** | Others can view, use, edit, and delete the resource |
| **Shared for Both** | Both reporting/use and maintenance toggles are enabled |

> ☝️ New resources start as **Not Shared**. Existing resources were migrated to **Shared for Both** to preserve previous access patterns. Owners can gradually reconfigure sharing to match their intended access model.

**Who can configure sharing** depends on the entity type and the owner's role:

| Entity | Can configure sharing |
|---|---|
| Data Mart | Technical Owner with Technical User or Admin role; Admin |
| Storage | Owner with Technical User or Admin role; Admin |
| Destination | Any Owner (including Business User); Admin |

---

## Actions

The following actions can be granted or restricted by the combination of ownership and sharing state:

| Action | Description |
|---|---|
| **See** | View the resource in lists and open its detail page |
| **Use** | Link the resource to other entities (e.g. attach a Storage to a Data Mart) |
| **Edit** | Modify the resource configuration |
| **Delete** | Remove the resource |
| **Copy Credentials** | Access connection credentials *(Storage, Destination)* |
| **Configure Sharing** | Change the sharing state of the resource |
| **Manage Owners** | Assign or revoke ownership |
| **Manage Triggers** | Create, edit, or delete triggers *(Data Mart)* |
| **Run** | Execute the resource manually |

**Who can manage owners** per entity type:

| Entity | Can manage owners |
|---|---|
| Data Mart | Technical Owner with Technical User or Admin role; Admin |
| Storage | Owner with Technical User or Admin role; Admin |
| Destination | Any Owner (including Business User); Admin |
| Report | Any member who can currently mutate the Report |

---

## Access by Entity

**Admin** always has full access to all actions on all resources and is not listed in the tables below.

### Storage

| Who | Not Shared | Shared for Use | Shared for Maintenance | Shared for Both |
|---|---|---|---|---|
| **Owner (Technical User)** | All actions | All actions | All actions | All actions |
| **Non-owner Technical User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |
| **Any Business User** | No access | No access | No access | No access |

> ☝️ Business Users do not have direct access to Storages. They interact with data through shared Data Marts and Destinations.

---

### Data Mart

| Who | Not Shared | Shared for Reporting | Shared for Maintenance | Shared for Both |
|---|---|---|---|---|
| **Technical Owner (Technical User)** | All actions | All actions | All actions | All actions |
| **Business Owner (any role)** | See, Use | See, Use | See, Use | See, Use |
| **Non-owner Technical User** | No access | See, Use | See, Use, Edit, Delete, Manage Triggers | See, Use, Edit, Delete, Manage Triggers |
| **Non-owner Business User** | No access | See, Use | No access | See, Use |

> ☝️ When a Data Mart is shared for maintenance, Business Users who are not owners still cannot access it — maintenance access is reserved for Technical Users.

---

### Data Mart Trigger

Data Mart Triggers have no dedicated ownership. Visibility and mutation access follow the parent Data Mart.

| Who | Can see | Can manage (create, edit, delete) |
|---|---|---|
| **Technical Owner of parent Data Mart** | Yes | Yes |
| **Business Owner of parent Data Mart** | Yes | No |
| **Non-owner Technical User** (DM shared for maintenance) | Yes | Yes |
| **Non-owner Technical User** (DM shared for reporting only) | Yes | No |
| **Non-owner Business User** (DM visible) | Yes | No |

---

### Destination

The owner of a Destination has full control regardless of their role — even a Business User who created a Destination manages it completely.

| Who | Not Shared | Shared for Use | Shared for Maintenance | Shared for Both |
|---|---|---|---|---|
| **Owner (any role)** | All actions | All actions | All actions | All actions |
| **Non-owner Technical User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |
| **Non-owner Business User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |

---

### Report

Reports do not have sharing states. **Visibility follows the parent Data Mart** — if you can see a Data Mart, you can see all Reports built on it.

Mutation access (edit, delete, run, manage owners, manage triggers) is governed by a two-path model:

| Who | Can see | Can mutate |
|---|---|---|
| **Has Data Mart maintenance access** (Technical Owner, or DM shared for maintenance with a Technical User) | Yes | Yes — for all Reports on that Data Mart |
| **Report Owner** (Destination exists) | Yes | Yes |
| **Report Owner** (Destination deleted) | Yes | No — read-only until Destination is restored or replaced |
| **Business Owner of parent Data Mart** | Yes | No |
| **Non-owner without DM maintenance access** | Yes, if DM is visible | No |

> ☝️ A Report owner is **effective** only when the Report's Destination still exists. An ineffective owner can still see the Report but cannot edit, delete, or run it. A Technical User can restore access by updating the Destination or reassigning Report ownership.

---

### Report Trigger

Report Triggers have no dedicated ownership. Visibility and mutation access follow the parent Report.

| Who | Can see | Can manage (create, edit, delete) |
|---|---|---|
| **Has Data Mart maintenance access** | Yes | Yes — for all Report Triggers on that Data Mart |
| **Effective Report Owner** | Yes | Yes — for own Report's triggers only |
| **Ineffective Report Owner** (Destination deleted) | Yes | No |
| **Non-owner** (DM visible) | Yes | No |
