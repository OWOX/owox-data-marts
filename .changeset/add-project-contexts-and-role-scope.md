---
'owox': minor
---

# Add project contexts and role scope, project settings page

Added business-domain Contexts and per-member Role Scope to narrow what shared resources a non-owner can see. 
Admins define Contexts in Project Settings, attach them to Data Marts, Storages and Destinations, and pick 
between `Entire project` and `Selected contexts` for each member. 
Owners and admins are never gated by Contexts. Introduced a unified Project Settings page 
(Overview, Members, Contexts, Credit consumption, Subscription, Notification) that replaces the separate 
Members page and wires invite, role change and member removal through the Identity Provider.
