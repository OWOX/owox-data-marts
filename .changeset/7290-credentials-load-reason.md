---
'owox': minor
---

**Know what to fix when Credentials do not load for a connector test**

When you test a custom connector with **Use a Credential**, the Credential field could show only "Could not load Credentials." and **Try again**. If the server refused the request, for example because the manifest was not valid, a retry got the same answer, and **Run test** stayed disabled until you selected a Credential. Now the field shows the server's reason, such as `node "items" uniqueKeys names "iid", which is not one of its fields`. Fix the manifest, and the list loads again.

![Test settings in the Connector Builder: Use a Credential is on, and the Credential field says the manifest is not valid because uniqueKeys names a field that the node does not have](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/d531f35d-235f-437d-02ba-5984b46e2700/public)

The Credential field in a Data Mart's configuration of a custom connector also shows the reason. There **Try again** stays, because a new version of the connector can change the answer.

See [Test on live data](../../docs/connectors/connector-builder.md#step-5-test-on-live-data).

<!-- markdownlint-disable-file MD041 MD036 -->
