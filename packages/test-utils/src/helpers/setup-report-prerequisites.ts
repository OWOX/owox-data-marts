import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';
import { DataDestinationBuilder } from '../fixtures/data-destination.builder';
import { DataDestinationType } from '../../../../apps/backend/src/data-marts/data-destination-types/enums/data-destination-type.enum';
import { setupPublishedDataMart } from './setup-published-data-mart';

/**
 * Creates the full prerequisite chain for report tests:
 * storage -> data mart -> definition -> publish -> data destination.
 *
 * Uses LOOKER_STUDIO destination type because GOOGLE_SHEETS credential
 * validation calls real Google APIs and will fail in test environments.
 *
 * Returns storageId, dataMartId, and dataDestinationId for downstream test use.
 */
export async function setupReportPrerequisites(
  agent: supertest.Agent,
): Promise<{ storageId: string; dataMartId: string; dataDestinationId: string }> {
  // Step 1: Create published data mart (storage + data mart + definition + publish)
  const { storageId, dataMartId } = await setupPublishedDataMart(agent);

  // Step 2: Create data destination with LOOKER_STUDIO type
  const destRes = await agent
    .post('/api/data-destinations')
    .set(AUTH_HEADER)
    .send(
      new DataDestinationBuilder()
        .withType(DataDestinationType.LOOKER_STUDIO)
        .withCredentials({ type: 'looker-studio-credentials' })
        .build(),
    );
  expect(destRes.status).toBe(201);

  return { storageId, dataMartId, dataDestinationId: destRes.body.id };
}
