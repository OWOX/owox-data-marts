# owox

## 0.12.0

### Minor Changes

- bd09d56: # Enhanced Run History: Google Sheets Reports and Looker Studio Data Fetching

  The Run History tab now displays all Data Mart runs in one place:
  - Google Sheets Export report runs and Looker Studio report runs are now tracked in Run History alongside Connector runs
  - Each run shows its title, connector logo or destination icon, start datetime, and trigger type (manual/scheduled)
  - Hover over start time to see detailed start/finish datetimes and execution duration
  - Added "Pending" status for queued operations
  - **All historical Runs before the update are considered manual**

- ba8ca14: # Improve ConnectorEditForm with Auto-Save and Smarter DataMartDefinition Handling

  This update enhances the connector setup experience with automatic saving, improved validation, and better handling of connector configurations.
  - Added **auto-saving** for connector settings in the ConnectorEditForm
  - Introduced **safeguards for unsaved changes** to prevent data loss
  - Enabled **auto-updates** for `DataMartDefinition` upon form submission
  - Refactored related components for **clearer validation** and **smoother configuration flow**

- 5c98ca4: # Safer and Smoother Connector Editing Experience

  We’ve made it easier — and safer — to edit your connector settings.
  Now, if you make changes and try to close the form before saving, you’ll see a confirmation dialog to prevent losing your work.

  We’ve also simplified how configuration details are managed and improved tooltips for better clarity — so you can focus on setting up your data connections with confidence and less friction.

- e2da6ef: # Facebook Connector: Added support for nested creative fields in ad-group endpoint

  New flat fields available:
  - `creative_id` - Unique ID for the ad creative
  - `creative_name` - Name of the ad creative
  - `creative_url_tags` - UTM parameters and URL tags
  - `creative_object_story_spec` - Object story spec with page_id and other details
  - `creative_effective_object_story_id` - Page post ID used in the ad

- 66e494d: # Fixed false error notification about actualizing schema

  When configuring the Connector-based Data Mart, attempts to update the table schema would cause users to receive an error message in the UI that was not actually an error. For the Connector-based Data Mart, the table and schema are created on first run, so attempting to update the schema before the first run would result in an error in the UI. Now updating schema trigger checks the Data Mart type and doesn't try for these cases

- 061b00c: # Refactor connector execution architecture by removing the standalone `@owox/connector-runner` package and integrating its functionality directly into `@owox/connectors` package

  **Breaking changes:**
  - Removed `@owox/connector-runner` package entirely
  - Moved connector execution logic to `@owox/connectors/src/connector-runner.js`
  - Migrated DTOs to `@owox/connectors/src/Core/Dto/`

  **Improvements:**
  - Simplified dependency management by consolidating connector-related packages
  - Updated connector execution service to use new DTOs and exports from connectors package
  - Removed redundant GitHub workflows for connector-runner
  - Cleaned up repository structure

- 961140b: # Remove `@kaciras/deasync` and `sync-request` dependencies and migrate to async/await

  This is a minor breaking change that removes the `@kaciras/deasync` and `sync-request` dependencies from connectors package and migrates all synchronous blocking code to modern async/await patterns.

  **Changes:**
  - Removed `@kaciras/deasync` dependency
  - Removed `sync-request` dependency
  - Removed Google Apps Script support - Only Node.js environment is now supported
  - Refactored `EnvironmentAdapter` into specialized utility classes:
    - `HttpUtils` - HTTP requests
    - `DateUtils` - Date formatting
    - `AsyncUtils` - Async delays
    - `CryptoUtils` - Cryptographic operations
    - `FileUtils` - File parsing and decompression
  - Removed `ENVIRONMENT` enum and environment detection logic
  - Updated connector documentation

- 87aed3f: # Show Connector State in Manual Run
  - In Manual Run → State Info for incremental runs, you can now view the Connector State.
  - For connectors with multiple configurations, the state is shown for each configuration with a "Created at" tooltip.
  - If no state is available, we show "No state available".
  - The state is displayed as read-only JSON with a copy option.

  This helps you quickly understand where incremental loading will continue from and simplifies troubleshooting.

- f97c4e7: # Add new Facebook Marketing insights endpoints and improve Facebook field schema filtering

  Introduced several new **Facebook Marketing API insights** endpoints with specific breakdowns:
  - `ad-account/insights-by-age-and-gender` — provides age and gender breakdowns
  - `ad-account/insights-by-device-platform` — provides device platform breakdown
  - `ad-account/insights-by-product-id` — provides product ID breakdown
  - `ad-account/insights-by-publisher-platform` and
    `ad-account/insights-by-publisher-platform-and-position` — provide publisher platform and platform position breakdowns
  - `ad-account/insights-by-region` — provides region-level breakdown

  ⚠️ Breaking Changes
  The legacy `ad-account/insights` endpoint **no longer supports breakdown fields**.

  If your Data Mart previously used `ad-account/insights` with breakdowns (such as `age`, `gender`, `country`, `device_platform`, `link_url_asset`, `product_id`, `publisher_platform`, `platform_position`, or `region`),
  please migrate to the appropriate new endpoint:

  | Breakdown Type                | New Endpoint                                             |
  | ----------------------------- | -------------------------------------------------------- |
  | Age / Gender                  | `ad-account/insights-by-age-and-gender`                  |
  | Country                       | `ad-account/insights-by-country`                         |
  | Device Platform               | `ad-account/insights-by-device-platform`                 |
  | Link URL Asset                | `ad-account/insights-by-link-url-asset`                  |
  | Product ID                    | `ad-account/insights-by-product-id`                      |
  | Publisher Platform / Position | `ad-account/insights-by-publisher-platform-and-position` |
  | Region                        | `ad-account/insights-by-region`                          |

  ***

  **Recommendation:**
  Recreate your Data Mart using the correct endpoint to ensure compatibility with the latest Facebook Marketing API structure.

- cd3bcd9: # Hidden optional connector config knobs

  Marked shared connector config fields as either hidden manual backfill dates or “Advanced” tuning options so the UI only surfaces essential settings by default.

### Patch Changes

- @owox/internal-helpers@0.12.0
- @owox/idp-protocol@0.12.0
- @owox/idp-better-auth@0.12.0
- @owox/idp-owox@0.12.0
- @owox/backend@0.12.0
- @owox/web@0.12.0

## 0.11.0

### Minor Changes 0.11.0

![OWOX Data Marts - v0.11.0](https://github.com/user-attachments/assets/2365a8a6-c9a0-4b7a-8b85-30d57aae2434)

- 7617b79: # Enhanced Data Mart run history monitoring with automatic updates

  Improved the overall experience when working with Data Mart by introducing automatic data refresh and better run handling:

  **Automatic data updates:**
  - Run history now automatically refreshes, keeping you informed about the latest execution status
  - Google Sheets reports automatically update with fresh data without manual page refresh
  - Auto-refresh can be toggled on/off in run history, with your preference saved for future sessions
  - Updates happen silently in the background without disrupting your work

  **Better connector run experience:**
  - Clear loading indicators when manually running connectors, with the ability to cancel
  - Improved error messages when attempting to run a connector that's already in progress
  - No more technical error messages - you'll see friendly notifications like "Connector is already running. Please wait until it finishes"

  These improvements ensure you always have up-to-date information about your Data Mart executions without needing to manually refresh the page.

- 0a99a0b: # Add ability to copy connector configuration from existing Data Marts

  Added a new feature that allows users to copy connector configuration settings from existing Data Marts when creating or editing connector-based Data Marts.
  - **Copy configuration button**: New dropdown menu in the connector configuration step that shows all Data Marts with the same connector type
  - **Multi-configuration support**: For Data Marts with multiple configurations, a nested menu allows selecting specific configuration
  - **Configuration preview**: Tooltip on each item shows required fields with masked secrets
  - **Secure secret copying**: Secrets are properly masked and merged from source on backend

- 5cd552c: # Improve Data Mart Creation Flow and Connector Editor Experience

  This update brings several enhancements to the Data Mart creation flow and connector-related components, improving UI consistency, usability, and workflow efficiency.

  **Changes**
  - **Data Mart creation flow**:
    - Added new icons for Facebook Ads, X Ads, and LinkedIn Ads
    - Updated Empty Data Marts state with options to create Data Marts in different modes
    - Improved **DataMartDefinitionSettings** to handle mode-based initialization
    - Enhanced **CreateDataMartPage** to set default titles based on selected mode
    - Added animations on the Empty Data Marts page for a smoother user experience
  - **UX improvements**: implemented auto-open logic for Connector Setup Sheet when selecting a definition type
  - **UI improvements**: updated theme handling in **DataMartCodeEditor** for consistent styling

- c929eb0: # Fix BigQuery data duplication with NULL in unique keys

  Fixed MERGE query in BigQueryStorage to correctly handle NULL values in unique key columns using `IS NOT DISTINCT FROM` instead of `=`. This prevents duplicate records when fields like `AssetGroupId` are NULL.

- ccb4fef: # Fix Boolean type in Connector Data Mart configuration

  Fixed an issue with boolean field types in connector configurations when setting up data marts.
  This fix ensures that boolean fields in connector configurations are properly handled, making them interactive and displaying appropriate UI indicators regardless of their default values.

- 6059657: # Fixed connector configuration fields editing

  Fixed an issue where connector configuration fields with default values were difficult to edit when setting up a data mart.
  Fields now properly handle user input and allow modification of default values.

- 7617b79: # Improved SQL validation flow in Data Marts to prevent timeout issues

  Previously, users were unable to save SQL queries in Data Marts when validation took longer than 30 seconds, causing timeout errors.

  This update resolves the issue by:
  - Made SQL validation asynchronous and non-blocking for saving SQL in Input Sources
  - SQL validation is no longer required for Publishing Data Marts

  Users can now save SQL queries regardless of validation time, improving the overall experience when working with complex queries or large datasets.

- 7617b79: # Fix messages for Data Mart publish button

  Improved the clarity of status messages displayed on the Data Mart publish button.
  You'll now see more accurate and informative feedback when publishing your Data Marts.

- f96f9aa: # Add Google Ads connector

  Added new Google Ads connector with Service Account authentication

  Available data nodes:
  - `campaigns`, `campaigns_stats` - Campaign data
  - `ad_groups`, `ad_groups_stats` - Ad group data
  - `ad_group_ads_stats` - Ad performance data
  - `keywords_stats` - Keyword performance data
  - `criterion` - Criteria data

- b11b726: # Added support for oneOf fields with recursive secret masking

  This release adds comprehensive support for oneOf configuration fields with nested secret handling. The connector secret service now recursively masks and merges secret fields within oneOf structures, ensuring sensitive data like API keys and tokens in nested authentication configurations are properly protected.

  New UI components include ButtonGroup for value-based selection and AppWizardCollapsible for expandable sections. Fixed an issue where the wrong oneOf variant was pre-selected when editing existing configurations.

  Added Advanced Fields section to the connector configuration form, allowing users to configure advanced settings for the connector.

- 1b97886: # Remove MaxFetchingDays parameter and improve incremental fetching logic

  Removed the `MaxFetchingDays` parameter from all data source connectors. The incremental data fetching now works as follows:
  - **First run (no state)**: Data fetching starts from the 1st of the previous month
  - **Subsequent runs**: Data is fetched from the `LastRequestedDate` (with `ReimportLookbackWindow` applied) up to today
  - **Manual backfill**: Continues to work as before, fetching data for the specified date range

### Patch Changes 0.11.0

- @owox/internal-helpers@0.11.0
- @owox/idp-protocol@0.11.0
- @owox/idp-better-auth@0.11.0
- @owox/idp-owox@0.11.0
- @owox/backend@0.11.0
- @owox/web@0.11.0

## 0.10.0

### Minor Changes 0.10.0

![OWOX Data Marts - v0.10.0](https://github.com/user-attachments/assets/09ec0e4e-428a-4ac2-bded-cd056886367d)

- 7b8747c: # Fix incremental state management for multiple connector configurations

  Fixed an issue where incremental updates only saved state for the last configuration when a Data Mart had 2+ connector configurations. Now each configuration's state is tracked separately using its `_id`. Also enhanced logging with structured metadata (dataMartId, projectId, runId, configId).

  **Changes:**
  - Updated state structure to support array of states per configuration: `{at, states: [{_id, state, at}]}`
  - Modified `ConnectorStateService` to handle `configId` parameter for getting and updating state
  - Updated `ConnectorExecutionService` to extract and pass `configId` from configuration
  - Added database migration to transform existing state data from old to new format
  - Enhanced logging with structured metadata (dataMartId, projectId, runId, configId)

- 526abdc: # Improved Connector Setup and Usability Enhancements
  - Simplified the connector setup flow with a cleaner layout and improved step structure
  - Added **keyboard shortcuts** for faster field selection in the Connector Editor (Command + Shift + A on macOS, Control + Shift + A on Windows)
  - Refined default titles and interface texts for better clarity
  - Adjusted side sheet layouts for more consistent visuals

- 2898354: # Improved environment variable logging
  - Reduced verbose logging from EnvManager that was confusing users with unnecessary technical details about environment variable processing.
  - Environment setup now shows only essential information instead of detailed variable counts and processing steps.

- 3370b36: # Added migration to rename Bing Ads connector to Microsoft Ads
  - Fixed an issue where Run History tab was not displaying history if the user previously used the Bing Ads connector.

- Fixed Looker Studio Connector error with deleted Data Marts.

### Patch Changes 0.10.0

- @owox/internal-helpers@0.10.0
- @owox/idp-protocol@0.10.0
- @owox/idp-better-auth@0.10.0
- @owox/idp-owox@0.10.0
- @owox/backend@0.10.0
- @owox/web@0.10.0

## 0.9.0

### Minor Changes 0.9.0

![OWOX Data Marts - v0.9.0](https://github.com/user-attachments/assets/ef52acdb-33d3-41c8-b0ae-8f7f1f9099c7)

- 701a05f: # Add System Theme Option to User Menu
  - Added **System** option to the theme switcher for automatic theme selection.
  - Enhanced **UserMenu** with theme selection and submenu support for better usability.

- 54df91e: # Convert boolean parameters to proper boolean type

  Updated boolean configuration parameters to use proper `boolean` type instead of `string` or `bool` types:
  - **ProcessShortLinks** (FacebookMarketing): `string` → `boolean`
  - **SandboxMode** (TikTokAds): `bool` → `boolean`
  - **IncludeDeleted** (TikTokAds): `bool` → `boolean`

- 8402b05: # Add new CLI commands for database migrations
  - `migrations up` - run all pending migrations
  - `migrations down` - revert last migration
  - `migrations status` - migration's status check

- 8fffa5e: # Mask connector secrets in UI
  - Secret fields in connector configuration are masked on the configuration page and in the Run History tab.

- 0b0a8fb: # Enhanced Connector Setup Flow
  - Improved structure with **AppWizard** components for a more consistent and flexible setup layout
  - Better usability across all setup steps
  - Refined **accessibility** and **visual design** throughout the connector editing interface

- 32b0314: # Enhanced connectors to support CreateEmptyTables configuration option
  - Now tables will be created even when no data is fetched, if the CreateEmptyTables parameter is set to "true".

- 8e673e9: # Enhanced Google BigQuery Location Options
  - Updated location labels to include region codes alongside city names for better clarity (e.g., `us-central1 (Iowa)` instead of just `Iowa`).
  - Improved Combobox component with better search functionality using keywords and increased minimum width for better display of longer location names.

- 43adfcb: # Split Facebook Marketing insights endpoint into three separate endpoints
  - Split `ad-account/insights` into three endpoints: base insights, insights by country, and insights by link URL asset
  - Added `ad-account/insights-by-country` endpoint with country breakdown
  - Added `ad-account/insights-by-link-url-asset` endpoint with link_url_asset breakdown
  - Refactored insights data fetching to use object parameters and separate fields from breakdowns
  - **⚠️ Breaking Changes:** `ad-account/insights` endpoint no longer supports breakdown fields
  - **⚠️ Breaking Changes:** if your data mart was using `ad-account/insights` with breakdown fields (e.g., country, link_url_asset), you need to recreate it using the appropriate new endpoint:
    - Use `ad-account/insights-by-country` for country breakdown
    - Use `ad-account/insights-by-link-url-asset` for link URL asset breakdown

- 646511d: # Fix data mart run history time logs
  - Fixed bad time in data mart run history logs. Now the time is displayed in the correct timezone.

- 438c48f: # Added magic link confirmation page to `idb-better-auth`
  - Generated magic links direct users to a confirmation page before the password setup page.

- 9773ba4: # Improvements & Bug Fixes

  This update includes general interface improvements, performance enhancements, and minor fixes to ensure a smoother and more reliable user experience.

- 95dcaec: # Intercom chat integration

  💬 Intercom chat integration is now available in the Web app for faster support and onboarding.

### Patch Changes 0.9.0

- @owox/internal-helpers@0.9.0
- @owox/idp-protocol@0.9.0
- @owox/idp-better-auth@0.9.0
- @owox/idp-owox@0.9.0
- @owox/backend@0.9.0
- @owox/web@0.9.0

## 0.8.0

### Minor Changes 0.8.0

![OWOX Data Marts - v0.8.0](https://github.com/user-attachments/assets/de14394e-b126-429f-89bf-b606f867dae7)

- 2932470: # Better Auth: Primary Admin Setup & Password Reset
  - **Primary admin auto-creation**: Configure `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL` to automatically create or manage primary admin on server startup
  - **Password reset UI**: Admins can reset user passwords through Admin Dashboard (`/auth/dashboard`) with automatic magic link generation
  - **Enhanced documentation**: Added comprehensive user management guide at `/docs/getting-started/setup-guide/members-management/better-auth.md`

  **Features:**
  - Auto-creates admin if doesn't exist (generates magic link in logs)
  - Generates new magic link if admin exists without password
  - Password reset button for existing users with passwords
  - Magic link generation for users without passwords

  **New Environment Variables:**
  - `IDP_BETTER_AUTH_PRIMARY_ADMIN_EMAIL` – Email for automatic primary admin creation

- 518cfe1: # refactor: rename Bing Ads to Microsoft Ads and update documentation, images, and references
- 29f72ea: # Enhance DataMartCreateForm with New Storage Creation
  - Updated storage selection to allow **creating new storage directly** from the form.
  - Refined **CreateDataMartPage styling** for better visual consistency.

- 099befb: # fix: allow deleting a datamart within a project if it was created by another user
- 25ab28e: # fix: a user with the viewer role is not allowed to modify objects in the application with idp = better-auth
- edb4478: ✨ Google Tag Manager integration
  - 🚀 Added Google Tag Manager support across the web app. Enable by setting `GOOGLE_TAG_MANAGER_CONTAINER_ID` in your environment. This allows non‑technical teams to ship marketing/analytics tags without deployments.

  Why this matters
  - 📊 Faster iteration on analytics and marketing experiments (no code release required for common changes).

- 19c21a1: # ⚠️ Breaking Change: LinkedIn Authentication Update

  **What changed:**
  LinkedIn connectors now require **3 credentials** instead of 1 Access Token: Client ID, Client Secret, and Refresh Token.

  **What you need to do:**
  1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/) → your app → **Auth** tab
  2. Copy these 3 values:
     - **Client ID** (top of Auth page)
     - **Client Secret** (top of Auth page)
     - **Refresh Token** (generate via OAuth 2.0 tools)

  **How to update:**
  1. Go to your OWOX Data Marts
  2. Find your LinkedIn connector configuration
  3. Enter the 3 new credentials instead of the old Access Token:
     - **Client ID**
     - **Client Secret**
     - **Refresh Token**

- b41b62d: # Logging System Architecture Refactor
  - **Refactored logging architecture**: Extracted Pino logger creation from LoggerFactory into a provider-agnostic architecture while maintaining backward compatibility
  - **Simplified configuration**: Removed `environment` presets from LoggerConfig, now only `LogLevel` controls logging behavior
  - **Environment variables update**:
    - Changed from `LOG_LEVELS` (comma-separated) to `LOG_LEVEL` (threshold-based)
    - Updated `.env.example` with clear documentation
  - **Enhanced TypeORM integration**: Improved `CustomDataSourceLogger` with proper parameter usage and context formatting

  **Breaking Changes:**
  - `LOG_LEVELS` environment variable renamed to `LOG_LEVEL`
  - Removed `environment` field from `LoggerConfig` interface

  **Migration:**
  - Replace `LOG_LEVELS=log,warn,error` with `LOG_LEVEL=info` (threshold-based) or app will use default `info` level
  - Remove `environment` parameter from LoggerFactory calls

- 8a1ef12: # Secure MySQL connections (TLS/SSL)
  - New, simple way to enable encrypted MySQL connections via environment variables:
    - Backend (NestJS/TypeORM): `DB_SSL`
    - Identity provider (Better Auth): `IDP_BETTER_AUTH_MYSQL_SSL`

  Learn more
  - See “MySQL SSL” section in the deployment guide: <https://docs.owox.com/docs/getting-started/deployment-guide/environment-variables/#mysql-ssl>

- 32cd6c9: # Revamp NotFound Page and Improve Mobile Layout
  - **Redesigned 404 page** with a new foreground card and animated background tunnel effect.
  - Updated **styles** for improved responsiveness and visual appeal.
  - Added **icons and navigation button** to guide users.
  - Improved **mobile layout** and updated **SidebarTrigger icon** for consistency.

- e19073a: # Refactor OpenHolidays connector according to common architecture and fix bugs
- 90a8711: # Simplified MySQL configuration in the `idp-better-auth`
  - **idp-better-auth** uses the `DB_*` environment variables unless `IDP_BETTER_AUTH_MYSQL_*` is specified.

- fc17562: # Enhance Error Handling and Notifications
  - Enhanced **API error handling** and notifications across components.
  - Updated **Toaster** component styles for improved clarity and consistency.
  - Other UI improvements

- af2e412: # Updated Google BigQuery & Google Sheets authentication
  - Switched to JWT-based auth client (`google-auth-library`).
  - Removed deprecated credential paths and warnings.
  - Improved reliability of loads/queries.
  - No action required — existing service account JSON keys continue to work.

- 58e2ead: # Updated Looker Studio data destination
  - Clarify `PUBLIC_ORIGIN`: base public URL of the application (scheme + host [+ optional port]).
    - Examples: `http://localhost:3000`, `https://data-marts.example.com`
    - Default: `http://localhost:${PORT}`
    - In production, set this to your actual deployment URL.
  - Introduce `LOOKER_STUDIO_DESTINATION_ORIGIN`: public origin used to generate the deployment URL for the Looker Studio destination.
    - If empty, it falls back to `PUBLIC_ORIGIN`.
    - Example: `https://looker.example.com`

  Heads up
  - When retrieving the current JSON config for a Looker Studio Data Destination, the `deploymentUrl` field is now generated from `LOOKER_STUDIO_DESTINATION_ORIGIN` (fallback: `PUBLIC_ORIGIN`). If you previously set `deploymentUrl` manually during creation, it is now populated from the environment variable values.

  Learn more
  - See “Public URLs” section in the deployment guide: <https://docs.owox.com/docs/getting-started/deployment-guide/environment-variables/#public-urls>

### Patch Changes 0.8.0

- @owox/internal-helpers@0.8.0
- @owox/idp-protocol@0.8.0
- @owox/idp-better-auth@0.8.0
- @owox/idp-owox@0.8.0
- @owox/backend@0.8.0
- @owox/web@0.8.0

## 0.7.0

### Minor Changes 0.7.0

![OWOX Data Marts - v0.7.0](https://github.com/user-attachments/assets/5b5e5b28-60e9-4c4e-9b2c-1b61e8ec4e74)

- 7d83d7c: # Add configurable timeout middleware for long-running operations
  - Increase server timeout from 2 minutes to 3 minutes (180s) to prevent timeout errors
  - Add operation-specific timeout middleware for data mart operations:
    - SQL editing operations: 3 minutes timeout
    - Schema operations: 3 minutes timeout
    - Publishing operations: 3 minutes timeout
    - All other operations: 30 seconds timeout (default)
  - Update frontend timeout configuration for specific operations to 3 minutes
  - Prevent race conditions in timeout middleware by ensuring only one timeout per request
  - Add proper cleanup and error handling in timeout middleware

  This change fixes timeout issues for long-running operations like SQL editing, schema refresh, and data mart publishing while maintaining reasonable timeouts for other operations.

- 342e534: # Switch between projects in the Cloud edition on app.owox.com ✨

  You can now quickly switch between your projects right from the sidebar menu. This makes it easier to:
  - Move between workspaces without signing out
  - Keep your context while browsing different projects
  - Access project-specific data and settings faster

  No setup required — just open the project switcher and choose the project you need.

- Fixes
  - Fixed indefinite "Running" status for Report Runs
  - Fixed indefinite "Running" status for Connector Runs caused by app shutdown  
    (added graceful shutdown for Connector Runner)
  - Fixed MySQL adapter compatibility with idp-better-auth
  - Fixed unexpected session logout for Cloud edition (idp-owox)
  - Fixed the error of multiple connector launches at the same time

- 78b8972: # Clarifies LinkedIn Pages import steps, adds new images, and improves error handling and API logging
  - Updated GETTING_STARTED.md for LinkedIn Pages with clearer import options and detailed instructions for using Organization URN.
  - Added new images to the documentation to improve user guidance and onboarding.
  - Enhanced error handling in the LinkedIn Pages source code for more robust integration.
  - Improved logging of API responses to assist with debugging and troubleshooting.

- e6af151: # Refactor BankOfCanada connector according to common architecture and fix bugs
- 4b487c8: # Refactor GitHub connector according to common architecture and fix bugs
- ea803b2: # Refactor: enhance Reddit Ads connector reporting logic with new field definitions

### Patch Changes 0.7.0

- @owox/backend@0.7.0
- @owox/idp-protocol@0.7.0
- @owox/idp-better-auth@0.7.0
- @owox/idp-owox@0.7.0
- @owox/internal-helpers@0.7.0
- @owox/web@0.7.0

## 0.6.0

### Minor Changes 0.6.0

![OWOX Data Marts – v0.6.0](https://github.com/user-attachments/assets/a12287fc-397f-4071-89be-47d6aae7eb6b)

- 2bbf7ba: # Initial release of Better Auth IDP provider with comprehensive authentication features
  - Added web-based admin dashboard for user management
  - Implemented hierarchical role-based access control (admin/editor/viewer) with invitation permissions
  - Created magic link authentication system with encrypted role passing and auto-name generation
  - Added comprehensive environment variable configuration with SQLite and MySQL database support

- 22762cd: Add project ID in URL routing
  - Update routing structure to support project-based navigation
  - Add project-scoped routing with `/ui/:projectId` URL structure
  - Extract hardcoded `/ui` prefix to configurable `VITE_APP_PATH_PREFIX` environment variable
  - Update all navigation links to use project-scoped routes
  - Add proper route parameters validation in DataMartDetailsPage

- c5e95be: # Fix undefined values in BigQuery Storage and cleanup Facebook fields
  - Fixed undefined values being stored as "undefined" strings instead of NULL in BigQuery Storage
  - Removed non-working fields from Facebook Marketing adAccountInsightsFields schema

- 78ea317: # Fix Facebook referral_id field causing whitelist error
  - Removed referral_id field from Facebook Marketing schema that was causing whitelist validation errors

- 83c178c: # Optimize logging and fix security issues
  - Reduced log noise in BigQuery storage
  - Fixed credentials exposure in Sources logs
  - Added progress tracking and explicit time series flags to Facebook connector

- f154ad9: # Split LinkedIn dateRange fields and hardcode field limits
  - Replace single dateRange field with separate dateRangeStart and dateRangeEnd fields for better data granularity
  - Remove MaxFieldsPerRequest param and hardcode the value

- 0f2add4: # Standardize Facebook Marketing table names with facebook*ads* prefix
  - Update all destinationName values in FacebookMarketingFieldsSchema to include facebook*ads* prefix

### Patch Changes 0.6.0

- Updated dependencies [4749749]
  - @owox/idp-owox@0.6.0
  - @owox/backend@0.6.0
  - @owox/idp-protocol@0.6.0
  - @owox/idp-better-auth@0.6.0
  - @owox/web@0.6.0

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
