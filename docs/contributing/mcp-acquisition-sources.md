# MCP acquisition sources

OWOX Cloud records the MCP client that initiated signup using the existing user and project `integration` fields. This identifies a client, not whether the user discovered OWOX in a marketplace or configured a connector manually.

## Attribution contract

A validated OAuth request with an HTTPS callback on `claude.ai` uses `claude`; one on `chatgpt.com` uses `chatgpt`. Other callbacks, including local desktop clients, use the existing `owox-data-marts` fallback. Client names alone do not determine attribution.

The OAuth sign-in redirect carries `integration` alongside the existing `/oauth/authorize?...` continuation. Better Auth preserves it through the Platform round trip and cookie-backed signup/social callbacks. Platform passes it to the existing IB identity endpoint. The routing parameter remains `source=app`.

Analytics adds these values to the existing integration dictionaries:

| Source    | User/project integration code | Access grant source code | Reporting label |
| --------- | ----------------------------- | ------------------------ | --------------- |
| `claude`  | 7                             | 6                        | Claude          |
| `chatgpt` | 8                             | 7                        | ChatGPT         |

Recognized MCP sources are applied to newly created users only. Existing users retain their source, even when it is empty. Project provisioning records the current integration only for a new project; joining or selecting an existing project does not change its creation source. Existing extension values retain their meanings and numeric codes. No historical backfill is included.

## Deployment order

1. Deploy Analytics dictionaries, access-grant mapping, creation-only attribution and the additive `actor.integration` identity-response field.
2. Prepare the reporting mappings described below.
3. Deploy Platform support for the optional integration and signup property. Older ODM callers continue to use `owox-data-marts`.
4. Deploy ODM, which begins sending recognized MCP integrations. IB already forwards the integration string and needs no deployment for this contract.

The existing schema uses integer fields, so these additions require the ordinary Analytics schema/dictionary deployment, not new columns. The change has no new application UI surface.

## Data mart reporting

The following published OWOX data marts expose `creationSource` and read separate warehouse views (Data Setup pages and BigQuery definitions verified on 2026-10-15):

- User: `d1c93c26-fdae-4cdc-959d-7cbd5e7e5ac3`, backing view `owox-smart-data-model.owox.user`.
- Project: `d93ee8cf-f1ac-4354-ae00-651fc566276b`, backing view `owox-smart-data-model.owox.project`.

The views forward `creationSource` from `owox-smart-data-model.user.data` and `owox-smart-data-model.project.data`. These upstream objects are tables, so changing the wrapper views would not update the source transformation.

The project transformation reads `owox-smart-data-model.project.project_creation_source_`. That view already reads string integrations from the existing `billing_projects_integration_changed_event` archive. Identify the authoritative source of its definition before changing it; the consuming transformation does not establish whether another process generates this view. If the view is generated, update and publish its source so a subsequent run preserves the change.

In the authoritative definition, replace the current `IF` expression for `creationSource` with the following mapping, preserving its CTEs, joins and other fields:

```sql
CASE
  WHEN pwi.integration = 'claude' THEN 'Claude'
  WHEN pwi.integration = 'chatgpt' THEN 'ChatGPT'
  WHEN pwi.integration IS NULL OR pwi.integration = 'owox-bi' THEN 'bi'
  ELSE pwi.integration
END AS creationSource
```

`owox-smart-data-model.project.data_` joins that mapping view. The [Project operation in the existing Project transformation](https://bi.owox.com/ui/app/eaab36212bad559300a24bc01f8e6286/transformations/7726b3b9f8ca446189c09a4e38e04d26?tab=editor&opId=e5014025e47c4991b0f28de5a59a2ffb&opTab=editor) materializes `SELECT * FROM project.data_` into `project.data`; it must refresh before the published Project mart reflects the labels. Numeric application dictionary values are not used in this SQL path.

For User, `owox-smart-data-model.user.creationSource` is populated by the [Creation Source operation in the existing User transformation](https://bi.owox.com/ui/app/eaab36212bad559300a24bc01f8e6286/transformations/adca52e48846403eafb65d40576d7296?tab=editor&opId=060f627f42d743e0817cdfd066c5fd7a&opTab=editor). Extend both existing `CASE` expressions, in `registered_event_prepared` and `discovered_event_prepared`, before the existing branches:

```sql
WHEN integration = 'claude' THEN 'Claude'
WHEN integration = 'chatgpt' THEN 'ChatGPT'
```

Preserve the existing extension/service-name fallbacks, event ordering, incremental lookback and first-source selection. The operation reads the existing `users_registered_event` and `users_discovered_event` archives; no new topic is needed. The subsequent User operation refreshes `user.data` from this mapping. The wrapper views do not need a change.

Back up each current definition before applying its exact diff. Also check cohort filters that enumerate known sources so MCP signups remain in the ODM cohort. Updating application dictionaries alone does not update the warehouse transformation.

## PostHog

Analytics returns the persisted `actor.integration` in the identity response. Platform attaches that value as `eventParameters.creationSource` on the existing `sign_up` event, after user identification. Repeated sign-in does not introduce another signup event or overwrite the stored source.

The deployed GTM PostHog tag must forward `eventParameters.creationSource`. Use the same reporting dimension and labels as the existing browser-extension report; keep extension sources in the same breakdown. Merely pushing this property into dataLayer does not prove that GTM delivers it to PostHog.

Verify both the GTM event and the received PostHog event, including the identified user ID, before considering tracking complete. This change adds a property to an existing event and adds no new event type.

## Acceptance and follow-up

Verify new accounts and projects from each recognized client, an existing user with a filled source, an existing user with an empty source, an existing project, and an unknown client. Include switching from sign-in to sign-up, social login, retry, and independent authorization continuations. Compare user/project IDs across identity, warehouse views and PostHog.

After release, follow up in the original product/engineering threads with the release references, verified User/Project creation sources and the PostHog report link. Do not report the warehouse or PostHog checks as complete from unit tests alone.
