import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupReportPrerequisites,
  AUTH_HEADER,
  GOOGLE_SHEETS_TEST_CONFIG,
} from '@owox/test-utils';
import { google } from 'googleapis';

const { spreadsheetId, sheetId, sheetId2, serviceAccountJson, isConfigured } =
  GOOGLE_SHEETS_TEST_CONFIG;

// @IMPORTANT: These tests are currently not in working condition and should not be enabled on CI.
// They require additional setup and configuration.
// Graceful skip if credentials are not configured
const describeIfConfigured = isConfigured ? describe.skip : describe.skip;

if (!isConfigured) {
  console.log('Skipping Google Sheets integration tests: credentials not configured');
}

describeIfConfigured('Google Sheets Integration Tests', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;
  let googleSheetsDestinationId: string;
  let createdGoogleSheetReportId: string;
  let secondReportId: string;
  let reportToDeleteId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    const prerequisites = await setupReportPrerequisites(agent);
    dataMartId = prerequisites.dataMartId;

    // Create Google Sheets destination
    const createDestRes = await agent
      .post('/api/data-destinations')
      .set(AUTH_HEADER)
      .send({
        title: 'Test Google Sheets Destination',
        type: 'GOOGLE_SHEETS',
        credentials: {
          type: 'google-sheets-credentials',
          serviceAccountKey: JSON.parse(serviceAccountJson!),
        },
      });

    expect(createDestRes.status).toBe(201);
    googleSheetsDestinationId = createDestRes.body.id;
  }, 60000);

  afterAll(async () => {
    // Cleanup: Delete developer metadata from Google Sheets
    if (spreadsheetId && serviceAccountJson) {
      try {
        const credentials = JSON.parse(serviceAccountJson);
        const auth = new google.auth.JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        // Get all OWOX metadata
        const response = await sheets.spreadsheets.get({
          spreadsheetId,
          includeGridData: false,
          fields: 'developerMetadata(metadataId,metadataKey,location)',
        });

        const owoxMetadata = (response.data.developerMetadata || []).filter(
          m => m.metadataKey === 'OWOX_REPORT_META'
        );

        // Delete each metadata entry
        for (const meta of owoxMetadata) {
          if (meta.metadataId) {
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              requestBody: {
                requests: [
                  {
                    deleteDeveloperMetadata: {
                      dataFilter: {
                        developerMetadataLookup: {
                          metadataId: meta.metadataId,
                        },
                      },
                    },
                  },
                ],
              },
            });
          }
        }

        console.log(`Cleaned up ${owoxMetadata.length} OWOX metadata entries`);
      } catch (error) {
        console.warn('Failed to cleanup Google Sheets metadata:', error);
      }
    }

    await closeTestApp(app);
  }, 60000);

  it('should create developer metadata when running Google Sheets report', async () => {
    // Create report
    const createRes = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send({
        title: 'Test Report with Developer Metadata',
        dataMartId,
        dataDestinationId: googleSheetsDestinationId,
        destinationConfig: { type: 'google-sheets-config', spreadsheetId, sheetId },
      });

    expect(createRes.status).toBe(201);
    createdGoogleSheetReportId = createRes.body.id;

    // Run report
    const runRes = await agent
      .post(`/api/reports/${createdGoogleSheetReportId}/run`)
      .set(AUTH_HEADER);

    expect(runRes.status).toBe(201);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify metadata was created in Google Sheets
    const credentials = JSON.parse(serviceAccountJson!);
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
      fields: 'developerMetadata(metadataId,metadataKey,metadataValue,location)',
    });

    const metadata = response.data.developerMetadata || [];
    const owoxMetadata = metadata.find(
      m => m.metadataKey === 'OWOX_REPORT_META' && m.location?.sheetId === sheetId
    );

    expect(owoxMetadata).toBeDefined();
    expect(owoxMetadata?.visibility).toBe('DOCUMENT');

    const metadataValue = JSON.parse(owoxMetadata!.metadataValue!);
    expect(metadataValue.reportId).toBe(createdGoogleSheetReportId);
    expect(metadataValue.dataMartId).toBe(dataMartId);
    expect(metadataValue.projectId).toBeDefined();
    expect(Object.keys(metadataValue).sort()).toEqual(['dataMartId', 'projectId', 'reportId']);
  }, 30000);

  it('should update developer metadata on report re-run', async () => {
    // Re-run the same report
    const runRes = await agent
      .post(`/api/reports/${createdGoogleSheetReportId}/run`)
      .set(AUTH_HEADER);

    expect(runRes.status).toBe(201);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify metadata still exists and is updated
    const credentials = JSON.parse(serviceAccountJson!);
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
      fields: 'developerMetadata(metadataId,metadataKey,metadataValue,location)',
    });

    const metadata = response.data.developerMetadata || [];
    const owoxMetadata = metadata.find(
      m => m.metadataKey === 'OWOX_REPORT_META' && m.location?.sheetId === sheetId
    );

    expect(owoxMetadata).toBeDefined();

    const metadataValue = JSON.parse(owoxMetadata!.metadataValue!);
    expect(metadataValue.reportId).toBe(createdGoogleSheetReportId);
    expect(metadataValue.dataMartId).toBe(dataMartId);
  }, 30000);

  it('should handle multiple reports on different sheets', async () => {
    // Create second report on different sheet
    const createRes2 = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send({
        title: 'Second Test Report',
        dataMartId,
        dataDestinationId: googleSheetsDestinationId,
        destinationConfig: { type: 'google-sheets-config', spreadsheetId, sheetId: sheetId2 },
      });

    expect(createRes2.status).toBe(201);
    secondReportId = createRes2.body.id;

    // Run second report
    const runRes2 = await agent.post(`/api/reports/${secondReportId}/run`).set(AUTH_HEADER);
    expect(runRes2.status).toBe(201);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify both metadata entries exist
    const credentials = JSON.parse(serviceAccountJson!);
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
      fields: 'developerMetadata(metadataId,metadataKey,metadataValue,location)',
    });

    const metadata = response.data.developerMetadata || [];
    const owoxMetadataEntries = metadata.filter(m => m.metadataKey === 'OWOX_REPORT_META');

    expect(owoxMetadataEntries.length).toBeGreaterThanOrEqual(2);

    const sheet1Metadata = owoxMetadataEntries.find(m => m.location?.sheetId === sheetId);
    const sheet2Metadata = owoxMetadataEntries.find(m => m.location?.sheetId === sheetId2);

    expect(sheet1Metadata).toBeDefined();
    expect(sheet2Metadata).toBeDefined();

    const sheet1Value = JSON.parse(sheet1Metadata!.metadataValue!);
    const sheet2Value = JSON.parse(sheet2Metadata!.metadataValue!);

    expect(sheet1Value.reportId).toBe(createdGoogleSheetReportId);
    expect(sheet2Value.reportId).toBe(secondReportId);
    expect(sheet1Value.dataMartId).toBe(sheet2Value.dataMartId);
  }, 30000);

  it('should delete developer metadata when report is deleted', async () => {
    // Create a report specifically for deletion test
    const createRes = await agent
      .post('/api/reports')
      .set(AUTH_HEADER)
      .send({
        title: 'Test Report for Deletion',
        dataMartId,
        dataDestinationId: googleSheetsDestinationId,
        destinationConfig: { type: 'google-sheets-config', spreadsheetId, sheetId },
      });

    expect(createRes.status).toBe(201);
    reportToDeleteId = createRes.body.id;

    // Run the report
    const runRes = await agent.post(`/api/reports/${reportToDeleteId}/run`).set(AUTH_HEADER);
    expect(runRes.status).toBe(201);

    // Wait for async processing
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify metadata exists before deletion
    const credentials = JSON.parse(serviceAccountJson!);
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const beforeResponse = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
      fields: 'developerMetadata(metadataId,metadataKey,metadataValue,location)',
    });

    const beforeOwoxMetadata = (beforeResponse.data.developerMetadata || []).find(
      m => m.metadataKey === 'OWOX_REPORT_META' && m.location?.sheetId === sheetId
    );
    expect(beforeOwoxMetadata).toBeDefined();

    // Delete the report
    const deleteRes = await agent.delete(`/api/reports/${reportToDeleteId}`).set(AUTH_HEADER);
    expect(deleteRes.status).toBe(200);

    // Wait for async cleanup
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify metadata was deleted
    const afterResponse = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
      fields: 'developerMetadata(metadataId,metadataKey,metadataValue,location)',
    });

    const afterOwoxMetadata = (afterResponse.data.developerMetadata || []).find(
      m =>
        m.metadataKey === 'OWOX_REPORT_META' &&
        m.location?.sheetId === sheetId &&
        JSON.parse(m.metadataValue!).reportId === reportToDeleteId
    );
    expect(afterOwoxMetadata).toBeUndefined();
  }, 30000);
});
