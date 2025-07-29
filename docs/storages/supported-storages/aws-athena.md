# AWS Athena

AWS Athena is an interactive query service that enables SQL-based analysis of data stored in Amazon S3.  
This page details how to configure AWS Athena as a Storage in OWOX Data Marts, allowing you to incorporate it seamlessly into your self-service analytics environment.

---

## Configuration Steps

### AWS Console

#### 1. Create or Select an IAM User, Attach Policies, and Generate an Access Key

To interact with AWS Athena, you need an IAM user with appropriate permissions and an Access Key.

1. Sign in to your AWS account and open the [AWS Management Console](https://console.aws.amazon.com/).
2. Navigate to **IAM** > **Users**.
3. Select an existing user or click **Add user** to create a new one.
4. If creating a new user:
   - Enter a **User name** (e.g., "OWOXDataMarts").
   - Select **Programmatic access** for the access type.
   - Click **Next: Permissions**.
5. Attach the required policies:
   - On the **Set permissions** page, click **Create policy**
   - In the policy editor, select the JSON tab and paste the following JSON:

     ```json
     {"Version":"2012-10-17","Statement":[{"Action":["athena:ListDataCatalogs","athena:GetDataCatalog","athena:ListDatabases","athena:GetDatabase","athena:StartQueryExecution","athena:StopQueryExecution","athena:GetQueryExecution","athena:GetQueryResults","athena:GetWorkGroup","athena:BatchGetQueryExecution"],"Effect":"Allow","Resource":"*","Sid":"AthenaPermissions"},{"Action":["glue:CreateTable","glue:UpdateTable","glue:DeleteTable","glue:GetDatabases","glue:GetDatabase","glue:GetTable","glue:GetTables","glue:CreateDatabase","glue:DeleteDatabase"],"Effect":"Allow","Resource":"*","Sid":"GlueAthenaPermissions"},{"Action":["s3:ListBucket","s3:GetBucketLocation","s3:GetObject","s3:ListBucketMultipartUploads","s3:ListMultipartUploadParts","s3:AbortMultipartUpload","s3:PutObject","s3:DeleteObject"],"Effect":"Allow","Resource":"*","Sid":"S3ViaAthenaPermissions"}]}
     ```

     > ☝️ This policy grants permissions for Athena operations, AWS Glue catalog management (used by Athena for metadata), and S3 access for storing and retrieving query results.
   - Click Review policy, provide a name (e.g., "OWOXDataMartsAthenaAccess"), and click Create policy.
   - Return to the Set permissions page, select the newly created policy, and attach it to the user.

6. Click **Create user** to finalize the user creation process.
7. Go to the user’s page, click the **Security credentials** tab, and then click **Create access key**.
8. Note down the **Access Key ID** and **Secret Access Key** (you’ll need to reveal the Secret Access Key by clicking "Show"). Save these securely, as they are required for OWOX Data Marts configuration.

#### 2. Identify an S3 bucket designated for storing query results

Athena requires an S3 bucket to store query results.

1. Open the [AWS S3 Console](https://console.aws.amazon.com/s3/).
2. Select an existing bucket or click **Create bucket**.
3. If creating a new bucket:
   - Enter a unique **Bucket name** (e.g., "athena-query-results-123").
   - Choose a **Region** (e.g., "us-east-1"). Note this region for later use.
   - Keep default settings unless specific adjustments are needed, then click **Create bucket**.
4. Record the bucket name and region, as you’ll need them for both Athena setup and OWOX Data Marts configuration.

#### 3. Enable the Athena API

Ensure the Athena API is enabled in your AWS account.

1. Open the [AWS Athena Console](https://console.aws.amazon.com/athena/).
2. If Athena isn’t set up, click **Get Started**.
3. During setup, specify the S3 bucket created or selected in the previous step as the query result location.
4. Follow any additional on-screen prompts to complete the initial setup.

---

### OWOX Data Marts

#### 1. Access the Storages Page

In the OWOX Data Marts web application, navigate to **Storages** from the main navigation pane and click **+ New Storage**.

#### 2. Choose Storage Type

Click **AWS Athena** on the **New Storage** modal window appeared to create a new **Storage** configuration.
> ☝️ Upon selecting the **+ New Storage** button and specifying the desired storage type, a Storage entry is created. You can create **Data Mart** entities and model a data structure for your project prior to configuring the **Storage**.  
> Note that **Data Mart** cannot be validated or published until the associated **Storage** is fully configured.

#### 3. Set General Settings and Connection Details

- **Title**: Provide a unique name for this Storage (e.g., "Analytics Warehouse").
- **Region**: Enter the AWS region hosting your Athena instance (e.g., us-east-1), available in the AWS Management Console.
- **Output Bucket**: Provide the S3 bucket name for query results.
- **Access Key ID**: Enter the Access Key ID for an IAM user with Athena and S3 access.
- **Secret Access Key**: Provide the matching Secret Access Key.

#### 4. Finalize Setup

Review your entries and click **Save** to integrate the Storage, or **Cancel** to exit without saving the configuration.
