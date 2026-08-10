# Email destination — transitional note

- Currently, the Email destination uses the common logic that is shared by three destination types:
  - EMAIL
  - SLACK
  - MS_TEAMS
- Google Chat has a type-specific implementation that supports both incoming webhooks and the
  existing channel-email delivery method. Channel email reuses the shared email writer.
- In the future, Slack and Microsoft Teams are expected to receive their own type-specific
  implementations and be extracted from here.

This README clarifies the current transitional state until those extractions are completed.
