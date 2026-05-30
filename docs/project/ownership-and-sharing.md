# Ownership and Sharing

A member's [role](roles-and-permissions.md) defines their capabilities across the whole project. **Access rights** go one level deeper: they control what a member can do with a specific resource, based on two factors — their **ownership status** and the resource's **availability settings**.

---

## Permission Model

Access to a specific resource is decided by combining several **paths**:

- The member's **role** (Project Admin, Technical User, Business User).
- Their **ownership status** for the resource (Technical Owner, Business Owner, Owner, or non-owner).
- The resource's **availability** toggles (*Shared for use* / *Shared for reporting*, *Shared for maintenance*).
- The member's **role scope** and assigned **contexts** (for non-owners with `Selected contexts only`).

**Permissions are additive.** When more than one path applies, the member receives the **union** of allowed actions from all valid paths. Being assigned as an owner can only add access — it never reduces what the member could already do without that assignment.

Two paths combine into the final decision:

1. **Ownership floor** — what the ownership assignment alone grants (e.g. a Business Owner is guaranteed *See* and *Use* of the Data Mart). This path bypasses the context gate; ownership of a resource implies visibility of it.
2. **Non-owner sharing path** — what any member of the same role would be able to do on the resource given its availability toggles (e.g. a Technical User on a Data Mart that is *Shared for maintenance* can edit, delete, and manage triggers). This path is gated by role scope and contexts even for owners — being an owner of one resource does not lift the context restriction for actions that come from the shared sharing path.

The following restrictions still apply on top of the union:

- **Role gate** — a Business User never gains maintenance-level actions on Storages or Data Marts, even when they are an owner; that level of access requires the Technical User role or Project Admin.
- **Sharing gate** — non-owners only get the actions enabled by the resource's sharing toggles. Ownership guarantees See + Use even when the resource is not shared.
- **Context gate** — for `Selected contexts only` members, at least one context must overlap between the member and the resource for the non-owner sharing path to apply. The ownership floor still grants See + Use regardless of overlap.
- **Owner-only and admin-only actions** — *Configure Sharing* and *Manage Owners* require a Technical Owner with Technical User role (for Data Marts and Storages), or a Project Admin. They are never granted through sharing or non-owner paths.

Project Admins bypass all of the above and have full access to every resource.

---

## Ownership

Every resource — [Storage](../storages/manage-storages.md), Data Mart, [Destination](../destinations/manage-destinations.md), Report — has owners. Any project member can be assigned as an owner. The member who creates a resource is automatically assigned as its first owner. Additional owners can be assigned from the resource settings page.

Most resources have a single **Owner** role. Data Marts are the exception — they support two distinct owner types:

| Owner type | Responsibility | Access level |
|---|---|---|
| **Technical Owner** | Data definition, schema, and source connections | Full control |
| **Business Owner** | Business requirements and usage | Guaranteed See + Use; further actions inherit what the same user would have as a non-owner of their role |

A Data Mart may have multiple Technical Owners and multiple Business Owners. Ownership is additive — being assigned as an owner only adds access (guaranteed visibility, and, where the role permits, maintenance through the availability toggle); it never reduces what the user could already do without the assignment.

![Data Mart settings showing Technical Owner and Business Owner fields with assigned project members](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/c12de869-ff73-4a5e-16f6-5ff26fcee900/public)

**What an owner can do depends on their role.** For Destinations and Reports, owners have full control regardless of role. For Data Marts and Storages, full control requires Technical User or Project Admin:

| Entity | Owner type | Full control requires |
|---|---|---|
| Data Mart | Technical Owner | Technical User or Project Admin |
| Storage | Owner | Technical User or Project Admin |
| Destination | Owner | Any role |
| Report | Owner | Any role |

A Business User can be assigned as a Data Mart Technical Owner or Storage Owner, but the role does not support full ownership until it changes to Technical User:

- **Data Mart Technical Owner (Business User)** — can view and use the Data Mart, but cannot edit, delete, or manage it.
- **Storage Owner (Business User)** — has no access to the Storage.

A warning for Data Mart Technical Owners with an insufficient role appears on the [**Notification Settings**](../notifications/notification-settings.md) page.

![Notification Settings page displaying an ownership warning that a Business User is assigned as Technical Owner or Storage Owner](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/dd506d9e-b7c7-4223-c0c9-d7da07224900/public)

**Triggers do not have dedicated ownership.** Data Mart Triggers are managed under their parent Data Mart; [Report Triggers](../getting-started/setup-guide/report-triggers.md) are managed under their parent Report. Access to triggers follows the access rules of the parent entity.

---

## Sharing

Sharing settings control what non-owners can do with a resource. Owners and Project Admins always have full access regardless of sharing settings.

Each resource has two independent availability toggles. The first toggle name differs by entity type:

- **Data Mart** — first toggle is **Shared for reporting**
- **Storage, Destination** — first toggle is **Shared for use**

The second toggle is **Shared for maintenance** for all resource types. The combination of the two toggles determines what non-owners can do:

| State | What non-owners can do |
|---|---|
| Both toggles off | Not visible — only owners and Project Admins can see the resource |
| First toggle on, second off | Can see and use the resource — for example, view a Data Mart and build reports on it, or link a Storage to their own Data Mart |
| First toggle off, second on | Can see, use, edit, and delete the resource |
| Both toggles on | Both of the above |

> ☝️ New resources start with both toggles off. Existing resources were migrated to both toggles on to preserve previous access patterns. Owners can gradually reconfigure availability to match their intended access model.

![Resource settings page with the Shared for reporting and Shared for maintenance toggles](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/f8622cf6-8d75-46ee-e9e2-b869f987a500/public)

**Who can configure sharing** depends on the entity type and the owner's role:

| Entity | Can configure sharing |
|---|---|
| Data Mart | Technical Owner with Technical User or Project Admin role; Project Admin |
| Storage | Owner with Technical User or Project Admin role; Project Admin |
| Destination | Any Owner (including Business User); Project Admin |

---

## Actions

The following actions can be granted or restricted by the combination of ownership and availability settings:

| Action | Description |
|---|---|
| **See** | View the resource in lists and open its detail page |
| **Use** | Link the resource to other entities (e.g. attach a Storage to a Data Mart) |
| **Edit** | Modify the resource configuration |
| **Delete** | Remove the resource |
| **Copy Credentials** | Access connection credentials *(Storage, Destination)* |
| **Configure Sharing** | Change the sharing settings of the resource |
| **Manage Owners** | Assign or revoke ownership |
| **Manage Triggers** | Create, edit, or delete triggers *(Data Mart)* |
| **Run** | Execute the Report manually *(Report)* |

**Who can manage owners** per entity type:

| Entity | Can manage owners |
|---|---|
| Data Mart | Technical Owner with Technical User or Project Admin role; Project Admin |
| Storage | Owner with Technical User or Project Admin role; Project Admin |
| Destination | Any Owner (including Business User); Project Admin |
| Report | Technical User with Data Mart maintenance access; Report Owner with active Destination; Project Admin |

---

## Access by Entity

**Project Admin** always has full access to all actions on all resources and is not listed in the tables below.

### Storage

| Who | Not shared | Shared for use | Shared for maintenance | Shared for both |
|---|---|---|---|---|
| **Owner (Technical User)** | All actions | All actions | All actions | All actions |
| **Non-owner Technical User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |
| **Any Business User** | No access | No access | No access | No access |

> ☝️ Business Users do not have direct access to Storages. They interact with data through Data Marts and Destinations available to them.

---

### Data Mart

| Who | Not shared | Shared for reporting | Shared for maintenance | Shared for both |
|---|---|---|---|---|
| **Technical Owner (Technical User)** | All actions | All actions | All actions | All actions |
| **Technical Owner (Business User)** | See, Use | See, Use | See, Use | See, Use |
| **Business Owner (Technical User)** | See, Use | See, Use | See, Use; + Edit, Delete, Manage Triggers via non-owner path [1] | See, Use; + Edit, Delete, Manage Triggers via non-owner path [1] |
| **Business Owner (Business User)** | See, Use | See, Use | See, Use | See, Use |
| **Non-owner Technical User** | No access [2] | See, Use [2] | See, Use, Edit, Delete, Manage Triggers [2] | See, Use, Edit, Delete, Manage Triggers [2] |
| **Non-owner Business User** | No access [2] | See, Use [2] | No access [2] | See, Use [2] |

[1] The maintenance actions in the **Business Owner (Technical User)** row are granted through the non-owner sharing path. Under `Selected contexts only` scope they require a context overlap between the member and the Data Mart; the See + Use floor is still granted without overlap.

[2] Non-owner access is subject to the context gate: under `Selected contexts only` scope, all actions in these rows require a context overlap between the member and the Data Mart.

> ☝️ When a Data Mart is shared for maintenance, Business Users who are not owners still cannot access it — maintenance access is reserved for Technical Users.

---

### Data Mart Trigger

Data Mart Triggers have no dedicated ownership. Who can see them and who can manage them follows the parent Data Mart.

| Who | Can see | Can manage (create, edit, delete) |
|---|---|---|
| **Technical Owner (Technical User)** | Yes | Yes |
| **Technical Owner (Business User)** | Yes | No |
| **Business Owner (Technical User)** of parent Data Mart shared for maintenance | Yes | Yes, via non-owner path [1] |
| **Business Owner (Technical User)** of parent Data Mart not shared for maintenance | Yes | No |
| **Business Owner (Business User)** of parent Data Mart | Yes | No |
| **Non-owner Technical User** (DM shared for maintenance) | Yes [2] | Yes [2] |
| **Non-owner Technical User** (DM shared for reporting only) | Yes [2] | No |
| **Non-owner Business User** (DM visible) | Yes [2] | No |

[1] Under `Selected contexts only` scope this requires a context overlap between the member and the parent Data Mart.

[2] Under `Selected contexts only` scope this requires a context overlap between the member and the parent Data Mart.

---

### Destination

The owner of a Destination has full control regardless of their role — even a Business User who created a Destination manages it completely.

| Who | Not shared | Shared for use | Shared for maintenance | Shared for both |
|---|---|---|---|---|
| **Owner (any role)** | All actions | All actions | All actions | All actions |
| **Non-owner Technical User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |
| **Non-owner Business User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |

---

### Report

Reports do not have availability settings. **Visibility follows the parent Data Mart** — if you can see a Data Mart, you can see all Reports built on it.

Access to edit, delete, or run a Report requires one of two conditions:

| Who | Can see | Can edit, delete, or run |
|---|---|---|
| **Has Data Mart maintenance access** [1] | Yes | Yes — for all Reports on that Data Mart |
| **Report Owner** (Destination exists) | Yes | Yes |
| **Report Owner** (Destination deleted) | Yes | No — read-only until Destination is restored or replaced |
| **DM visible without maintenance access** | Yes | No |

[1] "Has Data Mart maintenance access" means the user receives `Edit` on the parent Data Mart through any path defined in the [Data Mart access table](#data-mart) — that is, Technical Owner with Technical User role, or Technical User (including a Business Owner who is a Technical User) receiving maintenance through the non-owner sharing path on a Data Mart that is *Shared for maintenance*. The non-owner sharing path is gated by role scope and contexts; the Report-level decision inherits that gate.

> ☝️ A Report owner can edit, delete, and run the Report only while its Destination still exists. If the Destination is deleted, the owner can still see the Report but cannot edit, delete, or run it until the Destination is restored or ownership is reassigned by a Technical User.

---

### Report Trigger

[Report Triggers](../getting-started/setup-guide/report-triggers.md) have no dedicated ownership. Who can see them and who can manage them follows the parent Report.

| Who | Can see | Can manage (create, edit, delete) |
|---|---|---|
| **Has Data Mart maintenance access** [1] | Yes | Yes — for all Report Triggers on that Data Mart |
| **Report Owner** (Destination exists) | Yes | Yes — for own Report's triggers only |
| **Report Owner** (Destination deleted) | Yes | No |
| **DM visible without maintenance access** | Yes | No |

[1] Defined under [Report](#report) above — includes any path that grants `Edit` on the parent Data Mart, with the same role scope / context gating.
