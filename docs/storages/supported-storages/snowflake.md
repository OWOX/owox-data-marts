# Snowflake

## Overview

Use this guide to configure **Snowflake as a storage** in **OWOX Data Marts**. The steps below walk you from creating a storage record to finishing authentication and validation.

## Go to the Storages Page

In OWOX Data Marts, open **Storages** from the main navigation pane and click **+ New Storage**.

![This image illustrates the Snowflake storage configuration screen, highlighting the form fields required for specifying the warehouse name. The arrow in the screenshot is pointing to the input field where users enter the warehouse name, guiding them through the setup process. The interface features a sidebar navigation menu on the left and a main content area displaying the configuration steps.](/docs/res/screens/snowflake_newdestination.png)

## Choose Storage Type

Select **Snowflake**. The storage record is created immediately, but a Data Mart cannot be validated or published until the storage is fully configured.

## Add Title

Give the storage a clear **title**, e.g., `Snowflake Production`.

## Set General Settings and Connection Details

### Enter Account Identifier

1. In Snowflake, open the account selector and find your account.
2. Note the region shown there (for example, **US West (Oregon)**).
3. Click **View account details**.

   ![Account selector interface in Snowflake web application showing a list of available accounts. The highlighted account displays options including View account details. Sidebar navigation is visible on the left, and the main content area presents account information in a neutral, businesslike tone. On-screen text includes View account details.](/docs/res/screens/snowflake_viewaccount.png)

4. In **Account Details**, copy the value from **Account locator**.

   ![ Snowflake Account Details dialog showing the Account locator field highlighted for copying. The dialog displays account information such as account identifier and account URL in a clean, businesslike interface. On-screen text includes Account locator and other account details. The environment is a neutral web application with sidebar navigation visible on the left. The tone is instructional and professional.](/docs/res/screens/snowflake_accountlocator.png)

5. Build the **account identifier** as `locator.region` (examples: `xy12345.ap-northeast-3.aws`, `xy12345.north-europe.azure`).

> **Note:** For accounts in **AWS US West (Oregon)** the identifier can be just the locator (for example, `xy12345`). If the region is shown in your account selector, include it.
> **Tip:** You can also run `SELECT CURRENT_ACCOUNT();` in Snowflake to retrieve the identifier.

![Snowflake Account Details dialog with the Account locator field filled in, showing a sample account identifier. The dialog displays account information such as account identifier in a clean, businesslike interface. Sidebar navigation is visible on the left, and the main content area presents account details in a professional tone.](/docs/res/screens/snowflake_filledaccount.png)

### Enter Warehouse Name

- In Snowflake, go to **Compute → Warehouses**
- Use an existing warehouse or create a new one
- Copy the warehouse name (e.g., `OWOX_DATA_MARTS`)

> **Best Practice:** Use a dedicated warehouse for OWOX Data Marts to better control costs and performance.

![Snowflake web UI showing Warehouse Activity with blue bars over recent dates; red circles highlight the warehouse name OWOX_DATA_MARTS in the header and the Compute → Warehouses menu path on the left.](/docs/res/screens/snowflake_copytitle.png)

Enter the **warehouse name** in the storage form (use the exact name).

### Choose Authentication Method

Snowflake supports two authentication methods:

#### Option 1: Username + Programmatic Access Token (PAT)

1. **Username**: Your Snowflake user login
2. **Programmatic Access Token (PAT)**: A secure token used instead of a password for programmatic access

##### Step 1. Generate a Programmatic Access Token (PAT)

1. Log in to Snowflake.
2. Go to **Settings → Authentication** (user menu).
3. Scroll to **Programmatic access tokens** and click **Generate new token**.
4. Enter a **Token name** (e.g., `OWOX_TOKEN`) and choose an expiration (up to **1 year** by default).
5. Click **Generate**.

> ⚠️ **Important**  
> Copy the token immediately or download it and store it securely (for example, in a password manager).  
> You will **not be able to view the token again** after closing the dialog.

![Snowflake web application showing the Programmatic access tokens section in user authentication settings. The Generate new token button is highlighted, and fields for token name and expiration period are visible. On-screen text includes Programmatic access tokens, Generate new token, Token name, and Expiration period. The interface is clean and businesslike, with a sidebar navigation menu on the left and a main content area focused on token generation.](/docs/res/screens/snowflake_generatetoken.png)

##### Step 2. Configure Network Policy (Admin Action Required)

By default, Snowflake requires PAT users to be covered by a **network policy**. A Snowflake **account administrator** must allow connections from trusted IP addresses. Example:

```sql
CREATE NETWORK POLICY <policy_name>
  ALLOWED_IP_LIST = ('34.38.103.182');

ALTER USER <your_user>
  SET NETWORK_POLICY = <policy_name>;

```

**Replace:**

- `<policy_name>` with a descriptive name (for example, `owox_network_policy`)
- `<your_user>` with your Snowflake username

> **Tip:** OWOX Data Marts connects from the external IP `34.38.103.182`. Add this address to allow traffic from the service.

✅ After the policy is applied, PAT authentication is limited to the allowed addresses.

##### Step 3. Configure Storage

Once the network policy is active:

1. Open your **storage settings**.
2. Select **Username & PAT** as the authentication method.
3. Enter:
   - Your **Snowflake username**
   - Your **PAT** in the token field
4. Go to the [Finalize Setup](#finalize-setup).

![Snowflake interface displaying the Enter PAT (Personal Access Token) screen, prompting the user to input their token for authentication. The screen features a text input field labeled Personal Access Token and a button labeled Continue. The environment is a clean, modern web application interface with a neutral, professional tone. No additional emotional cues are present.](/docs/res/screens/snowflake_enterpat.png)

---

#### Option 2: Key Pair Authentication

Key pair authentication provides **enhanced security** and is the **recommended approach** for setting up Snowflake as a storage.

##### Step 1. Generate a private key

Run the following command in a terminal on your local machine:

   ```bash
   openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt
   ```

> *If you prefer to protect the key with a passphrase, omit the `-nocrypt` flag.*

##### Step 2. Generate a public key

   ```bash
   openssl rsa -in rsa_key.p8 -pubout -out rsa_key.pub
   ```

![Konsole terminal on Linux showing two openssl commands run from the home directory: one generating an RSA private key with pkcs8 and nocrypt options, and a second exporting the public key to rsa_key.pub, both finishing at the shell prompt.](/docs/res/screens/snowflake_terminal.png)

Open the `rsa_key.pub` file in any text editor (for example, VS Code or Sublime Text) and copy its contents. If you are not sure where it was saved, check your current directory: run `pwd` on macOS/Linux, or use `echo %cd%` (or `cd`) in Command Prompt on Windows.

![Konsole terminal window showing the same openssl commands followed by the `pwd` command to print the working directory, with output indicating the files were saved in /home/vp.](/docs/res/screens/snowflake_pwd.png)

##### Step 3. Assign the public key to your Snowflake user

Return to the Snowflake interface. Assign your public key to your Snowflake user by running the following SQL command:

```sql
ALTER USER "<your_username>" SET RSA_PUBLIC_KEY='<your_public_key>';
```

- Replace `<your_username>` with your actual Snowflake username.
- Replace `<your_public_key>` with the full public key string you copied from the `rsa_key.pub` file.

This step enables key pair authentication for your user account.

**Important formatting rules**:

- Remove the lines:

  ``` text
  -----BEGIN PUBLIC KEY-----
  -----END PUBLIC KEY-----
  ```

- Concatenate the remaining lines into **one continuous string**
- Do **not** include line breaks or spaces

![Snowflake web interface displaying the SQL worksheet with an ALTER USER command to set the RSA public key for a user. The SQL editor area shows the command with placeholders for username and public key, and the interface includes sidebar navigation and a results pane below the editor. The environment is clean and businesslike, focusing on the key assignment process.](/docs/res/screens/snowflake_setpublickey.png)

> If you encounter the error `SQL access control error: Insufficient privileges to operate on user '<your_user>'.`, it means your Snowflake user does not have the necessary permissions.  
> Please ask your Snowflake administrator to run the required command or grant you the appropriate privileges.

##### Step 4. Configure Key Pair Authentication in OWOX Data Marts

1. Choose **Key Pair** as the authentication method.
2. Open the `rsa_key.p8` file in any text editor (for example, VS Code or Sublime Text).
3. Copy the **entire contents**, including:

   ``` text
   -----BEGIN PRIVATE KEY-----
   ...
   -----END PRIVATE KEY-----
   ```

   > **Tip:** For key pair authentication, you must use your **private key** from the `.p8` file (not the `.pub` file).  
   > Open the `rsa_key.p8` file you generated earlier and copy its entire contents—including the header and footer lines for this step.

4. Paste it into the **Private Key** field.

![OWOX Data Marts web interface showing the Private Key input field in the Snowflake storage configuration screen. The field is highlighted, prompting the user to paste the contents of their private key file. The interface is clean and businesslike, with sidebar navigation and a main content area focused on authentication setup.](/docs/res/screens/snowflake_privatekey.png)

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

## Next Steps

After Snowflake storage is configured:

1. Create a **Data Mart** that uses this storage
2. Configure a **Connector** to load data into Snowflake
3. Run reports and work with data in your Snowflake tables

---

## Troubleshooting

### ❌ Network policy error in the OWOX Data Marts interface

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

### ❌ MFA authentication error in the OWOX Data Marts interface

``` text
Access validation failed. Snowflake access error:
Failed to authenticate: MFA authentication is required,
but none of your current MFA methods are supported
for programmatic authentication.
```

**Cause:**  
You entered a **password** instead of a PAT (for Option 1) or used the wrong authentication method.

**Solution:**

For **Username + PAT** authentication: [generate a PAT](#option-1-username--programmatic-access-token-pat) and use it instead of a password.  
For **Key Pair** authentication: ensure you selected **Key Pair** and pasted the private key from `rsa_key.p8`.

### ❌ Insufficient privileges error in the Snowflake interface

```text
SQL access control error: Insufficient privileges to operate on user '<your_user>'.
```

**Cause:**  
Your Snowflake user does not have the required permissions to run the query.

**Solution:**  
Ask your Snowflake administrator to run the command for you or grant the necessary privileges.  
Once the admin has completed this step, try adding the storage again.

## Additional Resources

- [Snowflake Documentation](https://docs.snowflake.com/)
- [Key Pair Authentication Guide](https://docs.snowflake.com/en/user-guide/key-pair-auth.html)
- [Snowflake Account Identifiers](https://docs.snowflake.com/en/user-guide/admin-account-identifier.html)
