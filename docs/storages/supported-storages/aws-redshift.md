# AWS Redshift

## 1. Go to the Storages Page

In the OWOX Data Marts web application, navigate to **Storages** from the main navigation pane and click **+ New Storage**.

## 2. Choose Storage Type

Click **AWS Redshift** to create a new **Storage** configuration.
> Upon selecting the **+ New Storage** button and specifying the desired storage type, a Storage entry is created.
> You can create **Data Mart** entities and model a data structure for your project prior to configuring the **Storage**.
> Note that **Data Mart** cannot be validated or published until the associated **Storage** is fully configured.

## 3. Add title

Give the storage configuration a clear **title**, eg `Redshift – dev database`.

## 4. Set General Settings and Connection Details

### Enter AWS Region

- Choose the AWS region where your Redshift cluster or workgroup is located
- Examples: `us-east-1`, `eu-west-1`, `ap-southeast-1`
- You can find your region in the [AWS Redshift Console](https://console.aws.amazon.com/redshiftv2/home) in the top right corner or url.

> **Note:** The region must match where your Redshift cluster or Serverless workgroup is deployed.

### Enter Database Name

- This is the name of the database within your Redshift cluster
- Default Redshift database is typically `dev` or `defaultdb`
- You can find this in the [AWS Redshift Console](https://console.aws.amazon.com/redshiftv2/home)

### Choose Connection Type

AWS Redshift supports two deployment types (one is required). It's based on your use case and pricing model.

#### Option 1: Serverless

**Workgroup Name:**

- Go to [AWS Redshift Serverless Console](https://console.aws.amazon.com/redshiftv2/home#serverless-dashboard)
- Navigate to **Workgroup configuration**
- Copy the workgroup name (e.g., `default` or `my-workgroup`)

#### Option 2: Provisioned

**Cluster Identifier:**

- Go to [AWS Redshift Provisioned Clusters](https://console.aws.amazon.com/redshiftv2/home#clusters)
- Find your cluster in the list
- Copy the **Cluster identifier** (e.g., `redshift-cluster-1`)

### Authentication

OWOX Data Marts uses AWS IAM credentials to authenticate with Redshift Data API.

#### Access Key ID

Your AWS Access Key ID for authentication.

**How to create IAM credentials:**

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Navigate to **Users** → Select your user or create a new one
3. Go to **Security credentials** tab
4. Click **Create access key**
5. Choose **Application running outside AWS**
6. Copy the **Access key ID**

#### Secret Access Key

Your AWS Secret Access Key (shown only once during creation).

> **Security Best Practice:**
>
> - Never share your secret access key
> - Store it securely (use AWS Secrets Manager or similar)
> - Rotate keys regularly
> - Use IAM policies to grant minimum required permissions

### Required IAM Permissions

Your IAM user or role needs the following permissions:

**For Serverless:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "redshift-data:ExecuteStatement",
        "redshift-data:DescribeStatement",
        "redshift-data:GetStatementResult",
        "redshift-serverless:GetCredentials"
      ],
      "Resource": "*"
    }
  ]
}
```

**For Provisioned Cluster:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "redshift-data:ExecuteStatement",
        "redshift-data:DescribeStatement",
        "redshift-data:GetStatementResult",
        "redshift:GetClusterCredentials"
      ],
      "Resource": "*"
    }
  ]
}
```

> **Tip:** You can attach the AWS managed policy `AmazonRedshiftDataFullAccess` for quick setup, but consider using a custom policy with minimal permissions for production.
> You can set permissions to certain database and tables for more security. Example: `"Resource": "arn:aws:redshift:us-east-1:123456789012"`

## 5. Finalize Setup

Review your entries and click **Save** to add the **Storage configuration**, or **Cancel** to exit without saving.

Once saved, OWOX Data Marts will validate the connection to ensure all credentials are correct.

## Grand Permissions to create schemas in database

If you want to create schemas in database (upload data from connector based data mart), you need to grant permissions to the user who will be used to upload data.

```sql
GRANT CREATE ON DATABASE dev TO "IAM:<USERNAME_IN_IAM>";
```

> **Tip:** You can find your username in IAM in the [AWS IAM Console](https://console.aws.amazon.com/iam/) in the **Users** tab.

## Next Steps

After configuring your AWS Redshift storage:

1. **Create a Data Mart** that uses this storage
2. **Define your data structure** with Redshift-specific field types
3. **Configure a Connector** to load data into Redshift
4. **Run reports** and export data from your Redshift tables

## Understanding Schema Configuration

Unlike other storage types, **Schema** is configured at the **Connector level**, not at the Storage level.

When you create a connector:

- **Step 5: Target Setup** will ask for:
  - **Schema name** (required) - e.g., `public`, `analytics`, `my_schema`
  - **Table name** (required) - e.g., `user_events`, `sales_data`

The schema and table will be automatically created during the first Data Mart run if they don't exist.

## Troubleshooting

### Connection Failed

- Verify your AWS region is correct
- Ensure the database name exists in your Redshift cluster/workgroup
- Check that workgroup name or cluster identifier is spelled correctly
- Verify your Access Key ID and Secret Access Key are correct

### Permission Denied

Make sure your IAM user has the required permissions listed above. You can test permissions by running:

```bash
aws redshift-data execute-statement \
  --region us-east-1 \
  --database dev \
  --workgroup-name my-workgroup \
  --sql "SELECT 1"
```

### "Schema does not exist" Error

- Schema is now configured in the **Connector setup** (Step 5), not in Storage
- Make sure you've entered a schema name when creating the connector
- The schema will be automatically created if it doesn't exist

### Query Timeout

- Redshift Data API has a 5-minute query timeout
- For large data loads, consider breaking them into smaller batches
- Check your warehouse/cluster size and scaling settings

### Access Denied to Database

Ensure your Redshift database allows access from the IAM credentials:

**For Serverless:**

```sql
GRANT ALL ON DATABASE dev TO "IAM:<USERNAME_IN_IAM>";
```

**For Provisioned:**

```sql
GRANT ALL ON DATABASE dev TO "IAM:<USERNAME_IN_IAM>";
```

## Additional Resources

- [AWS Redshift Documentation](https://docs.aws.amazon.com/redshift/)
- [Redshift Data API Guide](https://docs.aws.amazon.com/redshift/latest/mgmt/data-api.html)
- [IAM Permissions for Redshift](https://docs.aws.amazon.com/redshift/latest/mgmt/redshift-iam-access-control-overview.html)
- [Redshift Serverless Guide](https://docs.aws.amazon.com/redshift/latest/mgmt/serverless-whatis.html)
