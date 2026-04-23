# Managing Project Members

Project members are people who have access to your project. Each member has a role that controls what they can do — see [Roles and Permissions](roles-and-permissions.md).

In OWOX projects, only **Project Admins** manage the member list (invite, role change, remove) from **Project Settings → Members**.

> ☝️ Notification receivers are synchronized with the current member list and role eligibility. If a member is removed, or downgraded from **Technical User** to **Business User**, they are removed from receiver lists.

![Project Settings Members page showing the list of project members with their names and roles](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/9449c7c1-6010-4211-e4da-f88f0b413900/public)

## Created By

Resources keep a creator reference (`Created By`) that does not change after creation.

This applies to Data Marts, Storages, Destinations, Reports, Scheduled Triggers, and Runs.

**Where it appears:**

- **Data Marts, Storages, Destinations, Reports**: sortable `Created By` column in list views, and in the **Details** section of each resource's page
- **Run history**: inline `by [member name]` when a creator profile is available

![Resource list view with a sortable Created By column showing which member created each resource](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/97cca939-e070-48d1-c874-cf3dda4bdc00/public)

## Initial Ownership

By default, creator and initial owner are the same:

- Data Mart → creator becomes **Technical Owner**
- Storage → creator becomes **Owner**
- Destination → creator becomes **Owner**
- Report → creator becomes **Owner**

When creating a Storage, Destination, or Report, you can assign owners directly during setup instead of relying on the default.

Scheduled Triggers do not have dedicated ownership. Access to them follows the same rules as their parent Data Mart or Report.

![Resource creation form with an Owners field for assigning initial owners during setup](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/e8b00bd7-8710-45df-1d3f-3685eddbe500/public)

## Member Removal Impact

When a member leaves the project:

- Resources are not deleted.
- The **Created By** record is kept — it is never deleted.
- The member's name is no longer shown in the interface; the **Created By** field displays `—` instead.
