---
'owox': minor
---

<!-- markdownlint-disable-file MD041 MD036 -->

**Correct client address behind a load balancer that adds two forwarding entries**

Behind some load balancers, such as a Google Cloud external Application Load Balancer, the application saw the load balancer's own address as the client address, because it trusted exactly one proxy while the load balancer appends two `X-Forwarded-For` entries: the client and itself. Set the new `TRUST_PROXY_HOPS` variable to the number of entries your proxies append, `2` in that case, and the real client address is used.

The default stays `1`, so a deployment that does not set the variable behaves as before. The value is a number from `0` to `10`; anything else stops the application at startup, and a value larger than the real number of proxies would let clients choose their own address. `0` is only for clients that connect directly, with no proxy in front. See [Reverse proxy](../../docs/getting-started/deployment-guide/environment-variables.md#reverse-proxy).
