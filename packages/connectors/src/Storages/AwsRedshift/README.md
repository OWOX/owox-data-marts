# AWS Redshift Storage Connector

Storage connector for AWS Redshift using the Redshift Data API. Supports both Serverless and Provisioned cluster deployments with three authentication methods.

## Features

- **Async Data API**: Uses AWS Redshift Data API for serverless query execution
- **Multiple Authentication Methods**:
  - Username/Password authentication
  - IAM role-based authentication
  - Temporary credentials (access key + secret key + session token)
- **Deployment Types**:
  - Serverless workgroups
  - Provisioned clusters
- **UPSERT Operations**: Uses MERGE statements with temp tables for efficient data updates
- **Automatic Schema Management**: Creates tables and adds columns as needed
- **Batch Processing**: Configurable batch size for large data sets

## Configuration Parameters

### Required Parameters

- **AWSRegion** (string): AWS region where Redshift cluster/workgroup is located (e.g., 'us-east-1')
- **Database** (string): Database name to connect to
- **DestinationTableName** (string): Name of the target table for data storage

### Deployment Configuration (one required)

- **WorkgroupName** (string, optional): Serverless workgroup name
- **ClusterIdentifier** (string, optional): Provisioned cluster identifier

**Note**: You must provide either `WorkgroupName` OR `ClusterIdentifier`, but not both.

### Authentication Parameters

#### For Temporary Credentials Authentication

- **AWSAccessKeyId** (string, optional): AWS access key ID
- **AWSSecretAccessKey** (string, optional): AWS secret access key
- **AWSSessionToken** (string, optional): Session token for temporary credentials

**Note**: For IAM and Username/Password authentication, these parameters are not required as authentication is handled through AWS default credentials chain.

### Optional Parameters

- **MaxBufferSize** (number, optional): Maximum number of records per batch insert (default: 250)

**Note**: Schema is now configured at the connector level, not in storage configuration.

## Usage Example

```javascript
import { AwsRedshiftStorage } from './AwsRedshift/AwsRedshiftStorage.js';
import { AbstractConfig } from '../AbstractConfig.js';

// Configuration for Serverless with Temporary Credentials
const config = new AbstractConfig({
  AWSRegion: 'us-east-1',
  AWSAccessKeyId: 'YOUR_ACCESS_KEY',
  AWSSecretAccessKey: 'YOUR_SECRET_KEY',
  AWSSessionToken: 'YOUR_SESSION_TOKEN',
  Database: 'mydb',
  WorkgroupName: 'my-serverless-workgroup',
  Schema: 'my_schema',
  DestinationTableName: 'my_table',
  MaxBufferSize: 250
});

// Define unique key columns and schema
const uniqueKeys = ['id'];
const schema = {
  id: { type: 'integer', description: 'Primary key' },
  name: { type: 'string', description: 'Name field' },
  created_at: { type: 'timestamp', description: 'Creation timestamp' }
};

// Create storage instance
const storage = new AwsRedshiftStorage(
  config,
  uniqueKeys,
  schema,
  'My Redshift Storage'
);

// Initialize connection
await storage.init();

// Save data
const data = [
  { id: 1, name: 'John Doe', created_at: '2025-01-01 10:00:00' },
  { id: 2, name: 'Jane Smith', created_at: '2025-01-02 11:30:00' }
];

await storage.saveData(data);
```

## Schema Definition

The connector supports PostgreSQL-based data types. You can specify custom Redshift types using the `RedshiftType` property:

```javascript
const schema = {
  id: { type: 'integer', RedshiftType: 'BIGINT' },
  amount: { type: 'float', RedshiftType: 'DECIMAL(10,2)' },
  data: { type: 'json', RedshiftType: 'SUPER' },
  created_at: { type: 'timestamp', RedshiftType: 'TIMESTAMPTZ' }
};
```

### Supported Type Mappings

| Schema Type | Redshift Type |
|-------------|---------------|
| integer, int | BIGINT |
| float, number | DOUBLE PRECISION |
| boolean, bool | BOOLEAN |
| date | DATE |
| datetime, timestamp | TIMESTAMP |
| json | SUPER |
| string (default) | VARCHAR(65535) |

## Authentication Methods

### 1. Username/Password Authentication

Uses database username and password. Authentication is handled per-query through the Data API.

### 2. IAM Role Authentication

Uses AWS IAM roles attached to the execution environment. No explicit credentials needed in configuration.

```javascript
const config = new AbstractConfig({
  AWSRegion: 'us-east-1',
  Database: 'mydb',
  WorkgroupName: 'my-workgroup',
  DestinationTableName: 'my_table'
});
```

### 3. Temporary Credentials Authentication

Uses STS temporary credentials for cross-account or federated access:

```javascript
const config = new AbstractConfig({
  AWSRegion: 'us-east-1',
  AWSAccessKeyId: 'ASIA...',
  AWSSecretAccessKey: 'secret...',
  AWSSessionToken: 'token...',
  Database: 'mydb',
  ClusterIdentifier: 'my-cluster',
  DestinationTableName: 'my_table'
});
```

## How It Works

### Data Write Process

1. **Table Creation**: Automatically creates table if it doesn't exist with primary key constraint
2. **Column Management**: Detects and adds new columns from incoming data
3. **Batch Processing**: Splits large datasets into batches (MaxBufferSize)
4. **Temp Table**: Creates temporary table for batch data
5. **MERGE Operation**: Uses SQL MERGE to upsert data (update existing, insert new)
6. **Cleanup**: Drops temporary table

### Query Execution Pattern

All queries follow an asynchronous pattern:

1. **Submit Query**: `ExecuteStatement` returns statement ID
2. **Poll Status**: Checks query status every 1 second (max 300 attempts / 5 minutes)
3. **Retrieve Results**: Uses `GetStatementResult` with pagination for large result sets

## Limitations

- Maximum query execution timeout: 5 minutes
- Results pagination: Handled automatically via NextToken
- VARCHAR fields default to maximum length (65535)
- Temp tables are session-specific and automatically cleaned up

## Error Handling

The connector provides detailed error messages for:

- Connection failures
- Query execution errors
- Authentication issues
- Timeout errors (5 minute limit)
- Configuration validation errors

## Dependencies

- `@aws-sdk/client-redshift-data` (v3.940.0+)

## License

MIT License - Copyright (c) OWOX, Inc.
