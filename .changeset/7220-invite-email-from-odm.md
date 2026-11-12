---
'owox': minor
---

**Invited teammates get their email right away, and you know if it was not sent**

When a Project Admin invited a teammate, the invitation email went through a separate mailing service. It could arrive minutes later, and if it was never delivered, the admin did not know. Now OWOX Data Marts sends the invitation itself as soon as you click **Send invitation**.

![The invitation email from OWOX Data Marts: Hey friend, you have been invited by user maria@example.com to join Marketing Analytics as a Data Owner, with an Accept invitation button and the project link below it](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/8d5ac10e-1fb0-4578-9357-6560cf853700/w=800)

- The email keeps its wording: who invited the person, to which project, and with which role (Project Admin, Data Owner or Business User). Its **Accept invitation** button opens the project.
- If the email cannot be sent, the invitation still stands. **Invite member** and the invite step after sign-up name who did not get it, so you can let them know yourself. The `POST /api/members/invite` response then has `emailSent: false`.
- Only OWOX-managed projects send this email. Self-hosted installations keep the one-time invitation link.

See [Invite a Member](../../docs/project/members.md#invite-a-member).
