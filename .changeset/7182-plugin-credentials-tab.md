---
'owox': minor
---

**See which Credentials a plugin uses, and change them on the plugin's Credentials tab**

Members who reopened **Configure Credentials** on an installed plugin always saw an empty choice, so a saved Credential looked unsaved, and they had no way to check which Credential the plugin was using. Now an installed plugin that needs Credentials has a **Credentials** tab next to **Overview**. It shows the Credential granted to each requirement, already selected, and members change it right there and press **Save**, or **Discard** to go back. There is no separate dialog. A Credential that has since been disabled or deleted is marked as no longer usable and has to be chosen again. **Configure Credentials** no longer sits in the page header.

The video shows the difference: before, the dialog showed nothing selected even after saving; now the tab shows the Credential the plugin uses, keeps a change only on **Save**, and still shows it after a reload.

<https://customer-4geatlj66rtkaxtz.cloudflarestream.com/2bf72498ced1034767fef2dcaf9cd4ae/iframe>

When a plugin's AI request fails at the provider, the plugin still gets "AI provider request could not be completed". The server log now also records which Credential and model failed, the provider's HTTP status, and, for the built-in AI providers, what the provider answered, so the cause can be found. Timeouts and refused connections are recorded the same way. The prompt and the Credential's secret are never written to the log.

<!-- markdownlint-disable-file MD041 MD036 -->
