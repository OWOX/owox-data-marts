---
'owox': minor
---

**Access request emails now take Project Admins to the request in OWOX Data Marts**

When a teammate asks to join a project, every Project Admin gets an email about it, and the teammate gets one once an admin approves. Both went through a separate mailing service. The admin's **Check request** button opened a members page on `platform.owox.com` instead of OWOX Data Marts, where the request is listed, and both emails showed roles as `ADMIN`, `EDITOR` or `VIEWER`. Now OWOX Data Marts sends both emails itself: **Check request** opens **Project Settings → Members**, where you approve or decline the request, and roles have the names you see in the app (Project Admin, Data Owner, Business User).

![The access request email to a Project Admin: the user with the email alex@example.com has requested a change in permissions for Marketing Analytics to the role of Data Owner, with a link to the Members page and a Check request button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/bc6d2dd6-285c-44c2-4f51-d1d46a474000/w=800)

- Both emails name the project, the way the invitation email does, so an admin of several projects knows which one the request is for. If the project name cannot be loaded, they say "your project" or "the OWOX project" instead.
- After approval, the teammate's **Join now** button opens the project.

  ![The approval email to the teammate: you have been granted Data Owner access to Marketing Analytics, with a Join now button that opens the project](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/3e8fcb42-8f62-477e-7df0-714cf2d8f400/w=800)

- Both emails are sent even if the recipient turned off email notifications. Asking again for the same role while the request is still pending does not email the admins again.
- If an email cannot be sent, the access request or the approval still goes through.
- Only OWOX-managed projects have access requests, so self-hosted installations are not affected.

See [Manual provisioning](../../docs/project/members.md#manual-provisioning).
