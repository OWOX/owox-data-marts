---
'owox': minor
---

**Facebook Ads imports now retry a corrupted response instead of failing**

A long Facebook Ads import could fail near the end with a message like `Unexpected non-whitespace character after JSON at position 88743`. Facebook had answered one request with a damaged response body, and the connector gave up on it immediately, even though **Max Fetch Retries** was set.

Those damaged responses now count as retriable. The connector re-requests the page, waits between attempts as it does for any network problem, and finishes the import. A page only fails the run after every attempt in your retry budget returns a damaged body, and the error then names the endpoint that sent it.

- Nothing to change in your connector setup. **Max Fetch Retries** and **Initial Retry Delay (ms)** already cover this case.
- Re-run any import that failed with a JSON parsing error.

<!-- markdownlint-disable-file MD041 MD036 -->
