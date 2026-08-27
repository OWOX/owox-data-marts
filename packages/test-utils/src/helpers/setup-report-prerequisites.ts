import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';
import { DataDestinationBuilder } from '../fixtures/data-destination.builder';
import { DataDestinationType } from '../../../../apps/backend/src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { setupPublishedDataMart } from './setup-published-data-mart';

/**
 * Destination types these helpers can create.
 *
 * GOOGLE_SHEETS is absent on purpose: its credential validation calls real Google APIs and
 * cannot succeed here.
 *
 * LOOKER_STUDIO is the default because it needs nothing but a schema check — but it is
 * pull-based, so the server has no run to start for its reports and both `POST /reports/:id/run`
 * and a REPORT_RUN trigger are refused. Use EMAIL wherever a test needs a report the server can
 * actually run: it validates offline too, and has a real report writer behind it.
 */
export type TestReportDestinationType =
  | DataDestinationType.LOOKER_STUDIO
  | DataDestinationType.EMAIL;

const CREDENTIALS_BY_TYPE: Record<TestReportDestinationType, Record<string, unknown>> = {
  [DataDestinationType.LOOKER_STUDIO]: { type: 'looker-studio-credentials' },
  [DataDestinationType.EMAIL]: { type: 'email-credentials', to: ['reports@example.com'] },
};

/** Report config for an EMAIL destination — the counterpart of `looker-studio-config`. */
export const EMAIL_REPORT_DESTINATION_CONFIG: Record<string, unknown> = {
  type: 'email-config',
  subject: 'Test report',
  templateSource: {
    type: 'CUSTOM_MESSAGE',
    config: { messageTemplate: 'Test message' },
  },
  reportCondition: 'ALWAYS',
};

/**
 * Creates the full prerequisite chain for report tests:
 * storage -> data mart -> definition -> publish -> data destination.
 *
 * Returns storageId, dataMartId, and dataDestinationId for downstream test use.
 */
export async function setupReportPrerequisites(
  agent: supertest.Agent,
  destinationType: TestReportDestinationType = DataDestinationType.LOOKER_STUDIO
): Promise<{ storageId: string; dataMartId: string; dataDestinationId: string }> {
  // Step 1: Create published data mart (storage + data mart + definition + publish)
  const { storageId, dataMartId } = await setupPublishedDataMart(agent);

  // Step 2: Create the data destination
  const destRes = await agent
    .post('/api/data-destinations')
    .set(AUTH_HEADER)
    .send(
      new DataDestinationBuilder()
        .withType(destinationType)
        .withCredentials(CREDENTIALS_BY_TYPE[destinationType])
        .build()
    );
  expect(destRes.status).toBe(201);

  const dataDestinationId = destRes.body.id;

  // Permissions Model: new entities default to Not Available — make them available for test compatibility
  await agent
    .put(`/api/data-storages/${storageId}/availability`)
    .set(AUTH_HEADER)
    .send({ availableForUse: true, availableForMaintenance: true });
  await agent
    .put(`/api/data-marts/${dataMartId}/availability`)
    .set(AUTH_HEADER)
    .send({ availableForReporting: true, availableForMaintenance: true });
  await agent
    .put(`/api/data-destinations/${dataDestinationId}/availability`)
    .set(AUTH_HEADER)
    .send({ availableForUse: true, availableForMaintenance: true });

  return { storageId, dataMartId, dataDestinationId };
}
