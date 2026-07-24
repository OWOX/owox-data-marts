# Google Chat

Configure **Google Chat** as a Destination in OWOX Data Marts to deliver Insights to a Chat space after each Data Mart run. New destinations default to direct, formatted delivery through an incoming webhook, while channel-email delivery remains available for backward compatibility.

For example, you may want to notify a stakeholder in a Google Chat room every time a scheduled run produces updated data (such as new results from the Facebook Ads connector). You can also choose to receive a message only when the run result is empty.

---

## Configuration Steps

Follow the steps below to configure your **Google Chat** destination.

### Step 1. Create a Destination

#### 1.1. Open the Destinations page

In the OWOX Data Marts web application, open **Destinations** in the main menu and click **+ New Destination**.

#### 1.2. Select the Destination type

Choose **Google Chat** from the **Destination Type** dropdown.

#### 1.3. Configure Destination details

- **Title**: Enter a unique name for the Destination (for example, “Marketing Team”).
- **Delivery Method**:
  - **Google Chat API** (default): posts the complete Insight as a formatted Google Chat card.
  - **Channel Email**: uses the previous email-based delivery and Google Chat's email rendering.
- For **Google Chat API**, provide a **Google Chat incoming webhook URL**:
  1. Open the target space in Google Chat.
  2. Next to the space title, open **Apps & integrations**.
  3. Click **Add webhooks**, enter a name, and save the webhook.
  4. Copy its URL and paste it into OWOX.
- For **Channel Email**, enter one or more Google Chat channel email addresses.

Existing Google Chat destinations with saved email addresses continue to open with **Channel Email**
selected. If an existing destination has no email address, the form defaults to **Google Chat API**.

> The webhook URL contains a secret token. Store it as a credential and do not share it in chat,
> documentation, or source control. If **Add webhooks** is unavailable, ask your Google Workspace
> administrator to allow incoming webhooks.

Incoming webhooks authenticate through the key and token in the URL, so this delivery method does
not require a separate OAuth connection or service-account JSON.

#### 1.4. Save the Destination

Review the details and click **Save** to create the Destination.

---

### Step 2. Create a Report for this Destination

For each Destination, you can create as many reports as needed and configure different schedules for them.

#### 2.1. Open the Data Mart page

Go to your **Data Mart** and open the **Destinations** tab.

#### 2.2. Add a new report

In the block labeled with the name of your Destination, click **+ Add report**.

#### 2.3. Configure general settings

Enter a report title and make sure the report is assigned to the correct Destination.

#### 2.4. Configure the template

Write your **Message** using Markdown. Switch to **Preview** to check the content. With **Google Chat
API**, OWOX posts the rendered Insight as a card with the subject, Data Mart name, complete message
body, and a link back to the report. Messages that exceed Google Chat's per-message size limit are
split into as many as 20 numbered parts. Insights requiring more parts are rejected before sending.
With **Channel Email**, Google Chat controls how the emailed content is rendered.

#### 2.5. Set sending conditions

Decide when the report should be sent based on the Data Mart run result:

- **Send always** – the report is sent after every run.
- **Send only when result is empty** – the report is sent only if the Data Mart returns no data.
- **Send only when result is not empty** – the report is sent only if the Data Mart returns data.

OWOX automatically runs the Data Mart before sending the report and checks the result. Your selected condition determines whether the message is sent.

#### 2.6. Save the report

Click **Save** to apply the report settings.

#### 2.7. (Optional) Scheduling

To run this report automatically on a schedule (e.g., every 5 minutes or every Monday and Wednesday at 15:00), open the **Triggers** tab and create a new trigger.  
Select this report and specify the schedule for automatic execution.

---

Have questions? Join the [OWOX Community](https://github.com/OWOX/owox-data-marts/discussions).
