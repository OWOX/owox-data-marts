# Snowflake

## 1. Go to the Storages Page

In the OWOX Data Marts web application, navigate to **Storages** from the main navigation pane and click **+ New Storage**.

## 2. Choose Storage Type

Click **Snowflake** to create a new **Storage** configuration.
> Upon selecting the **+ New Storage** button and specifying the desired storage type, a Storage entry is created.
> You can create **Data Mart** entities and model a data structure for your project prior to configuring the **Storage**.
> Note that **Data Mart** cannot be validated or published until the associated **Storage** is fully configured.

## 3. Add title

Give the storage configuration a clear **title**, eg `OWOX Data Marts – Snowflake Production`.

## 4. Set General Settings and Connection Details

### Enter Account Identifier

- Log in to your [Snowflake account](https://app.snowflake.com/)
- Your account identifier is in the URL format: `https://<account_identifier>.snowflakecomputing.com`
- Example: If your URL is `https://xy12345.us-east-1.snowflakecomputing.com`, enter `xy12345.us-east-1`

> **Tip:** You can also find your account identifier in Snowflake by running:
>
> ```sql
> SELECT CURRENT_ACCOUNT();
> ```

### Enter Warehouse Name

- In Snowflake, go to **Admin → Warehouses**
- Use an existing warehouse or create a new one
- Copy the warehouse name (e.g., `COMPUTE_WH`)

> **Best Practice:** Use a dedicated warehouse for OWOX Data Marts to better control costs and performance.

### Choose Authentication Method

Snowflake supports two authentication methods:

#### Option 1: Username and Password (Recommended for getting started)

1. **Username**: Your Snowflake username
2. **Password**: Your Snowflake password

This is the simplest method to get started.

#### Option 2: Key Pair Authentication (Recommended for production)

Key pair authentication provides enhanced security and is recommended for production environments.

##### How to set up key pair authentication

1. **Generate a private key** (on your local machine):

   ```bash
   openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt
   ```

2. **Generate a public key**:

   ```bash
   openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
   ```

3. **Assign the public key to your Snowflake user**:

   ```sql
   ALTER USER <username> SET RSA_PUBLIC_KEY='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...';
   ```

   (Remove the `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` lines and concatenate the remaining lines)

4. **Enter the private key** in OWOX Data Marts:
   - Copy the entire contents of `rsa_key.p8` file (including the BEGIN/END lines)
   - Paste it into the **Private Key** field

5. **Optional - Private Key Passphrase**:
   - If you encrypted your private key with a passphrase, enter it here
   - If you used `-nocrypt` option (as shown above), leave this blank

> **Security Note:** Never share your private key. Store it securely and never commit it to version control.

### Optional: Role Name

If your Snowflake account uses custom roles, enter the role name here (e.g., `DATA_ENGINEER`).

If left empty, the default role for the user will be used.

## 5. Finalize Setup

Review your entries and click **Save** to add the **Storage configuration**, or **Cancel** to exit without saving.

Once saved, OWOX Data Marts will validate the connection to ensure all credentials are correct.

## Next Steps

After configuring your Snowflake storage:

1. **Create a Data Mart** that uses this storage
2. **Define your schema** with Snowflake-specific field types
3. **Configure a Connector** to load data into Snowflake
4. **Run reports** and export data from your Snowflake tables

## Troubleshooting

### Connection Failed

- Verify your account identifier is correct (format: `account.region`)
- Ensure the warehouse name is spelled correctly and exists
- Check that your username and password are correct
- For key pair auth, verify the public key is properly assigned to the user

### Permission Denied

Make sure your Snowflake user has the following privileges:

- `USAGE` on the warehouse
- `CREATE SCHEMA` on the database
- `CREATE TABLE` on the schema
- `SELECT`, `INSERT`, `UPDATE` on tables

### Warehouse Not Running

Ensure your warehouse is running and not suspended. You can check this in Snowflake:

```sql
SHOW WAREHOUSES;
```

## Additional Resources

- [Snowflake Documentation](https://docs.snowflake.com/)
- [Key Pair Authentication Guide](https://docs.snowflake.com/en/user-guide/key-pair-auth.html)
- [Snowflake Account Identifiers](https://docs.snowflake.com/en/user-guide/admin-account-identifier.html)
