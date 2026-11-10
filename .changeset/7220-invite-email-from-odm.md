---
'owox': minor
---

**Invited teammates get their email right away, and you know if it was not sent**

When a Project Admin invited a teammate, the invitation email went through a separate mailing service. It could arrive minutes later, and if it was never delivered, the admin did not know. Now OWOX Data Marts sends the invitation itself as soon as you click **Send invitation**.

- The email keeps its wording: who invited the person, to which project, and with which role (Project Admin, Data Owner or Business User). Its **Accept invitation** button opens the project.
- If the email cannot be sent, the invitation still stands. **Invite member** and the invite step after sign-up name who did not get it, so you can let them know yourself. The `POST /api/members/invite` response then has `emailDelivered: false`.
- Only OWOX-managed projects send this email. Self-hosted installations keep the one-time invitation link.

See [Invite a Member](../../docs/project/members.md#invite-a-member).
