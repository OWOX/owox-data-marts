---
'owox': minor
---

**Clearer connector errors, and custom connectors that handle more APIs**

- When a connector's request to its API fails, Run History shows the provider's own message instead of the raw response body, and a skipped account names what was being imported.
- A run that loaded nothing shows **Loaded 0 rows** in Run History, and for a custom connector the log names each node that got no records and what to check.
- The Connector Builder checks node and parameter names as you type, explains the rule and suggests a name that fits, such as `v1_balance_history` for `v1/balance/history`.
- **Test** runs the right node after you rename it in **Code**, instead of failing with `Unknown node`.
- When a rate-limited API says in a `Retry-After` header when to try again, a custom connector waits that long, up to 5 minutes, instead of using up its retries inside the limit and failing the run.
- Errors from APIs whose error bodies follow JSON:API, Klaviyo among them, show the API's own explanation instead of the raw response body.
- **Publish** and **Test** refuse a node that puts `{{ dateWindow.start }}` or `{{ dateWindow.end }}` into its request without fetching by date window, and name the node and the fix, where every run of it used to fail with `Template path "dateWindow.start" is unresolved`.
- A run that needs a field the connector no longer provides names that field and points to **Edit Fields**, which now drops such a field when you save.
- A node can end its date window a number of days before today, with **Skip the last days** under **Incremental** or `incremental.endLagDays` in the manifest, for APIs such as OpenAI Ads that refuse a window ending today.

<!-- markdownlint-disable-file MD041 MD036 -->
