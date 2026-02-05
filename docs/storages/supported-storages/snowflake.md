# Snowflake Storage Setup

## Overview

Use this guide to configure **Snowflake as a storage** in **OWOX Data Marts**. The steps below walk you from creating a storage record to finishing authentication and validation.

## Account Prerequisites

Before you begin, ensure you have a Snowflake account with the right permissions and access.

To set up Snowflake storage in OWOX Data Marts, your account should:

- **Have write access** to the warehouse and database where OWOX Data Marts will store data.
- **Be assigned roles and permissions** that allow you to create or use warehouses, schemas, and tables (detailed steps are provided below).
- **Follow your organization’s security policies** for account access and management.

If you’re unsure about your permissions, contact your Snowflake administrator before proceeding.

### Best Practice: Use a Dedicated Service Account

For better security and governance, we highly recommend using a **dedicated service account** specifically for the OWOX Data Marts integration, rather than using a personal user account.

**Why use a dedicated account?**

- **Security:** Limits exposure if credentials are ever compromised.
- **Stability:** Prevents interruptions caused by employee role changes or departures.
- **Auditing:** Makes it easier to track changes and monitor activity related specifically to Data Marts.
- **Safety:** Reduces the risk of accidental data modification by human users.

**Can I use my personal account?**

Yes, you can use your personal Snowflake account if your internal policies allow it. However, you must ensure it has the correct permissions and that you follow your organization's security guidelines.

> **Recommendation:** If you are setting up a production environment, ask your Snowflake administrator to create a specific service user (e.g., `OWOX_SERVICE_USER`) for this integration.

## Go to the Storages Page

In OWOX Data Marts, open **Storages** from the main navigation pane and click **+ New Storage**.

![This image illustrates the Snowflake storage configuration screen, highlighting the form fields required for specifying the warehouse name. The arrow in the screenshot is pointing to the input field where users enter the warehouse name, guiding them through the setup process. The interface features a sidebar navigation menu on the left and a main content area displaying the configuration steps.](/docs/res/screens/snowflake_newdestination.png)

## Choose Storage Type

Select **Snowflake**. The storage record is created immediately, but a Data Mart cannot be validated or published until the storage is fully configured.

## Add Title

Give the storage a clear **title**, e.g., `Snowflake Production`.

## Set Up Authentication

Before you can configure the storage, you must provide valid authentication details. Without proper authentication, the setup cannot proceed. In this section, we'll guide you through gathering and entering the required credentials for Snowflake.

> **Note:**  
> The authentication fields are located in the lower section of the storage configuration form. Make sure to scroll down to find and complete these fields.

Connection settings will be covered in the next steps.

### Choose Authentication Method

Snowflake supports two authentication methods:

- [Option 1: Username + Programmatic Access Token (PAT)](#option-1-username--programmatic-access-token-pat)
- [Option 2: Key Pair Authentication](#option-2-key-pair-authentication)

**Key Pair Authentication** is recommended for most environments, as it offers enhanced security. However, you can choose the method that best fits your needs. Follow the steps below to gather the required information and complete authentication successfully.

#### Option 1: Username + Programmatic Access Token (PAT)

1. **Username**: Login for your Snowflake user or service account
2. **Programmatic Access Token (PAT)**: A secure token used instead of a password for programmatic access

##### Step 1. Generate a Programmatic Access Token (PAT)

1. Log in to the Snowflake account ensuring you’re using the specific user or service account intended for the OWOX Data Marts integration.
2. Go from the user menu to **Settings → Authentication**.
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
- `<your_user>` with the dedicated account login name (e.g., `OWOX_SERVICE_USER`)

> **Tip:** The external IP address `34.38.103.182` is the official and permanent address used by OWOX Data Marts to connect to your Snowflake account. You can safely use this exact IP in your network policy configuration. Do not modify or replace it with a different address.

✅ After the policy is applied, PAT authentication is restricted to the IP addresses specified in the network policy. This means you will only be able to access Snowflake using a PAT from the allowed IPs (such as OWOX Data Marts' official address). If you attempt to connect from any other IP address including your own workstation or an unlisted server, Snowflake will block the connection.  
**Technical note:** Snowflake enforces network policies at the account level for users authenticated via PAT, ensuring that only requests originating from permitted IPs are accepted.  
If you need direct access from your own IP, ask your administrator to add it to the network policy.

##### Step 3. Configure Storage

Once the network policy is active:

1. Return to the **OWOX Data Marts** interface and verify you are in the new storage configuration screen.
2. Select **Username & PAT** as the authentication method.
3. Enter the required credentials:
   - In the **Username** field, enter the Snowflake login name for your dedicated user (e.g., `OWOX_SERVICE_USER`).
   - In the **Personal Access Token** field, paste the **PAT** you generated in Step 1.
4. Go to the [Set General Settings and Connection Details](#set-general-settings-and-connection-details) section.

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

Log in to the Snowflake interface using the dedicated user account you are configuring for the storage. Run the following SQL command to assign the public key to your user:

```sql
ALTER USER "<your_username>" SET RSA_PUBLIC_KEY='<your_public_key>';
```

**Replace the placeholders:**

- `<your_username>`: The Snowflake login name for your dedicated user (e.g., `OWOX_SERVICE_USER`).
- `<your_public_key>`: The full public key string copied from your `rsa_key.pub` file.

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

> If you encounter the error `SQL access control error: Insufficient privileges to operate on user '<your_username>'.`, it means your Snowflake user does not have the necessary permissions.  
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
   > Open the `rsa_key.p8` file you generated earlier and copy its entire contents including the header and footer lines for this step.

4. Paste it into the **Private Key** field.

![OWOX Data Marts web interface showing the Private Key input field in the Snowflake storage configuration screen. The field is highlighted, prompting the user to paste the contents of their private key file. The interface is clean and businesslike, with sidebar navigation and a main content area focused on authentication setup.](/docs/res/screens/snowflake_privatekey.png)

**(Optional) Private Key Passphrase**:

- If your private key was created **with encryption**, enter the passphrase.
- If you used the `-nocrypt` option, leave this field **empty**.

🔒 **Security note**  
Never share your private key outside the organization.  
Store it securely (for example, in a password manager or secret vault).

## Set General Settings and Connection Details

### Enter Account Identifier

1. In Snowflake, open the account selector and find your dedicated account.
2. In the account selector, look for the **region** displayed next to account name (for example, **US West (Oregon)**).  

   > **Tip:** The account identifier format may vary depending on whether your Snowflake account is hosted on AWS, Azure, or Google Cloud, and which region it is in. Always double-check the documentation to ensure you use the correct format.

   - Make a note of this region, as it determines the format of your account identifier.
   - To find the correct format for your cloud provider and region, refer to the official Snowflake documentation:  
     [Account Identifier formats by cloud and region](https://docs.snowflake.com/en/user-guide/admin-account-identifier#non-vps-account-locator-formats-by-cloud-platform-and-region).  

3. Click **View account details**.

   ![Account selector interface in Snowflake web application showing a list of available accounts. The highlighted account displays options including View account details. Sidebar navigation is visible on the left, and the main content area presents account information in a neutral, businesslike tone. On-screen text includes View account details.](/docs/res/screens/snowflake_viewaccount.png)

4. In **Account Details**, copy the value from **Account locator**.

   ![ Snowflake Account Details dialog showing the Account locator field highlighted for copying. The dialog displays account information such as account identifier and account URL in a clean, businesslike interface. On-screen text includes Account locator and other account details. The environment is a neutral web application with sidebar navigation visible on the left. The tone is instructional and professional.](/docs/res/screens/snowflake_accountlocator.png)

   > **Tip:** To check your account locator directly, run this SQL in Snowflake:
   >
   > ```sql
   > SELECT CURRENT_ACCOUNT();
   > ```

5. **Construct your account identifier** in the format: `<account_locator>.<region>`

   > **Note:**  
   > If your account is in **AWS US West (Oregon)**, the identifier can be just the locator (e.g., `xy12345`).

   **Examples:**  
   - `xy12345.ap-northeast-3.aws`
   - `xy12345.north-europe.azure`

![Snowflake Account Details dialog with the Account locator field filled in, showing a sample account identifier. The dialog displays account information such as account identifier in a clean, businesslike interface. Sidebar navigation is visible on the left, and the main content area presents account details in a professional tone.](/docs/res/screens/snowflake_filledaccount.png)

### Enter Warehouse Name

- In Snowflake, go to **Compute → Warehouses**
- Use an existing warehouse or create a new one
- Copy the warehouse name (e.g., `OWOX_DATA_MARTS`)

> **Best Practice:** Use a dedicated warehouse for OWOX Data Marts to better control costs and performance.

![Snowflake web UI showing Warehouse Activity with blue bars over recent dates; red circles highlight the warehouse name OWOX_DATA_MARTS in the header and the Compute → Warehouses menu path on the left.](/docs/res/screens/snowflake_copytitle.png)

Enter the **warehouse name** in the storage form (use the exact name).

## Finalize Setup

1. Review all entered values.
2. Click **Save** to add the Snowflake storage configuration.

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
A Snowflake administrator has not applied a required network policy to dedicated user.

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

### ❌ Incoming request error in the Snowflake interface

```text
Incoming request with IP/Token 00.00.000.000 is not allowed to access Snowflake. 
Contact your account administrator. For more information about this error, click here.
```

**Cause:**  
Your network policy does not include the IP address from which you are trying to access Snowflake. By default, the policy may only allow connections from the official OWOX Data Marts IP (`34.38.103.182`). If you attempt to connect from your own workstation or any other unlisted IP, access will be denied.

**Solution:**  
Using a dedicated service account limits access to requests originating only from OWOX Data Marts. However, if you need to log in to the Snowflake interface using this dedicated account (for example, to verify settings), you must ask your Snowflake administrator to temporarily update the network policy to include your current workstation's IP address alongside the OWOX Data Marts IP.
Refer to [Step 2: Configure Network Policy (Admin Action Required)](#step-2-configure-network-policy-admin-action-required) for instructions on modifying the allowed IP list.  
After the policy is updated, retry the connection.

## Additional Resources

- [Snowflake Documentation](https://docs.snowflake.com/)
- [Key Pair Authentication Guide](https://docs.snowflake.com/en/user-guide/key-pair-auth.html)
- [Snowflake Account Identifiers](https://docs.snowflake.com/en/user-guide/admin-account-identifier.html)
