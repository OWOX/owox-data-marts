# Contexts

A **Context** is a business-domain label — for example *Marketing*, *Finance*, or *Sales* — that you attach to Data Marts, Storages, and Destinations to group them by domain and to control which members can see them.

Contexts are managed by **Project Admins** from **Project Settings → Contexts**. Once a context exists, it can be:

- attached to any Data Mart, Storage, or Destination in the project, and
- assigned to project members to scope their visibility (see [Roles and Permissions](roles-and-permissions.md)).

> ☝️ Contexts are project-scoped. Each context belongs to a single project and is not shared across projects.

## When to Use Contexts

Use Contexts when you need to give different teams access to different subsets of project resources without giving every member project-wide visibility. Typical examples:

- A **Marketing** context groups all marketing-related Data Marts, the Storage they read from, and the Destinations that publish marketing reports.
- A **Finance** context does the same for finance assets, kept separate from marketing.

A member assigned only to the **Marketing** context will see Marketing-tagged resources but not Finance ones (subject to the rules in [How Contexts Affect Access](#how-contexts-affect-access)).

If every member should see every resource, you don't need Contexts — leave each member's role scope set to **Entire project**.

---

## Managing Contexts

Only Project Admins can create, rename, or delete contexts. Other roles can view the context list and see context badges on resources, but cannot create, rename, or delete contexts.

Open **Project Settings → Contexts** to see all contexts in the project. Each row shows:

| Column | Description |
|---|---|
| **Name** | The context label shown on resources |
| **Members** | Members assigned to this context |
| **Description** | Optional free-text description |
| **Created by** | The Project Admin who created the context |
| **Created at** | Creation date |

![Project Settings → Contexts table listing three example contexts with their names, member counts, descriptions, and creation details](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/64e04505-faa3-4121-96b4-1092d57c2800/public)

### Creating a Context

1. In **Project Settings → Contexts**, click **+ Add context**.
2. Enter a **Name** (required, up to 255 characters; must be unique within the project).
3. Optionally add a **Description** to explain what the context represents.
4. Optionally select members to assign to this context immediately.
5. Click **Create**.

![Add context panel with fields for Name, Description, and Members](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/717f7601-5999-4177-90ca-166be7d70e00/public)

You can also create a context inline from the **Contexts** field on a Data Mart, Storage, or Destination — a Project Admin sees an option to create a new context without leaving the resource page.

### Editing a Context

In the contexts list, click a row (or use the row actions) to open the **Configure context** panel. From there you can change the name, description, and the set of assigned members. Changes apply immediately to all resources tagged with this context — the context's identity is preserved, so attachments remain intact.

### Deleting a Context

A context can only be deleted when it is **detached from every resource and member**. If a context is still attached, the delete is blocked and the dialog lists the attachments that need to be removed first:

- *N* Data Marts
- *N* Storages
- *N* Destinations
- *N* Members

Each entry links to the corresponding list, pre-filtered by the context, so you can detach attachments quickly.

> ☝️ Deleting a context is final, but it does **not** delete the resources tagged with it. Resources stay; only the tag is removed.

![Delete context dialog blocked because the context is still attached to resources, listing Data Marts, Storages, Destinations, and Members with links to each filtered list](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ca318fa5-faa5-408c-f2be-e9074d3b7e00/public)

---

## Attaching Contexts to Resources

Contexts can be attached to **Data Marts**, **Storages**, and **Destinations**. Each resource can carry any number of contexts, and a context can be attached to any number of resources.

You manage attachments from the resource itself:

- **Data Mart** → **Contexts** card on the Data Mart overview page
- **Storage** → **Contexts** section in the Storage settings form
- **Destination** → **Contexts** section in the Destination settings form

In each place, the **Contexts** picker shows every context defined in the project; check the ones that apply.

Resource lists (Data Marts, Storages, Destinations) display attached contexts as badges, and the lists can be filtered by context.

![Data Marts list showing context badges on each row and a context filter dropdown in the toolbar](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/ee9f757e-fa97-47ce-3361-86b031c3da00/public)

### Who Can Change a Resource's Contexts

Editing a resource's context attachments is more restricted than editing the resource itself. The rules follow the same ownership model as other resource actions (see [Ownership and Sharing](ownership-and-sharing.md)):

| Resource | Who can edit attached contexts |
|---|---|
| **Data Mart** | Project Admin, or Technical Owner with Technical User role |
| **Storage** | Project Admin, or Owner with Technical User role |
| **Destination** | Project Admin, or Owner (any role) |

Members who can edit a resource for other reasons (for example, a non-owner Technical User editing a Data Mart that is *Shared for maintenance*) cannot change its contexts unless they meet the rules above.

---

## Assigning Members to Contexts

Member–context assignment is the link that turns Contexts into an access-control mechanism. There are two equivalent ways to manage it:

- **From a member** — open **Project Settings → Members**, edit a member, and pick contexts in the **Contexts** section.
- **From a context** — open **Project Settings → Contexts**, edit a context, and pick members in the **Members** section.

Both paths write to the same assignment, so changes made in one place are reflected in the other.

> ☝️ Assigning a member to a context only takes effect when their **Role scope** is set to **Selected contexts only**. See the next section.

![Member settings panel showing the Contexts multi-select field and Role scope set to Selected contexts only](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/cdabfe38-b5f1-4e0d-1620-c00aa860b000/public)

---

## How Contexts Affect Access

Each non-admin member has a **Role scope**, set in **Project Settings → Members**:

| Role scope | Effect |
|---|---|
| **Entire project** | The member sees every shared resource in the project, regardless of context assignments. This is the default. |
| **Selected contexts only** | The member sees a shared resource only if the resource is attached to **at least one** of the contexts the member is assigned to. |

Project Admins always have project-wide access. The role-scope setting and context assignments are not applied for admins.

> ☝️ **Ownership overrides context filtering.** A member always sees resources they own — Technical Owner of a Data Mart, Owner of a Storage or Destination — even if no context overlaps, and even if their scope is **Selected contexts only**.

### What "Selected Contexts Only" Applies To

The context filter applies to non-owner visibility of:

- **Data Marts**
- **Storages**
- **Destinations**
- **Reports** (visibility follows the parent Data Mart, as documented in [Ownership and Sharing](ownership-and-sharing.md#report))

Triggers do not have their own visibility — they follow their parent (Data Mart or Report).

### Members Assigned to Zero Contexts

A member with role scope **Selected contexts only** and no contexts assigned is a valid state. They simply have no shared, non-owner access through context matching. They keep access to anything they own.

### What Changes When You Re-Tag a Resource

Adding or removing a context on a resource immediately changes who can see it:

- **Adding a context** to a resource grants visibility to every **Selected contexts only** member who is assigned to that context.
- **Removing a context** revokes visibility for any such member who relied on that context for the overlap (provided no other context overlap remains and they are not an owner).

---

## Related

- [Managing Project Members](members.md) — invite members, change role and scope.
- [Roles and Permissions](roles-and-permissions.md) — what each role can do, independent of contexts.
- [Ownership and Sharing](ownership-and-sharing.md) — the other two layers that determine resource access.
