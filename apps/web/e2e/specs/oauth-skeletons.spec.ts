import { test } from '../fixtures/base';

test.describe('Google Sheets OAuth', () => {
  // TODO: Requires GOOGLE_SHEETS_REFRESH_TOKEN env var.
  // Prerequisites:
  //   - Google Cloud project with Sheets API enabled
  //   - OAuth 2.0 credentials (client ID + client secret) configured
  //   - Valid refresh token for test Google account
  // Test steps when implemented:
  //   1. Navigate to Destinations tab of a published datamart
  //   2. Click "Add Destination" and select Google Sheets type
  //   3. Fill destination title
  //   4. Click "Connect Google Account" to trigger OAuth flow
  //   5. Complete OAuth consent (may require manual intervention or test token)
  //   6. Verify destination card appears with "Connected" status
  //   7. Verify spreadsheet URL field is editable
  test.skip(
    true,
    'Requires GOOGLE_SHEETS_REFRESH_TOKEN. Steps: create destination -> trigger OAuth flow -> verify connected status'
  );
});

test.describe('Microsoft / TikTok OAuth', () => {
  // TODO: Requires MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, TIKTOK_ACCESS_TOKEN env vars.
  // Prerequisites:
  //   - Microsoft Azure AD app registration with appropriate API permissions
  //   - TikTok for Business developer account with API access
  //   - Valid OAuth tokens for test accounts
  // Test steps when implemented:
  //   1. Navigate to Destinations tab of a published datamart
  //   2. Click "Add Destination" and select Microsoft Teams type
  //   3. Trigger Microsoft OAuth flow
  //   4. Verify Microsoft Teams destination card appears
  //   5. Repeat for TikTok destination type (if available)
  //   6. Verify each destination can be edited and deleted
  test.skip(
    true,
    'Requires MICROSOFT_CLIENT_ID + TIKTOK_ACCESS_TOKEN. Steps: create destination -> trigger OAuth -> verify card'
  );
});

test.describe('OAuth-requiring Connectors', () => {
  // TODO: Requires connector-specific OAuth credentials (varies by connector type).
  // Prerequisites:
  //   - OAuth credentials for connector services (e.g., Google Analytics, Facebook Ads)
  //   - Connector configurations with valid API access
  // Test steps when implemented:
  //   1. Navigate to Data Setup tab of a datamart
  //   2. Select Connector definition type
  //   3. Choose an OAuth-requiring connector (e.g., Google Analytics)
  //   4. Trigger OAuth authorization flow
  //   5. Complete OAuth consent with test credentials
  //   6. Verify connector configuration form shows "Connected" status
  //   7. Save connector definition and verify persistence
  test.skip(
    true,
    'Requires connector-specific OAuth credentials. Steps: select connector -> trigger OAuth -> verify connected -> save definition'
  );
});
