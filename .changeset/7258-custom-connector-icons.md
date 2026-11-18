---
'owox': minor
---

**Custom connectors are easier to tell apart on Credentials and Triggers**

Every Custom connector Credential showed the same key icon. Triggers showed the technical name of a custom connector. So with many custom connectors, you could not see which Credential or run belonged to which connector.

- **Credentials.** A [Custom connector Credential](../../docs/project/credentials.md#custom-connector-credentials) shows the logo of its connector when all its Data Marts that you can see use one custom connector. In other cases, and for a connector without a logo, it shows a plug icon. On Data Setup of a custom connector, the Credential picker shows the connector's logo.

  ![The Credentials page with three Custom connector Credentials: Task Tracker token and Expenses API key show the logos of their connectors, and Support Desk token shows the plug icon because its connector has no logo](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/5e32452b-9a49-44c1-62cc-f9c2a40b7a00/w=800)

- **Triggers.** Rows and the hover card show the display name of a custom connector and its logo, or a plug icon when it has no logo. The Triggers page also searches and filters these runs by display name.

  ![The Triggers page with three Connector Run triggers: Run Target shows Task Tracker and Team Expenses with their logos and Support Desk with the plug icon, in place of the technical connector names](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/c7882501-0409-4c8d-fd44-9210b936f300/w=800)

<!-- markdownlint-disable-file MD041 MD036 -->
