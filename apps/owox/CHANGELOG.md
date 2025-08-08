# owox

## 0.5.0

### Minor Changes

- 2f2d4bf: # Add manual backfill functionality for data mart connectors
  - Added support for manual connector runs with custom payload parameters

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

### Patch Changes

- @owox/backend@0.5.0

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
