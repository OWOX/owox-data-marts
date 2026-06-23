import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  DataDestinationBuilder,
  LOOKER_STUDIO_CREDENTIALS,
  AUTH_HEADER,
} from '@owox/test-utils';
import { DataDestinationType } from '../src/data-marts/data-destination-types/enums/data-destination-type.enum';

// Smoke-tests the auto-create endpoint wiring (route ordering after the :id OAuth
// routes, auth, Action.USE access check, controller -> service) without hitting
// Google: a non-Google-Sheets destination is rejected by the service's type guard
// before any Google API call.
describe('Create Google Sheet document API (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let destinationId: string;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    const payload = new DataDestinationBuilder()
      .withType(DataDestinationType.LOOKER_STUDIO)
      .withCredentials(LOOKER_STUDIO_CREDENTIALS)
      .build();
    const res = await agent.post('/api/data-destinations').set(AUTH_HEADER).send(payload);
    destinationId = res.body.id as string;
  });

  afterAll(async () => {
    await closeTestApp(app);
  });

  it('POST /api/data-destinations/:id/google-sheets/documents - 400 for a non-Google-Sheets destination', async () => {
    const res = await agent
      .post(`/api/data-destinations/${destinationId}/google-sheets/documents`)
      .set(AUTH_HEADER)
      .send({ title: 'My Report' });

    expect(res.status).toBe(400);
  });
});
