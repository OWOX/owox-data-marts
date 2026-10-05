---
'owox': minor
---

**Athena query results are cleaned up when the Output Bucket names a folder**

When an AWS Athena storage's **Output Bucket** included a folder, such as `my-athena-results/owox/`, OWOX Data Marts could not delete the results of the queries that read your data, and they stayed in your bucket. They are now deleted once read, as with a plain bucket. The bucket link on the Data Mart page opens that folder.

<!-- markdownlint-disable-file MD041 MD036 -->
