---
'owox': minor
---

**Access request emails now take Project Admins to the request in OWOX Data Marts**

When a teammate asks to join a project, every Project Admin gets an email about it, and the teammate gets one once an admin approves. Both went through a separate mailing service. The admin's **Check request** button opened a members page on `platform.owox.com` instead of OWOX Data Marts, where the request is listed, and both emails showed roles as `ADMIN`, `EDITOR` or `VIEWER`. Now OWOX Data Marts sends both emails itself: **Check request** opens **Project Settings → Members**, where you approve or decline the request, and roles have the names you see in the app (Project Admin, Data Owner, Business User).

- After approval, the teammate's **Join now** button opens the project.
- Both emails are sent even if the recipient turned off email notifications. Asking again while the request is still pending does not email the admins again.
- If an email cannot be sent, the access request or the approval still goes through.
- Only OWOX-managed projects have access requests, so self-hosted installations are not affected.

See [Manual provisioning](../../docs/project/members.md#manual-provisioning).
