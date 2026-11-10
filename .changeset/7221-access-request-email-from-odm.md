---
'owox': minor
---

**Access request emails now take Project Admins to the request in OWOX Data Marts**

When a teammate asks to join a project, every Project Admin gets an email about it. That email went through a separate mailing service, and its button opened a members page on `platform.owox.com` instead of OWOX Data Marts, where the request is listed. Now OWOX Data Marts sends the email itself, and **Review request** opens **Project Settings → Members**, where you approve or decline the request.

- The email names who asked, the project, and the role they asked for (Project Admin, Data Owner or Business User).
- Every Project Admin gets it, including admins who turned off email notifications. Asking again while the request is still pending does not send it again.
- If the email cannot be sent, the access request is still created.
- Only OWOX-managed projects have access requests, so self-hosted installations are not affected.

See [Manual provisioning](../../docs/project/members.md#manual-provisioning).
