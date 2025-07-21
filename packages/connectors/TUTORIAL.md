# Tutorial: Build a GitHub to Google Sheets Connector w/ Apps Script

Learn how to create and schedule a token-based integration with the GitHub API using Google Sheets, Apps Script, and the OWOX Data Marts framework — No need for Visual Studio Code, Git, or installing anything locally.

This tutorial is based on our [video walkthrough](https://owox.wistia.com/medias/ofqiscoxdc) and complements the [Developer Guide for Custom Data Source Integrations](CONTRIBUTING.md).
It's designed for data analysts who want to collect GitHub data directly in Sheets.

🎥 **Prefer video?** Watch the full tutorial here:

[![Watch the Video](https://i.imgur.com/wHoGXug.png)](https://owox.wistia.com/medias/ofqiscoxdc)

We’ll cover:

- Project requirements  
- API access tokens 
- Secure token storage  
- Apps Script Template configuration  
- Unique keys   
- Connector Scheduling 

🧠 If you're looking to contribute a new data source to the official repo, please read our [Contributor’s Guide](CONTRIBUTING.md) first.

## Step 1: Getting Started

Before we start, here’s what you need to develop a new connector:

- A **Google Account** — required to access Google Sheets and Apps Script.
- A **GitHub Account** — not just because we’re using the GitHub API, but because you’ll need it to ask questions, join discussions, and (hopefully!) contribute your connector to our repo.
- Basic knowledge of **Google Apps Script** — don’t worry if you’re not an expert. You can always ask ChatGPT for help - we are sharing this in the video.

In this tutorial, we’ll walk through building a connector that fetches GitHub data (stars and contributors) into Google Sheets — all using just the browser.

## Step 2: Researching the Data Source

Ok, remember, we are building a connector to the GitHub API. The first thing to do is **check if someone has already built it**:

1. Go to the [GitHub repo](https://github.com/OWOX/owox-data-marts) and go through the list of available data sources to see if GitHub is listed
2. Next, check the **Discussions** and **Issues** tabs for any mentions of GitHub

If it’s not listed — great! That means you’re pioneering this integration.

## Step 3: Understanding the Business Request

The next step is to understand what business users need from this connector. Ask questions like:

- “What dimensions and metrics do you need?”
- “How often should the data update?”
- “What does the report need to look like?”

We’re keeping things simple: in our example, we want to track:

- **Metrics** - ⭐ Number of stars, 👥 Number of contributors
- **Update frequency** - daily at midnight
- **Format** - one row per day

Note: Most stakeholders will say “daily is fine” — but won’t specify the **exact time** they expect it.

💡 If they check reports at 9:00 AM and your connector runs at 10:00 AM, you might get complaints like:  
> “Hey, the data isn’t updated!”

To avoid this:

- Consider running your connector **hourly**
- BUT — you must define a **unique key** to avoid duplicates (more in the next step)

This way, if the connector runs multiple times a day, it only updates the correct row, instead of adding new rows each time.
  
## Step 4: Apps Script Limitations

There’s one scheduling limitation you should be aware of before building your connector. Google Apps Script can only run **on an hourly schedule**, but not at an exact time like `09:17 AM`.

This means:

- Your script might run at 9:02 one day, and 9:47 the next.
- But you still need to ensure it doesn’t create duplicate rows.

### Solution:

Use the **unique key** strategy.

When the script runs:

1. Check if a row for today’s date already exists
2. If it does → update that row
3. If it doesn’t → insert a new row

## Step 5: How to define a Unique Key

For GitHub, we’ll use a simple key:**`date`** of the data upload

Why?

- GitHub doesn’t provide historical data for metrics like stars or contributors.
- We only get the **current state** — so we capture that with today’s date.

The logic:

- Run the connector daily
- Store one row per day
- If the script runs again the same day → update the existing row if that date existings, **don’t add a new one**

### Example:
Let’s say the connector runs five times on June 2nd. 

We want to have **one row for June 2**, not **five duplicate rows**.

That's easy for something like GitHub, where 'date' can act like a key. 

### Composite key example:

In other use cases, you may need a **composite key**.

We have the **[Facebook Ads Connector](/src/Sources/FacebookMarketing/README.md)** connector where we used 3 fields together to define a unique record:

- `ad_id`
- `date_start`
- `date_stop`

That’s an example of the composite key. As the connector developer, **you** must define and implement this logic inside the script.

## Step 6: API and Access Tokens

To interact with the GitHub API, we need a **Personal Access Token**.

You don’t need to read the full API docs — we recommend using a tool like **Boomerang** (a Chrome extension) to test API requests quickly.

### How to create a GitHub token:

1. Go to the GitHub account → **Settings** → **Developer settings** → **Personal access tokens (classic)**
2. Click **Generate new token**
3. Name it something like `OWOX Data Marts GitHub Demo`
4. Set an expiration date (eg. 1 year)
5. Select **read-only access**
6. Click **Generate token** and copy it somewhere safe

### Testing the API:

To get the number of stars:
- Call the GitHub repository API
- Look for the `stargazers_count` field in the JSON response

To get the number of contributors:

- Unfortunately, GitHub doesn’t return a single number
- Instead, call the `/contributors` endpoint
- Count the number of contributors returned in the list using Apps Script

That count = our **contributors** metric

## Step 7: Setting Up the Template

Now that we know what data we need and how to get it, let’s set up the actual integration.

Start by opening [this link with templates](https://drive.google.com/drive/u/0/folders/1Yy2QOb0B6-DcKaowmjH3jxtdi8q2KtoU)

You’ll see two types of connector templates:

- **Public Endpoint** – for open APIs like the Bank of Canada
- **Token-Based Endpoint** – for APIs that require authentication, like GitHub

We’ll use the **Token-Based** template for this GitHub integration.

Inside the folder, you’ll find:

1. A **Google Sheet template** – this acts as a configuration file
2. An **Apps Script project** – handles all the logic for fetching and inserting data

> ⚠️ Important:
> If you just "Copy" the folder in Google Drive, it may create a **shortcut**, not a real copy.
> So instead, open each file manually
> Go to `File` → `Make a copy`
> Save them to your own Google Drive

Now open the **Config** sheet:

1. Delete unnecessary rows under the Parameters section
2. Add new parameters, in our case:
  
  - **Name:** `repository`
  - **Value:** `owox/owox-data-marts`
  - **Description:** Name of the repository where we want to fetch data from

You’ll later reference this parameter in your script to pull the GitHub repository value dynamically.

## Step 8: Securely Storing the Access Token

To authenticate with the GitHub API, you need to provide your **Personal Access Token** securely.

> ⚠️ **Never store the token directly in a spreadsheet cell**  
> ⚠️ **Never hardcode it as plain text in the script**

Instead, we’ll use **Document Properties** in Apps Script.  This way, the token stays private and secure.

### How to store your token securely:

1. Open the `Apps Script` editor from your copied Sheet  
2. Rename the project to something meaningful like:  
   **GitHub Connector Demo**
3. Check if `manageCredentials()` function exists 
   (If no, just copy it from any of the existing connectors in the repo)

This function:

- Prompts you for the token
- Stores it securely in the Sheet’s properties
- Keeps it **out** of the sheet and source code

Once added or checked:

- Open the sheet
- Click **Manage Credentials** from the custom menu
- Paste your GitHub token
- It’ll now be available to your connector script securely

> ✅ Best Practice:  
> Always store tokens and secrets in **Document Properties** – never in visible cells or code.

## Step 9: Connector & Pipeline Files

Each integration has two core components in Apps Script:

### 1. Connector File

The **Connector** defines:

- Which input parameters the user must provide (eg. repository name)
- How are those parameters validated
- How the data is fetched and transformed

In our GitHub example:

- We define a new **GitHubConnector**
- It requires the repository name as a **required** parameter

> 📌 Tip: Validate your inputs early — for example, check that the repo string contains a `/`

### 2. Pipeline File

The **Pipeline** handles:

- Import logic and flow
- How often the script runs
- How errors are handled
- How data is injected into the spreadsheet

By default, pipelines use a cstartDate` and `endDate` range. But GitHub only returns current state data, not historical metrics.

So we override the default pipeline to avoid this (you can check what we did in the video)

## Step 10: Fetching Data from the GitHub API

The heart of every connector is the `fetchData()` function.

This function:

- Pulls your config (eg. `repo name`)
- Loads the token securely
- Sends API requests to GitHub
- Parses the response
- Builds clean rows for the spreadsheet

### Example: GitHub Connector

- Stars:
  `GET https://api.github.com/repos/{owner}/{repo}`  
  → Field: `stargazers_count`

- Contributors:  
  `GET https://api.github.com/repos/{owner}/{repo}/contributors?per_page=1000`  
  → Count the number of items in the returned list

> ⚠️ GitHub doesn’t provide a `total_contributors` field — you need to count it manually in your script.

### Access Token Handling

Make sure to retrieve the token using:

```javascript
const token = getCredentials().github_token.value;
```

### Final Touches

Format the date field as your unique key (e.g., 2025-06-01, without minutes/seconds)

## Step 11: Scheduling the Connector

Now that your connector works manually, let’s automate it to run daily (or hourly). Google Apps Script lets you set up **time-driven triggers**.

1. Open your Apps Script file:  
   `Extensions → Apps Script`

2. Go to:  
   `Triggers` panel (clock icon)

3. Click:  
   `+ Add Trigger`

4. Configure like this:

   - **Function to run:** `importData`
   - **Deployment:** Head
   - **Event source:** Time-driven
   - **Type of time-based trigger:** Hour timer (every hour)

6. Click **Save**

That’s it! The script will now automatically fetch GitHub data and update the sheet every hour.

### Important Notes

- If you’re sharing the Sheet with business users:
  - They can run it manually from the **custom menu**
  - But they’ll need to manage Apps Script UI to set up the trigger

> 💡 Best practice: Let the data analyst (you!) set up the trigger for them.

## We're done! 🎉

Let’s recap what you’ve built:

- ✅ A secure, token-based connector for GitHub
- 🔐 Stored the token safely (in Document Properties)
- 🔁 Avoided duplicates with a proper unique key
- ⏱ Automated the import process with time-based triggers
- 💡 Used only Google Sheets + Apps Script — no external tools!

We’ve just created a lightweight, fully custom data pipeline — ready for your team or the community.




## 🔗 Related Resources

If you’re new to the project, we recommend reviewing these resources next:

- [📖 Main contributor Guide](CONTRIBUTING.md) — Understand the overall architecture, structure, and core concepts.
- [📹 Video Tutorial](https://owox.wistia.com/medias/ofqiscoxdc) — Watch the step-by-step walkthrough that accompanies this written guide.


## 💬 Questions or Help?

Join one of the [discussions](https://github.com/OWOX/owox-data-marts/discussions/categories/q-a) or create a new one to:

- Ask for help
- Share feedback
- Request new connector templates
- Show off what you’ve built!


## 🤝 Contributing

Want to publish your own connector? Amazing!  
Please make sure to:

- Follow this guide and [ Contributor Guide](CONTRIBUTING.md)
- Submit a [pull request](https://github.com/OWOX/owox-data-marts/pulls)
- Sign the [Contributor License Agreement (CLA)](https://cla-assistant.io/OWOX/owox-data-marts)

Let’s build a free, open-source alternative to expensive ETL tools — together.

