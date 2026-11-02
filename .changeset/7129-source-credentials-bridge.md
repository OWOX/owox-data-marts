---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Upgrading several instances: run this version on all of them before the next one**

**Before you upgrade, check your custom connector templates: a template path no longer steps into text.** `{{ parameters.Key.0 }}` or `{{ record.name.length }}` is now unresolved. That fails the run wherever an unresolved path does, such as a request path, a request body or an authentication field; in a query parameter or a header, the parameter is not sent. See [Templating scopes](../../docs/connectors/manifest-reference.md#templating-scopes).

**If you run more than one instance of OWOX Data Marts, upgrade every instance to this version before you install the next one.** That way, an instance still on the older version never meets keys it cannot read while the upgrade rolls out. A single instance needs no extra step.

The next version moves connector keys from each Data Mart into reusable Credentials. It converts the existing keys on its first start. This version already runs Data Marts whose keys are in Credentials, and it keeps them running if you go back to it. If you do go back, a custom connector Credential's keys can't be changed from the Credentials page. Apart from the template rule above, nothing changes for you in this version.
