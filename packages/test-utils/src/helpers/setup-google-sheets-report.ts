import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';
import { DataDestinationBuilder } from '../fixtures/data-destination.builder';
import { DataDestinationType } from '../../../../apps/backend/src/data-marts/data-destination-types/enums/data-destination-type.enum';

export interface SetupGoogleSheetsReportOptions {
  agent: supertest.Agent;
  dataMartId: string;
  spreadsheetId: string;
  sheetId: number;
  /** Raw service-account JSON string (process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON). */
  serviceAccountJson: string;
  destinationTitle?: string;
  reportTitle?: string;
  /**
   * Optional Report-Columns picker config.
   *   - `undefined` / `null` → use all native columns from output schema (default behavior).
   *   - `string[]`           → only the listed column names land in the export.
   * Schema: `apps/backend/src/data-marts/dto/schemas/report-column-config.schema.ts`.
   */
  columnConfig?: string[] | null;
}

export interface SetupGoogleSheetsReportResult {
  dataDestinationId: string;
  reportId: string;
}

/**
 * Provisions a Google Sheets `DataDestination` + `Report` bound to a chosen
 * sheet. Returns IDs the test can use to trigger runs and inspect state.
 *
 * Steps:
 *   1. POST /api/data-destinations — create GOOGLE_SHEETS destination with the
 *      service-account credentials.
 *   2. PUT  /api/data-destinations/:id/availability — flip availability flags.
 *   3. POST /api/reports — create report tied to the data mart and sheet,
 *      with optional `columnConfig` for the picker.
 */
export async function setupGoogleSheetsReport(
  opts: SetupGoogleSheetsReportOptions
): Promise<SetupGoogleSheetsReportResult> {
  const {
    agent,
    dataMartId,
    spreadsheetId,
    sheetId,
    serviceAccountJson,
    destinationTitle = `Integration Test GS Destination ${Date.now()}`,
    reportTitle = `Integration Test GS Report ${Date.now()}`,
    columnConfig,
  } = opts;

  // Step 1: create Google Sheets destination.
  const destRes = await agent
    .post('/api/data-destinations')
    .set(AUTH_HEADER)
    .send(
      new DataDestinationBuilder()
        .withType(DataDestinationType.GOOGLE_SHEETS)
        .withTitle(destinationTitle)
        .withCredentials({
          type: 'google-sheets-credentials',
          serviceAccountKey: JSON.parse(serviceAccountJson),
        })
        .build()
    );
  expect(destRes.status).toBe(201);
  const dataDestinationId = destRes.body.id;

  // Step 2: flip availability flags on destination.
  await agent
    .put(`/api/data-destinations/${dataDestinationId}/availability`)
    .set(AUTH_HEADER)
    .send({ availableForUse: true, availableForMaintenance: true });

  // Step 3: create report.
  const reportPayload: Record<string, unknown> = {
    title: reportTitle,
    dataMartId,
    dataDestinationId,
    destinationConfig: { type: 'google-sheets-config', spreadsheetId, sheetId },
  };
  if (columnConfig !== undefined) {
    reportPayload.columnConfig = columnConfig;
  }

  const reportRes = await agent.post('/api/reports').set(AUTH_HEADER).send(reportPayload);
  expect(reportRes.status).toBe(201);

  return { dataDestinationId, reportId: reportRes.body.id };
}
