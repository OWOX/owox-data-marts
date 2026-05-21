---
'owox': minor
---

# Add "Enable Google Sheets" conditional checklist group for users who selected Sheets-related use cases during onboarding

**Problem**
Data analysts who selected Google Sheets use cases during onboarding didn't understand:

- That Sheets is a key workflow in OWOX
- That they should share data with business users
- That the Google Sheets Extension exists
This led to low engagement, business users not being involved, and missed product value.

**Solution**
Replace the generic "Get data to your report" group with a Sheets-specific "Enable Google Sheets" group for targeted users.

**Added new "Enable Google Sheets" group in the Setup Checklist**
Shown to: Users with `onboarding.use_case` containing `sync_dwh_sheets` or `import_external_sheets`

**Steps:**

1. **Create Destination - Google Sheets** → Links to `/data-destinations`
2. **Install Google Sheets Extension** → Opens [Google Workspace Marketplace](https://workspace.google.com/marketplace/app/owox_data_marts/94902851409)
3. **Create & Run Report from Extension** → Opens `sheets.new`

**Features:**

- Non-blocking (doesn't prevent progress on other checklist items)
- Auto-updates when user creates destination or runs report
- Uses `refetchInterval` to sync status in real-time
