---
'owox': minor
---

**Invited teammates get their email right away, and you know if it was not sent**

When a Project Admin invites a teammate, the teammate learns about it from the invitation email. If that email did not reach them, the admin had no way to know and kept waiting for someone who never got the invitation. Now OWOX Data Marts sends the invitation as soon as you click **Send invitation**, and tells you when it could not be sent.

![The invitation email from OWOX Data Marts: Hey friend, you have been invited by user maria@example.com to join Marketing Analytics as a Data Owner, with an Accept invitation button and the project link below it](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/8d5ac10e-1fb0-4578-9357-6560cf853700/w=800)

- The email names who invited the person, the project and the role (Project Admin, Data Owner or Business User). Its **Accept invitation** button opens the project.
- If who invited the person or the project name cannot be loaded, the email leaves that detail out. Without the project name, it says "the OWOX project".
- If the email cannot be sent, the invitation still stands. **Invite member** and the invite step after sign-up name who did not get it, so you can let them know yourself. The `POST /api/members/invite` response then has `emailSent: false`.
- Only OWOX-managed projects send this email. Self-hosted installations keep the one-time invitation link.

See [Invite a Member](../../docs/project/members.md#invite-a-member).
