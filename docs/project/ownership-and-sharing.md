# Ownership and Sharing

A member's [role](roles-and-permissions.md) defines their capabilities across the whole project. **Access rights** go one level deeper: they control what a member can do with a specific resource, based on two factors — their **ownership status** and the resource's **sharing settings**.

---

## Permission Model

Access to a specific resource is decided by combining several **paths**:

- The member's **role** (Project Admin, Data Owner, Business User).
- Their **ownership status** for the resource (Data Owner, Business Owner, Owner, or non-owner).
- The resource's **sharing** toggles (*Shared for use* / *Shared for reporting*, *Shared for maintenance*).
- The member's **role scope** and assigned **contexts** (for non-owners with `Selected contexts only`).

**Permissions are additive.** When more than one path applies, the member receives the **union** of allowed actions from all valid paths. Being assigned as an owner can only add access — it never reduces what the member could already do without that assignment.

Two paths combine into the final decision:

1. **Ownership floor** — what the ownership assignment alone grants (e.g. a Business Owner is guaranteed *See* and *Use* of the Data Mart). This path bypasses the context gate; ownership of a resource implies visibility of it.
2. **Non-owner sharing path** — what any member of the same role would be able to do on the resource given its sharing toggles (e.g. a member with the Data Owner role on a Data Mart that is *Shared for maintenance* can edit, delete, and manage triggers). This path is gated by role scope and contexts even for owners — being an owner of one resource does not lift the context restriction for actions that come from the shared sharing path.

The following restrictions still apply on top of the union:

- **Role gate** — a Business User never gains maintenance-level actions on Storages or Data Marts, even when they are an owner; that level of access requires the Data Owner role or Project Admin.
- **Sharing gate** — non-owners only get the actions enabled by the resource's sharing toggles. Ownership guarantees See + Use even when the resource is not shared.
- **Context gate** — for `Selected contexts only` members, at least one context must overlap between the member and the resource for the non-owner sharing path to apply. The ownership floor still grants See + Use regardless of overlap.
- **Owner-only and admin-only actions** — *Configure Sharing* and *Manage Owners* require a Data Owner with the Data Owner role (for Data Marts and Storages), or a Project Admin. They are never granted through sharing or non-owner paths.

Project Admins bypass all of the above and have full access to every resource.

---

## Ownership

Every resource — [Storage](../storages/manage-storages.md), Data Mart, [Destination](../destinations/manage-destinations.md), Report — has owners. Any project member can be assigned as an owner. The member who creates a resource is automatically assigned as its first owner. Additional owners can be assigned from the resource settings page.

Most resources have a single **Owner** role. Data Marts are the exception — they support two distinct owner types:

| Owner type | Responsibility | Access level |
|---|---|---|
| **Data Owner** | Data definition, schema, and source connections | Full control |
| **Business Owner** | Business requirements and usage | Guaranteed See + Use; further actions inherit what the same user would have as a non-owner of their role |

A Data Mart may have multiple Data Owners and multiple Business Owners. Ownership is additive — being assigned as an owner only adds access (guaranteed visibility, and, where the role permits, maintenance through the sharing toggle); it never reduces what the user could already do without the assignment.

![Ownership section of a Data Mart Overview tab with the Data Owner and Business Owner fields](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/9f05e842-3f4d-4677-6672-6dfb6852f600/public)

**What an owner can do depends on their role.** For Destinations and Reports, owners have full control regardless of role. For Data Marts and Storages, full control requires the Data Owner or Project Admin role:

| Entity | Owner type | Full control requires |
|---|---|---|
| Data Mart | Data Owner | Data Owner or Project Admin |
| Storage | Owner | Data Owner or Project Admin |
| Destination | Owner | Any role |
| Report | Owner | Any role |

A Business User can be assigned as a Data Mart Data Owner or Storage Owner, but the role does not support full ownership until it changes to Data Owner:

- **Data Mart Data Owner (Business User role)** — can view and use the Data Mart, but cannot edit, delete, or manage it.
- **Storage Owner (Business User)** — has no access to the Storage.

**Triggers do not have dedicated ownership.** Data Mart Triggers are managed under their parent Data Mart; [Report Triggers](../getting-started/setup-guide/report-triggers.md) are managed under their parent Report. Access to triggers follows the access rules of the parent entity.

---

## Sharing

Sharing settings control what non-owners can do with a resource. Owners and Project Admins always have full access regardless of sharing settings.

Each resource has two independent sharing toggles. The first toggle name differs by entity type:

- **Data Mart** — first toggle is **Shared for reporting**
- **Storage, Destination** — first toggle is **Shared for use**

The second toggle is **Shared for maintenance** for all resource types. The combination of the two toggles determines what non-owners can do:

| State | What non-owners can do |
|---|---|
| Both toggles off | Not visible — only owners and Project Admins can see the resource |
| First toggle on, second off | Can see and use the resource — for example, view a Data Mart and build reports on it, or link a Storage to their own Data Mart |
| First toggle off, second on | Can see, use, edit, and delete the resource |
| Both toggles on | Both of the above |

### Defaults for new resources

| Resource | Shared for reporting / use | Shared for maintenance |
|---|---|---|
| Data Mart | On | On |
| Storage | On | Off |
| Destination | On | Off |

A new Data Mart is shared for maintenance so that other members with the Data Owner role can join it to their own Data Marts right away, without asking the owner for access first. If you do not want that, turn **Shared for maintenance** off on the Data Mart — non-owners keep reporting access and lose the ability to edit or join it.

> ☝️ Changing the default does not touch Data Marts that already exist. Resources created before the sharing model was introduced were migrated to both toggles on to preserve previous access patterns.

![Sharing section of a Data Mart Overview tab with the Shared for maintenance and Shared for reporting toggles](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/39afa474-1851-460e-e19e-c652a9974a00/public)

**Who can configure sharing** depends on the entity type and the owner's role:

| Entity | Can configure sharing |
|---|---|
| Data Mart | Data Owner with the Data Owner or Project Admin role; Project Admin |
| Storage | Owner with the Data Owner or Project Admin role; Project Admin |
| Destination | Any Owner (including Business User); Project Admin |

---

## Actions

The following actions can be granted or restricted by the combination of ownership and sharing settings:

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
| Data Mart | Data Owner with the Data Owner or Project Admin role; Project Admin |
| Storage | Owner with the Data Owner or Project Admin role; Project Admin |
| Destination | Any Owner (including Business User); Project Admin |
| Report | Data Owner role with Data Mart maintenance access; Report Owner with active Destination; Project Admin |

---

## Access by Entity

**Project Admin** always has full access to all actions on all resources and is not listed in the tables below.

### Storage

| Who | Not shared | Shared for use | Shared for maintenance | Shared for both |
|---|---|---|---|---|
| **Owner (Data Owner role)** | All actions | All actions | All actions | All actions |
| **Owner (Business User)** | No access [1] | No access [1] | No access [1] | No access [1] |
| **Non-owner with the Data Owner role** | No access | See, Use [2] | See, Use, Copy Credentials, Edit, Delete [2] | See, Use, Copy Credentials, Edit, Delete [2] |
| **Any Business User (non-owner)** | No access | No access | No access | No access |

[1] A Business User assigned as Storage Owner has no access until their role changes to Data Owner.

[2] Under `Selected contexts only` scope, these actions require a context overlap between the member and the Storage.

> ☝️ Business Users do not have direct access to Storages. They interact with data through Data Marts and Destinations shared with them.

---

### Data Mart

| Who | Not shared | Shared for reporting | Shared for maintenance | Shared for both |
|---|---|---|---|---|
| **Data Owner (Data Owner role)** | All actions | All actions | All actions | All actions |
| **Data Owner (Business User role)** | See, Use | See, Use | See, Use | See, Use |
| **Business Owner (Data Owner role)** | See, Use | See, Use | See, Use; + Edit, Delete, Manage Triggers via non-owner path [1] | See, Use; + Edit, Delete, Manage Triggers via non-owner path [1] |
| **Business Owner (Business User)** | See, Use | See, Use | See, Use | See, Use |
| **Non-owner with the Data Owner role** | No access [2] | See, Use [2] | See, Use, Edit, Delete, Manage Triggers [2] | See, Use, Edit, Delete, Manage Triggers [2] |
| **Non-owner Business User** | No access [2] | See, Use [2] | No access [2] | See, Use [2] |

[1] The maintenance actions in the **Business Owner (Data Owner role)** row are granted through the non-owner sharing path. Under `Selected contexts only` scope they require a context overlap between the member and the Data Mart; the See + Use floor is still granted without overlap.

[2] Non-owner access is subject to the context gate: under `Selected contexts only` scope, all actions in these rows require a context overlap between the member and the Data Mart.

> ☝️ When a Data Mart is shared for maintenance, Business Users who are not owners still cannot access it — maintenance access is reserved for the Data Owner role.

---

### Data Mart Trigger

Data Mart Triggers have no dedicated ownership. Who can see them and who can manage them follows the parent Data Mart.

| Who | Can see | Can manage (create, edit, delete) |
|---|---|---|
| **Data Owner (Data Owner role)** | Yes | Yes |
| **Data Owner (Business User role)** | Yes | No |
| **Business Owner (Data Owner role)** of parent Data Mart shared for maintenance | Yes | Yes, via non-owner path [1] |
| **Business Owner (Data Owner role)** of parent Data Mart not shared for maintenance | Yes | No |
| **Business Owner (Business User)** of parent Data Mart | Yes | No |
| **Non-owner with the Data Owner role** (Data Mart shared for maintenance) | Yes [2] | Yes [2] |
| **Non-owner with the Data Owner role** (Data Mart shared for reporting only) | Yes [2] | No |
| **Non-owner Business User** (Data Mart visible) | Yes [2] | No |

[1] Under `Selected contexts only` scope this requires a context overlap between the member and the parent Data Mart.

[2] Under `Selected contexts only` scope this requires a context overlap between the member and the parent Data Mart.

---

### Joinable Data Mart

Relationships between Data Marts have no dedicated ownership. They belong to the source Data Mart and follow its access rules. See [Joinable Data Marts](../getting-started/setup-guide/joinable-data-marts.md) to configure them.

**Creating a relationship** requires `Edit` access on both the source and target Data Marts. The user needs maintenance access on each Data Mart, through one of two paths. First: a Data Owner with the Data Owner role. Second: a member with the Data Owner role on a Data Mart *Shared for maintenance*. Because a new Data Mart is *Shared for maintenance* by default, any member with the Data Owner role can join it without the owner changing anything; turning that toggle off on a Data Mart also stops others from joining it.

**Editing or deleting a relationship** requires `Edit` access on the source Data Mart only.

**Using joined fields in a report** does not require maintenance access. Any member who sees the source Data Mart can pick joined fields in the Report Columns picker. Two access conditions apply:

- The target Data Mart is also visible to them, through ownership or sharing.
- The relationship is complete: it has at least one join condition, and the target Data Mart is published (not a draft).

Access alone does not guarantee a field appears. The relationship must keep **Allow for reporting** on, and the field must not be hidden through **Hide from reports**. See [Joinable Data Marts](../getting-started/setup-guide/joinable-data-marts.md) for these field-exposure controls.

| Who | Can see relationships | Can create | Can edit or delete |
|---|---|---|---|
| **Data Owner (Data Owner role)** of source Data Mart | Yes | Yes, if also has `Edit` on target Data Mart | Yes |
| **Data Owner (Business User role)** of source Data Mart | Yes | No | No |
| **Business Owner (Data Owner role)** of source Data Mart *Shared for maintenance* | Yes | Yes via non-owner path, if also has `Edit` on target Data Mart [1] | Yes via non-owner path [1] |
| **Business Owner (Data Owner role)** of source Data Mart not shared for maintenance | Yes | No | No |
| **Business Owner (Business User)** of source Data Mart | Yes | No | No |
| **Non-owner with the Data Owner role** (source Data Mart shared for maintenance) | Yes [1] | Yes, if also has `Edit` on target Data Mart [1] | Yes [1] |
| **Non-owner with the Data Owner role** (source Data Mart shared for reporting only) | Yes [1] | No | No |
| **Non-owner Business User** (source Data Mart visible) | Yes [1] | No | No |

[1] Under `Selected contexts only` scope this requires a context overlap between the member and the source Data Mart.

> ☝️ Business Users cannot create or manage relationships, whatever the sharing settings. On Data Marts they get only See and Use. They can build reports on joined fields, but they cannot configure the join itself.

---

### Destination

The owner of a Destination has full control regardless of their role — even a Business User who created a Destination manages it completely.

| Who | Not shared | Shared for use | Shared for maintenance | Shared for both |
|---|---|---|---|---|
| **Owner (any role)** | All actions | All actions | All actions | All actions |
| **Non-owner with the Data Owner role** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |
| **Non-owner Business User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |

---

### Report

Reports do not have sharing settings. **Visibility follows the parent Data Mart** — if you can see a Data Mart, you can see all Reports built on it.

Access to edit, delete, or run a Report requires one of two conditions:

| Who | Can see | Can edit, delete, or run |
|---|---|---|
| **Has Data Mart maintenance access** [1] | Yes | Yes — for all Reports on that Data Mart |
| **Report Owner** (Destination exists) | Yes | Yes |
| **Report Owner** (Destination deleted) | Yes | No — read-only until Destination is restored or replaced |
| **Data Mart visible without maintenance access** | Yes | No |

[1] "Has Data Mart maintenance access" means the user receives `Edit` on the parent Data Mart through any path defined in the [Data Mart access table](#data-mart) — that is, Data Owner with the Data Owner role, or a member with the Data Owner role (including a Business Owner who has that role) receiving maintenance through the non-owner sharing path on a Data Mart that is *Shared for maintenance*. The non-owner sharing path is gated by role scope and contexts; the Report-level decision inherits that gate.

> ☝️ A Report owner can edit, delete, and run the Report only while its Destination still exists. If the Destination is deleted, the owner can still see the Report but cannot edit, delete, or run it until the Destination is restored or ownership is reassigned by a Data Owner.

**Viewing the Report's SQL follows visibility, not maintenance access.** Anyone who can see a Report can open **Preview SQL** and read or copy the generated query — including Business Users and members with the Data Owner role without maintenance access to the parent Data Mart. Two actions in that dialog stay restricted to users with Data Mart maintenance access and are hidden for everyone else: the SQL validator (dry run) and **Copy as Data Mart**.

If the Report pulls fields from a [joined Data Mart](../getting-started/setup-guide/joinable-data-marts.md) that the viewer cannot access, the SQL is not shown at all — the error names the inaccessible Data Mart.

---

### Report Trigger

[Report Triggers](../getting-started/setup-guide/report-triggers.md) have no dedicated ownership. Who can see them and who can manage them follows the parent Report.

| Who | Can see | Can manage (create, edit, delete) |
|---|---|---|
| **Has Data Mart maintenance access** [1] | Yes | Yes — for all Report Triggers on that Data Mart |
| **Report Owner** (Destination exists) | Yes | Yes — for own Report's triggers only |
| **Report Owner** (Destination deleted) | Yes | No |
| **Data Mart visible without maintenance access** | Yes | No |

[1] Defined under [Report](#report) above — includes any path that grants `Edit` on the parent Data Mart, with the same role scope / context gating.
