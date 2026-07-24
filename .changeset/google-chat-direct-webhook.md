---
'owox': minor
---

# Add direct Google Chat delivery while preserving channel email

Google Chat Destinations now offer Google Chat API and Channel Email delivery methods. Existing
email-based destinations keep their current method, while new destinations default to direct API
delivery through a space-specific incoming webhook. API messages are formatted cards containing the
subject, Data Mart, complete rendered Insight, and a link back to OWOX.
