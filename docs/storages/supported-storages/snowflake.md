# Snowflake

## Overview

This tutorial explains how to securely configure **Snowflake as a storage** in **OWOX Data Marts**.

## Go to the Storages Page

In the OWOX Data Marts web application, navigate to **Storages** from the main navigation pane and click **+ New Storage**.

![This image illustrates the Snowflake storage configuration screen, highlighting the form fields required for specifying the warehouse name. The arrow in the screenshot is pointing to the input field where users enter the warehouse name, guiding them through the setup process. The interface features a sidebar navigation menu on the left and a main content area displaying the configuration steps.](/docs/res/screens/snowflake_newdestination.png)

## Choose Storage Type

Click **Snowflake** to create a new **Storage** configuration.
> Upon selecting the **+ New Storage** button and specifying the desired storage type, a Storage entry is created.
> You can create **Data Mart** entities and model a data structure for your project prior to configuring the **Storage**.
> Note that **Data Mart** cannot be validated or published until the associated **Storage** is fully configured.

## Add title

Give the storage configuration a clear **title**, e.g., `Snowflake Production`.

## Set General Settings and Connection Details

### Enter Account Identifier

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

![Snowflake Account Details dialog with the Account locator field filled in, showing a sample account identifier. The dialog displays account information such as account identifier in a clean, businesslike interface. Sidebar navigation is visible on the left, and the main content area presents account details in a professional tone.](/docs/res/screens/snowflake_filledaccount.png)

### Enter Warehouse Name

- In Snowflake, go to **Compute → Warehouses**
- Use an existing warehouse or create a new one
- Copy the warehouse name (e.g., `OWOX_DATA_MARTS`)

> **Best Practice:** Use a dedicated warehouse for OWOX Data Marts to better control costs and performance.

![Snowflake web UI showing Warehouse Activity with blue bars over recent dates; red circles highlight the warehouse name OWOX_DATA_MARTS in the header and the Compute → Warehouses menu path on the left.](/docs/res/screens/snowflake_copytitle.png)

Enter warhouse name in the appropriate field.

### Choose Authentication Method

Snowflake supports two authentication methods:

#### Option 1: Username + Programmatic Access Token (PAT)

1. **Username**: Your Snowflake user login
2. **Programmatic Access Token (PAT)**: A secure token used instead of a password for programmatic access

##### Step 1. Generate a Programmatic Access Token (PAT)

1. Log in to Snowflake.
2. Go to **Settings → Authentication**.
3. Scroll down to **Programmatic access tokens**.
4. Click **Generate new token**.
5. Specify:
   - **Token name** (for example: `OWOX_TOKEN`)
   - **Expiration period** (up to **1 year**)
6. Click **Generate**.

> ⚠️ **Important**  
> Copy the token immediately or download it and store it securely (for example, in a password manager).  
> You will **not be able to view the token again** after closing the dialog.

---

##### Step 2. Configure Network Policy (Admin Action Required)

For security reasons, Snowflake requires a **network policy** when PAT authentication is used.  
A Snowflake **account administrator** must explicitly allow connections from trusted IP addresses.

Example of the query:

```sql

CREATE NETWORK POLICY <policy_name>
  ALLOWED_IP_LIST = ('34.38.103.182');

ALTER USER <your_user>
  SET NETWORK_POLICY = <policy_name>;

```

**Replace:**

- `<policy_name>` with a descriptive name (for example, `owox_network_policy`)
- `<your_user>` with your Snowflake username

✅ **After the policy is applied**, Snowflake will allow PAT-based authentication **only from the specified IP address**.

---

##### Step 3. Configure Storage

Once the network policy is active:

1. Open your **storage settings**.
2. Select **Username & PAT** as the authentication method.
3. Enter:
   - Your **Snowflake username**
   - Your **PAT** in the token field
4. Go to the [Finalize Setup](#finalize-setup).

#### Option 2: Key Pair Authentication

Key pair authentication provides **enhanced security** and is the **recommended approach** for setting up Snowflake as a storage

##### How to set up key pair authentication

- **Generate a private key**

Run the following command in a terminal on your local machine:

   ```bash
   openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt
   ```

> *If you prefer to protect the key with a passphrase, omit the `-nocrypt` flag.*

- **Generate a public key**:

   ```bash
   openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
   ```

   ![Konsole terminal on Linux showing two openssl commands run from the home directory: one generating an RSA private key with pkcs8 and nocrypt options, and a second exporting the public key to rsa_key.pub, both finishing at the shell prompt.](/docs/res/screens/snowflake_terminal.png)

Open the `rsa_key.pub` file in any text editor (for example, VS Code or Sublime Text) and copy its contents. If you are not sure where it was saved, check your current directory: run `pwd` on macOS/Linux, or use `echo %cd%` (or `cd`) in Command Prompt on Windows.

![Konsole terminal window showing the same openssl commands followed by the `pwd` command to print the working directory, with output indicating the files were saved in /home/vp.](/docs/res/screens/snowflake_pwd.png)

**Assign the public key to your Snowflake user**:

   ```sql
   ALTER USER <username> SET RSA_PUBLIC_KEY='MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...';
   ```

**Important formatting rules**:

- Remove the lines:

  ``` text
  -----BEGIN PUBLIC KEY-----
  -----END PUBLIC KEY-----
  ```

- Concatenate the remaining lines into **one continuous string**
- Do **not** include line breaks or spaces

**Configure Key Pair Authentication in OWOX Data Marts**:

1. Choose **Key Pair** as the authentication method.
2. Open the `rsa_key.p8` file.
3. Copy the **entire contents**, including:

   ``` text
   -----BEGIN PRIVATE KEY-----
   ...
   -----END PRIVATE KEY-----
   ```

4. Paste it into the **Private Key** field.

**(Optional) Private Key Passphrase**:

- If your private key was created **with encryption**, enter the passphrase.
- If you used the `-nocrypt` option, leave this field **empty**.

🔒 **Security note**  
Never share your private key.  
Store it securely (for example, in a password manager or secret vault).

## Finalize Setup

1. Review all entered values.
2. Click **Save** to add the Snowflake storage configuration  
   — or **Cancel** to exit without saving.

OWOX Data Marts will automatically validate the connection.

---

## Next Steps

After Snowflake storage is configured:

1. Create a **Data Mart** that uses this storage
2. Configure a **Connector** to load data into Snowflake
3. Run reports and work with data in your Snowflake tables

---

## Troubleshooting

### ❌ Network policy error

``` text
Access validation failed. Snowflake access error:
Failed to connect to Snowflake: Network policy is required.
```

**Cause:**  
A Snowflake administrator has not applied a required network policy to your user.

**Solution:**  
Return to [Step 2: Configure Network Policy (Admin Action Required)](#step-2-configure-network-policy-admin-action-required) and ask an admin to apply the policy.  
After that, try adding the storage again.

---

### ❌ MFA authentication error

``` text
Access validation failed. Snowflake access error:
Failed to authenticate: MFA authentication is required,
but none of your current MFA methods are supported
for programmatic authentication.
```

**Cause:**  
You entered a **password** instead of a PAT (for Option 1) or used the wrong authentication method.

**Solution:**

For **Username + PAT** authentication: [generate a PAT](#option-1-username--programmatic-access-token-pat) and use it instead of a password

## Additional Resources

- [Snowflake Documentation](https://docs.snowflake.com/)
- [Key Pair Authentication Guide](https://docs.snowflake.com/en/user-guide/key-pair-auth.html)
- [Snowflake Account Identifiers](https://docs.snowflake.com/en/user-guide/admin-account-identifier.html)
