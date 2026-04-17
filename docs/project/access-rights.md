# Access Rights

A member's [role](roles-and-permissions.md) defines their capabilities across the whole project. **Access rights** go one level deeper: they control what a member can do with a specific resource, based on two factors — their **ownership status** and the resource's **sharing state**.

---

## Ownership

Every resource — Storage, Data Mart, Destination, Report — has owners. Owners always have full control over their resource, regardless of how it is shared.

The member who creates a resource is automatically assigned as its owner. Owners can assign additional owners from the resource settings page.

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

> ☝️ A Business Owner can be any project member regardless of their role. However, their access to the Data Mart is limited to viewing and running it — they cannot edit or delete it.

**Triggers do not have dedicated ownership.** Data Mart Triggers are managed under their parent Data Mart; Report Triggers are managed under their parent Report. Access to triggers follows the access rules of the parent entity.

---

## Sharing States

By default, a new resource is **not shared** — only its owners and Admins can see it. An owner can change the sharing state to give other project members access.

| Sharing state | What it enables |
|---|---|
| **Not Shared** | Visible only to owners and Admins |
| **Shared for Reporting** | Others can view and run the Data Mart *(Data Mart only)* |
| **Shared for Use** | Others can view and use the resource — for example, link a shared Storage to their own Data Mart *(Storage, Destination)* |
| **Shared for Maintenance** | Others can view, use, edit, and delete the resource |
| **Shared for Both** | Combines reporting/use access with maintenance access |

Only the resource's owner or an Admin can configure the sharing state.

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
| **Configure Sharing** | Change who can access the resource and how |
| **Manage Owners** | Assign or revoke ownership |
| **Manage Triggers** | Create, edit, or delete triggers *(Data Mart)* |
| **Run** | Execute the resource manually |

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

### Destination

Destinations are the one exception to role-based restrictions: the **owner of a Destination has full control regardless of their role** — even a Business User who created a Destination manages it completely.

| Who | Not Shared | Shared for Use | Shared for Maintenance | Shared for Both |
|---|---|---|---|---|
| **Owner (any role)** | All actions | All actions | All actions | All actions |
| **Non-owner Technical User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |
| **Non-owner Business User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |
