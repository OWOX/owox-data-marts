---
'owox': minor
---

# Require an OWOX Data Marts Cloud license for Report Runs

Every Report Run — Google Sheets, Looker Studio, Email, Slack, Google Chat, MS Teams, HTTP Data, and MCP Query — is now authorized with OWOX Data Marts Cloud before it executes, and its consumption is billed to the project signed into the license key. Without a valid key the deployment runs as Community and Report Runs finish as Restricted with an actionable message; configuration is never hidden or deleted, and Process Runs are unaffected.

Community deployments can now configure every destination type, including Email, Slack, Google Chat, and MS Teams — the license gates only Report Run execution, not configuration.

Project administrators can create, rename, and revoke license keys in Project Settings → License keys. A key is bound to one deployment origin, is shown once on creation, and expires after 365 days. To rotate, create a new key, update the deployment, then revoke the old one.

Legacy offline Enterprise license keys are no longer supported and fall back to Community.
