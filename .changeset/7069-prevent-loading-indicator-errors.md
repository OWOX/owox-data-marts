---
'owox': minor
---

**Fix loading indicator errors when requests fail**

Fixed the `Cannot read properties of undefined (reading 'skipLoadingIndicator')` error on Data Mart pages and other application pages. This secondary error could appear while handling a failed request and hide its original cause.

<!-- markdownlint-disable-file MD041 MD036 -->
