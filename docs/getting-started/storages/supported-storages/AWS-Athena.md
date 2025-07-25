# AWS Athena Storage
An Access Key ID and Secret Access Key provide authentication for AWS Athena.

In AWS Console:
1. Go to IAM > Users, create/select a user, and generate an Access Key.
2. Enable the [Athena API](https://console.aws.amazon.com/athena/).
3. Attach the `AmazonAthenaFullAccess` policy for full CRUD access to datasets, schemas, tables, views, and templates.
4. Attach the `AWSGlueFullAccess` policy for Glue Data Catalog access.
5. Attach the `AmazonS3FullAccess` policy for the S3 output and data source buckets, or use a custom policy with `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, `s3:GetBucketLocation` for least privilege.
