import { INestApplication } from '@nestjs/common';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import { GoogleServiceAccountTokenService } from 'src/data-marts/credentials/services/google-service-account-token.service';
import * as supertest from 'supertest';
import { serviceAccountKey } from './fixtures/google-service-account-key';

const EMAIL = 'docs-writer@acme-docs.iam.gserviceaccount.com';

describe('Google Service Account Credentials (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  const googleTokens = {
    verify: jest.fn().mockResolvedValue({
      state: 'verified',
      message: 'Google issued a token for this key',
      validatedAt: new Date(),
    }),
    getAccessToken: jest.fn(),
    drop: jest.fn(),
  };

  beforeAll(async () => {
    const testApp = await createTestApp([
      { provide: GoogleServiceAccountTokenService, useValue: googleTokens },
    ]);
    app = testApp.app;
    agent = testApp.agent;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
  });

  async function create(): Promise<{ id: string; publicMetadata: unknown }> {
    const response = await agent
      .post('/api/credentials')
      .set(AUTH_HEADER)
      .send({
        title: 'Docs writer',
        definitionId: 'google-service-account',
        secret: { value: serviceAccountKey() },
      })
      .expect(201);
    return response.body;
  }

  it('keeps the key write-only and returns the service account address', async () => {
    const created = await create();

    const read = await agent.get(`/api/credentials/${created.id}`).set(AUTH_HEADER).expect(200);

    expect(read.body).toMatchObject({
      definition: { id: 'google-service-account', auth: { type: 'google-service-account' } },
      validationState: 'verified',
      publicMetadata: { clientEmail: EMAIL, projectId: 'acme-docs', privateKeyId: 'key-1' },
    });
    expect(JSON.stringify(read.body)).not.toContain('PRIVATE KEY');
  });

  it('refuses a replacement key for another service account', async () => {
    const created = await create();

    const response = await agent
      .put(`/api/credentials/${created.id}`)
      .set(AUTH_HEADER)
      .send({
        secret: {
          value: serviceAccountKey({ client_email: 'other@acme-docs.iam.gserviceaccount.com' }),
        },
      })
      .expect(400);

    expect(response.body.message).toBe(
      `The replacement key must belong to ${EMAIL}. Create another Credential for a different service account.`
    );
  });
});
