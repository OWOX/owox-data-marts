# owox

## 0.5.0

### Minor Changes 0.5.0

- d129eb0: # Triggers and reports columns available in the Data Marts list
  - Added columns for the number of triggers and reports to the Data Marts list

- 6335c25: # Fixed BingAds report data export and added proper field mapping
  - Fixed data export issues in BingAds reports by separating into two report types with proper field schemas
  - Fixed issue where values were being saved with quotes in database

- 2f2d4bf: # Add manual backfill functionality for data mart connectors
  - Added support for manual connector runs with custom payload parameters

- 0f590bb: # Connector Target step: editable dataset/database and table
  - Added editable dataset/database and table fields with sensible defaults
  - Defaults come from sanitized destination name: dataset/database `${sanitizedDestinationName}_owox`, table `${sanitizedDestinationName}`
  - Inline validation: required, only allowed characters, accessible error state
  - Helper text shows full path: `{dataset}.{table}`

- db3a03a: # Show Individual Destination Cards in Destination Tab

  The Destination tab now displays a separate card for each specific destination in the project.
  Each card shows only the reports belonging to that destination, making it easier to find and manage reports at a glance.

- 863ad3e: # Enhanced Output Schema Formatting

  The Output Schema has received a major upgrade to improve control over data readability in Destinations.
  - Added support for column header descriptions as cell notes in the Google Sheets Destination, so you can define metrics everyone is aligned on
  - Implemented automatic formatting for BigQuery and Athena timestamp fields
  - Introduced the ability to control the order of fields delivered from Data Mart to Destination via simple drag & drop in the Output Schema

- aac5411: # Update API version and refactor insights data fetching logic
  - Updated the Facebook Graph API base URL to use version 23.0 directly in the code, removing the configurable ApiBaseUrl parameter.
  - Refactored the insights data fetching logic to pass the API base URL explicitly to helper methods.
  - Modified \_fetchInsightsData and_buildInsightsUrl to accept and use the API base URL as a parameter.
  - Removed the unsupported activity_recency field from adAccountInsightsFields.
  - Improved code clarity and maintainability by simplifying how the API URL is constructed and used throughout the Facebook Marketing source integration.

- b6cdb5a: # TypeORM Entity Migration Mechanism
  - Introduced an automatic migration system for TypeORM entities.
  - Ensures database schema stays up-to-date with entity definitions.
  - Runs migrations automatically on application startup—no manual steps required.
  - Prevents data loss and supports seamless schema evolution.

- 66a6c38: # Improving credentials management security for Data Storage and Data Destination
  - API no longer returns credential secrets to the UI.
  - Credential secrets are no longer displayed in the UI.
  - Credentials are only updated if explicitly changed.
  - Added a link to manage Google Cloud Platform service accounts.

- 6f772ee: # Added Looker Studio Connector support
  - Added Looker Studio as a new data destination type
  - Implemented external API endpoints for Looker Studio integration
  - Added JWT-based authentication for Google service accounts
  - Enabled direct connection from data marts to Looker Studio dashboards
  - You can now enable or disable a Data Mart's availability for Looker Studio in **one click** using the switcher on the **Destinations** tab of the specific Data Mart page.
  - Added data caching system for improved performance
  - Connector available at: <https://datastudio.google.com/datasources/create?connectorId=AKfycbz6kcYn3qGuG0jVNFjcDnkXvVDiz4hewKdAFjOm-_d4VkKVcBidPjqZO991AvGL3FtM4A>
  - Documentation available at: <https://docs.owox.com/docs/destinations/supported-destinations/looker-studio/>
  - **Note**: OWOX Data Marts installation must be accessible from the internet for the connector to work properly

- e4e59f0: # Remove unsupported fields
  - Removed the following unsupported or deprecated fields from `adAccountInsightsFields` in the Facebook Marketing API reference:
    - `age_targeting`
    - `estimated_ad_recall_rate_lower_bound`
    - `estimated_ad_recall_rate_upper_bound`
    - `estimated_ad_recallers_lower_bound`
    - `estimated_ad_recallers_upper_bound`
    - `gender_targeting`
    - `labels`
    - `location`
  - Cleaned up the field definitions to avoid including unsupported fields for Facebook API v19.0 and above.
  - Improved maintainability and reduced the risk of API errors related to invalid fields.

- f351f63: # Hover Cards in Triggers List — Now Smarter and More Visual

  The Triggers list just got a big usability boost!
  Hover over any Report Run or Connector Run to instantly see key details — no extra clicks needed.
  - For Reports: name, last edit, run history, and 1-click access to Google Sheets.
  - For Connectors: source name, field count, run history, and direct Google BigQuery or AWS Athena link.

  Check status, spot issues, and jump to your data faster than ever — all right from the Triggers list.

- 6e76c87: # Implement column visibility and sorting persistence

  Previously, user interface configurations such as selected columns in tables and accordion states were reset upon every page refresh. This change ensures that the system now remembers these chosen states at the browser level for:
  - Data Marts list
  - Storages list
  - Data Marts details (Destinations, Triggers, and Reports lists).

- db0732e: # Connector-Based Data Mart UX improvements
  - Used connector-based data mart for data mart setup right destination name in `Target Setup` step.
  - Added in connector-based data mart inline validation for target dataset/database name in `Target Setup` step with accessible error state.
  - Enabled double-click on a connector card to select and advance to the next step.
  - Added field sorting controls in `Fields Selection` step:
    - A–Z, Z–A, and Original order
    - Unique key fields always appear at the top across all sorting modes
  - Minor UI polish: sort icon with dropdown next to search input; helpful link to open an issue from fields step.
  - Added helpful link to open an issue from nodes step.

- 229c7a1: # Updated connector configuration step
  - Added type to date fields.
  - Moved field descriptions to tooltips.
  - Used field labels as titles instead of field names.

### Patch Changes 0.5.0

- @owox/backend@0.5.0
- @owox/idp-protocol@0.5.0

## 0.4.0

### Minor Changes 0.4.0

- ac64efd: **# Add Data Mart Connector Icons**

  Enhance data-mart with connetors:
  - add connector icons
  - can cancel connector run
  - add connector documentation link

- ae26689: **# Fixed unexpected behaviour**
  - 404 error after reloading page
  - error with crashing the react app
  - error with publishing connector-based data mart

- 09aaade: **# Add data mart run history feature that allows users to view and track execution history of their data marts**

  This feature provides
  - New "Run History" tab in the data mart details view
  - Comprehensive run history display with pagination support
  - Real-time tracking of data mart execution status and results
  - Load more functionality for viewing extensive run history
  - Integration with existing data mart context and state management

  Additional improvements include:
  - Ability to edit source fields in already published connector-based data marts
  - Enhanced connector runner with better config handling for non-string values
  - Improved AWS Athena storage with optimized query execution and DDL handling
  - UI refinements including conditional chevron display in list item cards
  - Cleanup of unused connector-related code from data storage features

  This enhancement improves monitoring capabilities and gives users better visibility into their data mart execution patterns and performance.

- ca4062c: **# Add data mart schema management feature that allows users to view, edit, and manage the structure of their data marts**

  This feature provides:
  - Visual schema editor for both BigQuery and Athena data marts
  - Ability to add, remove, and reorder fields in the schema
  - Support for defining field types, modes, and other properties
  - Schema validation to ensure compatibility with the underlying data storage
  - Ability to actualize schema from the data source to keep it in sync

  This enhancement gives users more control over their data mart structure and improves the data modeling experience.

- 2b6e73d: **# ✨ Add SQL validation for Data Marts**

  Enhance your data mart experience with real-time SQL validation:
  - 🚀 Instant feedback on SQL query validity
  - ❌ Clear error messages when something goes wrong
  - 📊 Estimated data volume for successful queries
  - ⏱️ Automatic validation as you type

  This feature helps you write correct SQL queries with confidence, reducing errors and saving time when working with your data marts.

- 6d97d91: **# UX/UI Improvements**

  Add Planned Data Storages with "Coming Soon" Status
  - Snowflake
  - Databricks
  - AWS Redshift
  - Azure Synapse

  UI Updates: Triggers Table and Reports Table
  - Minor UI updates to the Triggers Table
  - UI improvements to the Reports Table for consistency

  More Friendly and Consistent Forms

  We’ve improved the interface to make working with forms in OWOX Data Marts more intuitive and user-friendly.
  - Unified form layout. All forms — for Triggers, Reports, Storage, and Destinations — now share a consistent design. This makes it easier to navigate and work with confidence.
  - Helpful hints where you need them. Tooltips and inline descriptions have been added next to form fields, so you can better understand what’s expected without second-guessing.
  - Improved tooltip styling. Tooltips now feature a more noticeable background, making important information easier to spot.
  - Faster editing. You can now enter edit mode in the Storage and Destinations tables with a single click on a row — no need to hunt for buttons.
  - Warnings before leaving with unsaved changes. If you make changes to a Storage or Destination and try to leave without saving, you’ll see a confirmation dialog — helping prevent accidental data loss.

  Refined Data Mart Page: Layout, Menu, and Texts
  - Updated the layout of the Connector block
  - Polished the dropdown menu on the Data Mart page

  Redesigned "Create Data Mart" Page
  - The form on the Create Data Mart page has been updated for visual consistency and a better user experience.

  Extra Visual and Text Tweaks
  - We’ve also made a few small improvements to the UI and copy to make everything feel more polished and cohesive.

### Patch Changes 0.4.0

- @owox/backend@0.4.0

## 0.3.0

### Minor Changes 0.3.0

- 543f30d: # ⏰ Time Triggers: Schedule Your Reports and Connectors

  ## What's New

  We're excited to introduce **Time Triggers** - a powerful new feature that allows you to schedule your reports and connectors to run automatically at specified times!

  ## Benefits

  - ✅ **Save Time**: Automate routine data refreshes without manual intervention
  - 🔄 **Stay Updated**: Keep your data fresh with regular scheduled updates
  - 📊 **Consistent Reporting**: Ensure your reports are generated on a reliable schedule
  - 🌐 **Timezone Support**: Schedule based on your local timezone or any timezone you need
  - 🔧 **Flexible Scheduling Options**: Choose from daily, weekly, monthly, or interval-based schedules

  ## Scheduling Options

  - **Daily**: Run your reports or connectors at the same time every day
  - **Weekly**: Select specific days of the week for execution
  - **Monthly**: Schedule runs on specific days of the month
  - **Interval**: Set up recurring runs at regular intervals

  Now you can set up your data workflows to run exactly when you need them, ensuring your dashboards and reports always contain the most up-to-date information without manual intervention.

### Patch Changes

- @owox/backend@0.3.0

## 0.2.0

### Minor Changes 0.2.0

- 71294b2: 2 July 2025 demo

### Patch Changes 0.2.0

- @owox/backend@0.2.0
