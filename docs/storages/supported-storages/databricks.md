# Databricks Storage

OWOX Data Marts supports Databricks as a storage destination for your data marts. This guide will help you connect your Databricks workspace to OWOX.

## Overview

Databricks is a unified data analytics platform built on Apache Spark that provides a lakehouse architecture combining the best features of data lakes and data warehouses. With OWOX Data Marts, you can:

- Create and manage data marts in your Databricks workspace
- Use SQL warehouses for fast query execution
- Leverage Unity Catalog for data governance
- Store data in Delta Lake format with ACID transactions

## Prerequisites

Before connecting Databricks to OWOX, ensure you have:

1. A Databricks workspace (AWS, Azure, or GCP)
2. A SQL warehouse (compute resource for running queries)
3. Appropriate permissions to:
   - Create and manage Personal Access Tokens
   - Create catalogs, schemas, and tables (or access to existing ones)
   - Execute queries on the SQL warehouse

## Connection Setup

### Step 1: Find Your Workspace URL

Your Databricks workspace URL (host) is the hostname you see in your browser when accessing Databricks.

**Format by cloud provider:**

- **AWS**: `dbc-12345678-90ab.cloud.databricks.com`
- **Azure**: `adb-123456789.7.azuredatabricks.net`
- **GCP**: `12345678901234.5.gcp.databricks.com`

**To find it:**

1. Sign in to your Databricks workspace
2. Look at the URL in your browser's address bar
3. Copy the hostname (everything before the first `/`)

### Step 2: Get SQL Warehouse HTTP Path

The HTTP path identifies which SQL warehouse will be used for query execution.

**To find it:**

1. In your Databricks workspace, click **SQL Warehouses** in the sidebar
2. Select the SQL warehouse you want to use
3. Go to the **Connection Details** tab
4. Copy the **HTTP Path** value

**Example:** `/sql/1.0/warehouses/abc123def456789`

### Step 3: Generate a Personal Access Token

Personal Access Tokens (PAT) provide secure authentication to Databricks.

**To generate a token:**

1. Sign in to your Databricks workspace
2. Click your username in the top right corner
3. Select **User Settings**
4. Go to the **Developer** tab
5. Next to **Access tokens**, click **Manage**
6. Click **Generate new token**
7. (Optional) Enter a comment describing the token's purpose (e.g., "OWOX Data Marts")
8. (Optional) Set a lifetime for the token
9. Click **Generate**
10. **Important:** Copy and save the token immediately - you won't be able to see it again!

**Security recommendations:**

- Never share your Personal Access Token
- Set an expiration date when possible
- Revoke tokens that are no longer needed
- Use separate tokens for different applications

### Step 4: Configure Storage in OWOX

1. Go to **Settings** → **Storages** in OWOX
2. Click **Add Storage**
3. Select **Databricks** as the storage type
4. Fill in the required fields:
   - **Title**: A friendly name for this storage (e.g., "Production Databricks")
   - **Host**: Your workspace URL from Step 1
   - **HTTP Path**: SQL warehouse path from Step 2
   - **Personal Access Token**: Token generated in Step 3
5. Click **Test Connection** to verify the connection
6. Click **Save**

## Catalog and Schema Configuration

Unlike some other storages, Databricks catalog and schema are **not** configured at the storage level. Instead, they are specified when creating connector data marts:

- When setting up a connector, you'll specify the fully qualified table name in the format: `catalog.schema.table_name`
- This allows flexibility to use different catalogs and schemas for different data marts
- If you're not using Unity Catalog, you can use the default `hive_metastore` catalog

**Examples:**

- `main.analytics.user_events` (Unity Catalog)
- `hive_metastore.default.data` (without Unity Catalog)

## Supported Features

### Data Types

Databricks Data Marts support the following Databricks SQL data types:

| OWOX Type | Databricks Type |
|-----------|-----------------|
| string    | STRING          |
| number    | DOUBLE          |
| integer   | BIGINT          |
| boolean   | BOOLEAN         |
| date      | DATE            |
| datetime  | TIMESTAMP       |
| timestamp | TIMESTAMP       |
| array     | ARRAY   |
| object    | STRUCT<>        |

### Operations

- **MERGE operations**: Data updates use Databricks MERGE statements for efficient upserts
- **Auto-create tables**: Tables are created automatically if they don't exist
- **Schema evolution**: New columns are added automatically as needed
- **Delta Lake**: All tables use Delta Lake format with ACID transactions

## Unity Catalog

If your workspace uses Unity Catalog:

1. Ensure you have appropriate permissions on the catalog and schema
2. The catalog will be created automatically if it doesn't exist (requires `CREATE CATALOG` permission)
3. The schema will be created automatically if it doesn't exist (requires `CREATE SCHEMA` permission)
4. Tables are created with full three-level namespace: `catalog.schema.table`

If Unity Catalog is not enabled, you can use the default `hive_metastore` catalog.

## Troubleshooting

### Connection Issues

**Problem:** "Failed to connect to Databricks"

**Solutions:**

- Verify your workspace URL is correct (no `https://` prefix needed)
- Check that the Personal Access Token is valid and not expired
- Ensure the token hasn't been revoked
- Verify the SQL warehouse is running (it should auto-start when needed)

**Problem:** "SQL warehouse not found"

**Solutions:**

- Verify the HTTP path is correct
- Check that the SQL warehouse exists and you have access to it
- Ensure the warehouse hasn't been deleted or renamed

### Permission Issues

**Problem:** "Permission denied" when creating tables

**Solutions:**

- Verify you have `CREATE TABLE` permission on the catalog/schema
- Check Unity Catalog permissions if applicable
- Ensure your user or service principal has appropriate grants

**Problem:** "Catalog not found" errors

**Solutions:**

- If using Unity Catalog, verify the catalog exists or you have `CREATE CATALOG` permission
- Use the correct three-level namespace: `catalog.schema.table`
- For non-Unity workspaces, use `hive_metastore` as the catalog name

### Query Execution Issues

**Problem:** Queries are slow

**Solutions:**

- Check if the SQL warehouse is properly sized for your workload
- Consider using a larger warehouse size
- Enable auto-scaling if not already enabled
- Review query execution plans for optimization opportunities

**Problem:** "Query execution failed" errors

**Solutions:**

- Check the error message for specific SQL syntax issues
- Verify table and column names are correctly quoted
- Ensure data types are compatible

## Best Practices

1. **Warehouse Management**
   - Use appropriately sized SQL warehouses for your workload
   - Enable auto-stop to reduce costs when warehouse is idle
   - Consider using different warehouses for different workloads

2. **Security**
   - Rotate Personal Access Tokens regularly
   - Set token expiration dates
   - Use workspace-level or account-level tokens as appropriate
   - Implement IP access lists if security requirements demand it

3. **Cost Optimization**
   - Use auto-stop for SQL warehouses
   - Right-size your warehouse (start small and scale up if needed)
   - Monitor DBU usage in Databricks billing console
   - Consider using serverless SQL warehouses when available

4. **Data Organization**
   - Use Unity Catalog for better data governance
   - Organize data marts into logical catalogs and schemas
   - Follow naming conventions for easier management
   - Document catalog and schema purposes

5. **Performance**
   - Use Delta Lake's optimization features (OPTIMIZE, VACUUM)
   - Consider partitioning large tables
   - Use appropriate data types for better compression
   - Monitor query performance and optimize as needed

## Additional Resources

- [Databricks SQL Warehouses Documentation](https://docs.databricks.com/sql/admin/sql-endpoints.html)
- [Personal Access Tokens Documentation](https://docs.databricks.com/dev-tools/auth/pat.html)
- [Unity Catalog Documentation](https://docs.databricks.com/data-governance/unity-catalog/index.html)
- [Delta Lake Documentation](https://docs.delta.io/)
- [Databricks SQL Reference](https://docs.databricks.com/sql/language-manual/index.html)

## Support

If you encounter issues not covered in this guide:

1. Check the [OWOX Documentation](https://docs.owox.com)
2. Contact OWOX Support
3. Review Databricks documentation for platform-specific issues
