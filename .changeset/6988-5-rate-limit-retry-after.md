---
'owox': minor
---

**Custom connectors wait as long as a rate-limited API asks**

When an API turned a request away and said when to try again in a `Retry-After` header, as a
rate limit (HTTP 429) usually does, a custom connector retried after about 5 and then 10
seconds regardless, used up its retries inside the limit and failed the run. It now waits as
long as the API asks, up to 5 minutes, unless the connector's error handling sets a backoff of
its own. **Test** in the Connector Builder keeps its short retry, so you see the refusal right
away.

Run errors from APIs whose error bodies follow JSON:API, Klaviyo among them, now show the API's
own explanation, for example `HTTP 429: Request was throttled. Expected available in 58
seconds.`, instead of the raw response body.

<!-- markdownlint-disable-file MD041 MD036 -->
