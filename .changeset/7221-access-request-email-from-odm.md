---
'owox': minor
---

**Access request emails name the project and take Project Admins straight to the request**

When a teammate asks to join a project, every Project Admin gets an email about it, and the teammate gets one once an admin approves. An admin of several projects could not tell from the email which project the request was for, and roles were shown as `ADMIN`, `EDITOR` or `VIEWER`. Now both emails name the project and use the role names you see in the app (Project Admin, Data Owner, Business User). The admin's **Check request** button now opens **Project Settings → Members** of that project, where you approve or decline the request.

![The access request email to a Project Admin: the user with the email alex@example.com has requested a change in permissions for Marketing Analytics to the role of Data Owner, with a link to the Members page and a Check request button](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/bc6d2dd6-285c-44c2-4f51-d1d46a474000/w=800)

- If the project name cannot be loaded, the emails say "your project" or "the OWOX project" instead.
- After approval, the teammate's **Join now** button opens the project.

  ![The approval email to the teammate: you have been granted Data Owner access to Marketing Analytics, with a Join now button that opens the project](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/3e8fcb42-8f62-477e-7df0-714cf2d8f400/w=800)

- Both emails are sent even if the recipient turned off email notifications. Asking again for the same role while the request is still pending does not email the admins again.
- If an email cannot be sent, the access request or the approval still goes through.
- Only OWOX-managed projects have access requests, so self-hosted installations are not affected.

See [Manual provisioning](../../docs/project/members.md#manual-provisioning).
