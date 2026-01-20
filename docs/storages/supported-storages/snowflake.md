# Snowflake

## 1. Go to the Storages Page

In the OWOX Data Marts web application, navigate to **Storages** from the main navigation pane and click **+ New Storage**.

![This image illustrates the Snowflake storage configuration screen, highlighting the form fields required for specifying the warehouse name. The arrow in the screenshot is pointing to the input field where users enter the warehouse name, guiding them through the setup process. The interface features a sidebar navigation menu on the left and a main content area displaying the configuration steps.](/docs/res/screens/snowflake_newdestination.png)

## 2. Choose Storage Type

Click **Snowflake** to create a new **Storage** configuration.
> Upon selecting the **+ New Storage** button and specifying the desired storage type, a Storage entry is created.
> You can create **Data Mart** entities and model a data structure for your project prior to configuring the **Storage**.
> Note that **Data Mart** cannot be validated or published until the associated **Storage** is fully configured.

## 3. Add title

Give the storage configuration a clear **title**, eg `OWOX Data Marts – Snowflake Production`.

## 4. Set General Settings and Connection Details

### Enter Account Identifier

To find the region and locator for your account, see [Snowflake documentation](https://docs.snowflake.com/en/user-guide/admin-account-identifier#finding-the-region-and-locator-for-an-account).

1. Open the account selector and review the list of accounts that you previously signed in to.
2. Find the region in the account selector (e.g. US West (Oregon)).
3. Compare the found region with the **Account Identifier Region** in [Snowflake documentation](https://docs.snowflake.com/en/user-guide/admin-account-identifier#non-vps-account-locator-formats-by-cloud-platform-and-region) for locator formats by cloud platform and region.
4. Select **View account details**.

   ![Account selector interface in Snowflake web application showing a list of available accounts. The highlighted account displays options including View account details. Sidebar navigation is visible on the left, and the main content area presents account information in a neutral, businesslike tone. On-screen text includes View account details.](/docs/res/screens/snowflake_viewaccount.png)

5. The **Account Details** dialog displays information about the account, including the account identifier and the account URL.
6. Copy part of your account identifier from the **Account locator** field.

   ![ Snowflake Account Details dialog showing the Account locator field highlighted for copying. The dialog displays account information such as account identifier and account URL in a clean, businesslike interface. On-screen text includes Account locator and other account details. The environment is a neutral web application with sidebar navigation visible on the left. The tone is instructional and professional.](/docs/res/screens/snowflake_accountlocator.png)

7. Create the account identifier by combining the locator and the region like this: `locator.region`

   Examples:
   - `xy12345.ap-northeast-3.aws`
   - `xy12345.north-europe.azure`

> **Tip:** You can also find your account identifier in Snowflake by running:
>
> ```sql
> SELECT CURRENT_ACCOUNT();
> ```

### Enter Warehouse Name

- In Snowflake, go to **Compute → Warehouses**
- Use an existing warehouse or create a new one
- Copy the warehouse name (e.g., `OWOX_DATA_MARTS`)

> **Best Practice:** Use a dedicated warehouse for OWOX Data Marts to better control costs and performance.

![Snowflake web UI showing Warehouse Activity with blue bars over recent dates; red circles highlight the warehouse name OWOX_DATA_MARTS in the header and the Compute → Warehouses menu path on the left.](/docs/res/screens/snowflake_copytitle.png)

### Choose Authentication Method

Snowflake supports two authentication methods:

#### Option 1: Username and Password (Recommended for getting started)

1. **Username**: Your Snowflake username
2. **Password**: Your Snowflake password

This is the simplest method to get started.

#### Option 2: Key Pair Authentication (Recommended for production)

Key pair authentication provides enhanced security and is recommended for production environments.

##### How to set up key pair authentication

1. **Generate a private key** (in the terminal on your local machine):

   ```bash
   openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt
   ```

2. **Generate a public key**:

   ```bash
   openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
   ```

   ![Konsole terminal on Linux showing two openssl commands run from the home directory: one generating an RSA private key with pkcs8 and nocrypt options, and a second exporting the public key to rsa_key.pub, both finishing at the shell prompt.](/docs/res/screens/snowflake_terminal.png)

Open the resulting `rsa_key.pub` file to copy the key. If you are not sure where it was saved, check your current directory: run `pwd` on macOS/Linux, or use `echo %cd%` (or `cd`) in Command Prompt on Windows.

![Konsole terminal window showing the same openssl commands followed by the `pwd` command to print the working directory, with output indicating the files were saved in /home/vp.](/docs/res/screens/snowflake_pwd.png)

1. **Assign the public key to your Snowflake user**:

   ```sql
   ALTER USER <username> SET RSA_PUBLIC_KEY='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...';
   ```

   (Remove the `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` lines and concatenate the remaining lines)

2. **Enter the private key** in OWOX Data Marts:
   - Copy the entire contents of `rsa_key.p8` file (including the BEGIN/END lines)
   - Paste it into the **Private Key** field

3. **Optional - Private Key Passphrase**:
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
