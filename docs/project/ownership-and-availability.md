# Ownership and Availability

A member's [role](roles-and-permissions.md) defines their capabilities across the whole project. **Access rights** go one level deeper: they control what a member can do with a specific resource, based on two factors — their **ownership status** and the resource's **availability settings**.

---

## Ownership

Every resource — [Storage](../storages/manage-storages.md), Data Mart, [Destination](../destinations/manage-destinations.md), Report — has owners. Any project member can be assigned as an owner. The member who creates a resource is automatically assigned as its first owner. Additional owners can be assigned from the resource settings page.

Most resources have a single **Owner** role. Data Marts are the exception — they support two distinct owner types:

| Owner type | Responsibility | Access level |
|---|---|---|
| **Technical Owner** | Data definition, schema, and source connections | Full control |
| **Business Owner** | Business requirements and usage | View and use only |

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

## Availability

Availability settings control what non-owners can do with a resource. Owners and Project Admins always have full access regardless of availability.

Each resource has two independent availability toggles. The first toggle name differs by entity type:

- **Data Mart** — first toggle is **Available for reporting**
- **Storage, Destination** — first toggle is **Available for use**

The second toggle is **Available for maintenance** for all resource types. The combination of the two toggles determines what non-owners can do:

| State | What non-owners can do |
|---|---|
| Both toggles off | Not visible — only owners and Project Admins can see the resource |
| First toggle on, second off | Can see and use the resource — for example, view a Data Mart and build reports on it, or link a Storage to their own Data Mart |
| First toggle off, second on | Can see, use, edit, and delete the resource |
| Both toggles on | Both of the above |

> ☝️ New resources start with both toggles off. Existing resources were migrated to both toggles on to preserve previous access patterns. Owners can gradually reconfigure availability to match their intended access model.

![Resource settings page with the Available for reporting and Available for maintenance toggles](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/f38e1fc6-5052-466c-3a03-19b2673fb000/public)

**Who can configure availability** depends on the entity type and the owner's role:

| Entity | Can configure availability |
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
| **Configure Availability** | Change the availability settings of the resource |
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

| Who | Not available | Available for use | Available for maintenance | Available for both |
|---|---|---|---|---|
| **Owner (Technical User)** | All actions | All actions | All actions | All actions |
| **Non-owner Technical User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |
| **Any Business User** | No access | No access | No access | No access |

> ☝️ Business Users do not have direct access to Storages. They interact with data through Data Marts and Destinations available to them.

---

### Data Mart

| Who | Not available | Available for reporting | Available for maintenance | Available for both |
|---|---|---|---|---|
| **Technical Owner (Technical User)** | All actions | All actions | All actions | All actions |
| **Technical Owner (Business User)** | See, Use | See, Use | See, Use | See, Use |
| **Business Owner (any role)** | See, Use | See, Use | See, Use | See, Use |
| **Non-owner Technical User** | No access | See, Use | See, Use, Edit, Delete, Manage Triggers | See, Use, Edit, Delete, Manage Triggers |
| **Non-owner Business User** | No access | See, Use | No access | See, Use |

> ☝️ When a Data Mart is available for maintenance, Business Users who are not owners still cannot access it — maintenance access is reserved for Technical Users.

---

### Data Mart Trigger

Data Mart Triggers have no dedicated ownership. Who can see them and who can manage them follows the parent Data Mart.

| Who | Can see | Can manage (create, edit, delete) |
|---|---|---|
| **Technical Owner (Technical User)** | Yes | Yes |
| **Technical Owner (Business User)** | Yes | No |
| **Business Owner of parent Data Mart** | Yes | No |
| **Non-owner Technical User** (DM available for maintenance) | Yes | Yes |
| **Non-owner Technical User** (DM available for reporting only) | Yes | No |
| **Non-owner Business User** (DM visible) | Yes | No |

---

### Destination

The owner of a Destination has full control regardless of their role — even a Business User who created a Destination manages it completely.

| Who | Not available | Available for use | Available for maintenance | Available for both |
|---|---|---|---|---|
| **Owner (any role)** | All actions | All actions | All actions | All actions |
| **Non-owner Technical User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |
| **Non-owner Business User** | No access | See, Use | See, Use, Copy Credentials, Edit, Delete | See, Use, Copy Credentials, Edit, Delete |

---

### Report

Reports do not have availability settings. **Visibility follows the parent Data Mart** — if you can see a Data Mart, you can see all Reports built on it.

Access to edit, delete, run, manage owners, and manage triggers requires one of two conditions:

| Who | Can see | Can edit, delete, or run |
|---|---|---|
| **Has Data Mart maintenance access** (Technical Owner with Technical User role, or non-owner Technical User with DM available for maintenance) | Yes | Yes — for all Reports on that Data Mart |
| **Report Owner** (Destination exists) | Yes | Yes |
| **Report Owner** (Destination deleted) | Yes | No — read-only until Destination is restored or replaced |
| **Business Owner of parent Data Mart** | Yes | No |
| **Non-owner without DM maintenance access** | Yes, if DM is visible | No |

> ☝️ A Report owner can edit, delete, and run the Report only while its Destination still exists. If the Destination is deleted, the owner can still see the Report but cannot edit, delete, or run it until the Destination is restored or ownership is reassigned by a Technical User.

---

### Report Trigger

[Report Triggers](../getting-started/setup-guide/report-triggers.md) have no dedicated ownership. Who can see them and who can manage them follows the parent Report.

| Who | Can see | Can manage (create, edit, delete) |
|---|---|---|
| **Has Data Mart maintenance access** | Yes | Yes — for all Report Triggers on that Data Mart |
| **Report Owner** (Destination exists) | Yes | Yes — for own Report's triggers only |
| **Report Owner** (Destination deleted) | Yes | No |
| **Non-owner** (DM visible) | Yes | No |
