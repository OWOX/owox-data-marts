---
'owox': patch
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Upgrading several instances: run this version on all of them before the next one**

The next version moves connector keys from each Data Mart into reusable Credentials. It converts the existing keys on its first start. This version already runs Data Marts whose keys are in Credentials, and it keeps them running if you go back to it. Nothing changes for you in this version.

If you run more than one instance of OWOX Data Marts, upgrade every instance to this version before you install the next one. That way, an instance still on the older version never meets keys it cannot read while the upgrade rolls out. A single instance needs no extra step.
