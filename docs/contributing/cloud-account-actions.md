# Cloud account actions

The Cloud account surfaces use `CLOUD_ACCOUNT_API_ORIGIN`, published in the public flags only for `owox-better-auth`. Better Auth and self-hosted installations do not enable these Cloud handlers. This change adds no environment variable.

## Ownership and API

App calls IB directly. The IB `user` module owns the account scenarios and stable public DTOs. It authenticates `/me` through the existing IDP account-session facade, then uses a private data-provider contract. Its current provider calls ROI over HTTP; future user-owned repositories can replace that provider without changing App.

| Method | IB route | Authorization |
| --- | --- | --- |
| GET | `/api/account/me/personal-data` | Current App access token in `X-OWOX-Authorization` |
| POST | `/api/account/personal-data/export` | Signed email capability in the JSON body |
| PATCH | `/api/account/email-preferences/link` | Signed topic capability in the JSON body |

Authenticated export derives the UID only from the verified token. It needs no project role, works with `roles: []`, and permits `viewOnly` because it reads data. Existing account mutations remain blocked in `viewOnly`.

The signed-in download uses the shared account HTTP client, including access-token refresh and retry. It retains the expected user and project session, so a refresh cannot replay the export under a different account or project.

Signed export accepts `{ email, signature }`. Signed preferences accept `{ email, signature, topicId, subscribed, expiresAt? }` and return `{ topics: [{ id, subscribed, signature }], allSignature }`. The original optional expiry string must be preserved: it is part of the legacy proof. A signed topic capability permits both unsubscribe and re-subscribe, as in Platform. It authorizes the email recipient independently of any current App session.

IB's temporary adapter maps these requests to the private ROI `Users/accountDataExport` and `Users/signedEmailSubscription` actions. ROI verifies the existing signatures and retains subscription record methods and events. Signed mutations have no automatic retry. Personal data and proofs must not be logged or cached.

## Browser behavior

The public pages `/subscriptions` and `/download-account-data` bypass the authenticated App bootstrap, project guards, GTM and Intercom. They load public flags without the authenticated HTTP client's refresh handling. Requests to IB omit cookies, use `no-store`, reject redirects, and omit the referrer. These pages never send browser requests to ROI.

The unsubscribe page automatically sends one unsubscribe action when opened, including for `topicName=all`. A Strict Mode effect replay does not send it again. Later topic switches use the proofs returned by IB. Personal-data links download only after the recipient clicks the button.

The generated filename remains `user_info.json`. Authenticated export includes company fields and the existing four-way processing-purpose category. Signed export retains Platform's smaller field set and omits that category. Static disclosure sections and their JSON names are preserved in App.

## Existing email links and rollout

App also handles `/ui/p/subscriptions` and `/ui/p/download-account-data` as exact public aliases. These preserve the Angular Platform path when an old host is redirected. Both route forms accept the existing query parameters: `email`, `hash`, `topicName` (default `all`), and optional `expires_date`. Decode them once and preserve expiry verbatim.

Deploy ROI private actions, then IB, then the App revision. Keep Cloud account pages disabled until the corresponding IB API is available. Verify signed links and an authenticated `roles: []` session on the target environment before changing email URLs or the Platform redirect.

This implementation does not change a mail sender or activate a Platform-domain redirect. The issuer of the historical links was not found in the inspected Platform/ROI source. Before cutover, identify its templates/configuration and verify that every historical URL form redirects to the matching App handler with all query parameters preserved. Existing Platform handlers remain available in the meantime.
