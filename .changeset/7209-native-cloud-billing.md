---
'owox': minor
---

**View project credits and subscription details in OWOX Data Marts**

Cloud users can check their current credit balance, explore monthly consumption by product and operation, and review their subscription from Project settings. Credits groups usage from self-hosted installations by license name. If a project moves to Free after a cancellation or missed payment, the subscription page explains why.

Cloud operators can enable these pages with `CLOUD_BILLING_ENABLED` and set the public HTTPS billing address in `CLOUD_BILLING_API_ORIGIN`. The server checks the address at startup when the pages are enabled. See [Cloud billing pages](../../docs/getting-started/deployment-guide/environment-variables.md#cloud-billing-pages).

<!-- markdownlint-disable-file MD041 MD036 -->
