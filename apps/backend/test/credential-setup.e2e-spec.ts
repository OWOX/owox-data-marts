import type { INestApplication } from '@nestjs/common';
import type { IdpProvider, Payload } from '@owox/idp-protocol';
import { closeTestApp, createTestApp } from '@owox/test-utils';
import { DataSource } from 'typeorm';
import { SystemTimeService } from '../src/common/scheduler/services/system-time.service';
import { SystemTrigger } from '../src/common/scheduler/shared/entities/system-trigger.entity';
import { SystemTriggerHandlerService } from '../src/common/scheduler/system-tasks/system-trigger-handler.service';
import { CredentialSetup } from '../src/data-marts/credentials/entities/credential-setup.entity';

const owner = { 'x-owox-authorization': 'owner' };
const other = { 'x-owox-authorization': 'other' };
const anotherProject = { 'x-owox-authorization': 'another-project' };
const secret = 'provider-material-only-entered-in-browser';

describe('Credential browser setup', () => {
  let app: INestApplication;
  let agent: Awaited<ReturnType<typeof createTestApp>>['agent'];
  let database: DataSource;

  beforeAll(async () => {
    ({ app, agent } = await createTestApp());
    database = app.get(DataSource);
    const provider = app.getHttpAdapter().getInstance().get('idp') as IdpProvider;
    const payload = async (token: string): Promise<Payload> => ({
      userId: token === 'other' ? '2' : '1',
      projectId: token === 'another-project' ? 'another-project' : '0',
      roles: token === 'limited' ? ['viewer'] : ['admin'],
      email: 'owner@example.test',
      fullName: 'Owner',
    });
    jest.spyOn(provider, 'introspectToken').mockImplementation(payload);
    jest.spyOn(provider, 'parseToken').mockImplementation(payload);
    jest.spyOn(provider, 'getProjectMembers').mockResolvedValue(
      ['1', '2'].map(memberId => ({
        userId: memberId,
        email: `${memberId}@example.test`,
        fullName: memberId,
        projectRole: 'admin',
        userStatus: 'active',
        hasNotificationsEnabled: true,
        isOutbound: false,
      }))
    );
  }, 120_000);

  afterAll(async () => {
    if (app) await closeTestApp(app);
  });

  async function start(input: Record<string, unknown> = { definitionId: 'databricks-token' }) {
    const response = await agent.post('/api/credential-setup').set(owner).send(input).expect(201);
    return response.body;
  }

  async function createCredential(headers = owner) {
    const response = await agent
      .post('/api/credentials')
      .set(headers)
      .send({
        title: 'Databricks account',
        definitionId: 'databricks-token',
        fields: { token: secret },
        availableForUse: false,
        availableForMaintenance: false,
      });
    expect({
      status: response.status,
      error: response.status >= 400 ? response.body : undefined,
    }).toEqual({ status: 201 });
    return response.body.id as string;
  }

  it('keeps a suggested title in setup without creating a Credential', async () => {
    const before = await database.query('SELECT COUNT(*) AS count FROM credential');
    const setup = await start({ definitionId: 'databricks-token', title: '  Marketing access  ' });
    expect(setup.title).toBe('Marketing access');
    const read = await agent.get(`/api/credential-setup/${setup.id}`).set(owner).expect(200);
    expect(read.body.title).toBe('Marketing access');
    expect(await database.query('SELECT COUNT(*) AS count FROM credential')).toEqual(before);
    expect((await start()).title).toBeNull();
  });

  it.each(['   ', 'x'.repeat(256), 42])('rejects an invalid suggested title (%s)', async title => {
    await agent.post('/api/credential-setup').set(owner).send({ title }).expect(400);
  });

  it('does not accept a suggested title when reconnecting an existing Credential', async () => {
    const credentialId = await createCredential();
    await agent
      .post('/api/credential-setup')
      .set(owner)
      .send({ credentialId, title: 'Replacement name' })
      .expect(400);
    const read = await agent.get(`/api/credentials/${credentialId}`).set(owner).expect(200);
    expect(read.body.title).toBe('Databricks account');
  });

  it('correlates completion with the exact saved Credential without returning provider material', async () => {
    const setup = await start();
    const credentialId = await createCredential();
    const response = await agent
      .post(`/api/credential-setup/${setup.id}/complete`)
      .set(owner)
      .send({ credentialId })
      .expect(200);
    expect(response.body).toMatchObject({ id: setup.id, status: 'completed', credentialId });
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(new Date(setup.expiresAt).getTime() - new Date(setup.createdAt).getTime()).toBe(
      15 * 60_000
    );
    const read = await agent.get(`/api/credential-setup/${setup.id}`).set(owner).expect(200);
    expect(read.body).toEqual(response.body);
    await agent
      .post(`/api/credential-setup/${setup.id}/complete`)
      .set(owner)
      .send({ credentialId })
      .expect(200);
    const different = await createCredential();
    await agent
      .post(`/api/credential-setup/${setup.id}/complete`)
      .set(owner)
      .send({ credentialId: different })
      .expect(409);
  });

  it.each([other, anotherProject])(
    'hides requests from another actor even when they are an admin',
    async headers => {
      const setup = await start();
      const credentialId = await createCredential();
      await agent.get(`/api/credential-setup/${setup.id}`).set(headers).expect(404);
      await agent
        .post(`/api/credential-setup/${setup.id}/complete`)
        .set(headers)
        .send({ credentialId })
        .expect(404);
      await agent
        .post(`/api/credential-setup/${setup.id}/cancel`)
        .set(headers)
        .send({})
        .expect(404);
    }
  );

  it('rejects a different provider and a different update target', async () => {
    const credentialId = await createCredential();
    const wrongProvider = await start({ definitionId: 'snowflake-password' });
    await agent
      .post(`/api/credential-setup/${wrongProvider.id}/complete`)
      .set(owner)
      .send({ credentialId })
      .expect(400);
    const update = await start({ credentialId });
    expect(update).toMatchObject({
      mode: 'update',
      definitionId: 'databricks-token',
      credentialId,
    });
    const different = await createCredential();
    await agent
      .post(`/api/credential-setup/${update.id}/complete`)
      .set(owner)
      .send({ credentialId: different })
      .expect(400);
  });

  it('expires pending requests and refuses completion or cancellation after expiry', async () => {
    const setup = await start();
    await database.query('UPDATE credential_setup SET expiresAt = ? WHERE id = ?', [
      '2000-01-01 00:00:00',
      setup.id,
    ]);
    const read = await agent.get(`/api/credential-setup/${setup.id}`).set(owner).expect(200);
    expect(read.body.status).toBe('expired');
    const credentialId = await createCredential();
    await agent
      .post(`/api/credential-setup/${setup.id}/complete`)
      .set(owner)
      .send({ credentialId })
      .expect(410);
    await agent.post(`/api/credential-setup/${setup.id}/cancel`).set(owner).send({}).expect(410);
  });

  it('keeps cancellation terminal and idempotent', async () => {
    const setup = await start({});
    const credentialId = await createCredential();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await agent
        .post(`/api/credential-setup/${setup.id}/cancel`)
        .set(owner)
        .send({})
        .expect(200);
      expect(response.body.status).toBe('cancelled');
    }
    await agent
      .post(`/api/credential-setup/${setup.id}/complete`)
      .set(owner)
      .send({ credentialId })
      .expect(409);
  });

  it('rejects unknown providers and ambiguous create/update requests', async () => {
    await agent
      .post('/api/credential-setup')
      .set(owner)
      .send({ definitionId: 'missing' })
      .expect(400);
    await agent
      .post('/api/credential-setup')
      .set(owner)
      .send({ definitionId: 'databricks-token', credentialId: 'target' })
      .expect(400);
  });

  it('rechecks access after the initiating user loses admin rights', async () => {
    const credentialId = await createCredential(other);
    const setup = await start({ credentialId });
    const limited = { 'x-owox-authorization': 'limited' };
    await agent.get(`/api/credential-setup/${setup.id}`).set(limited).expect(403);
    await agent
      .post(`/api/credential-setup/${setup.id}/complete`)
      .set(limited)
      .send({ credentialId })
      .expect(403);
  });

  it.each(['deleted', 'invisible'] as const)(
    'keeps a completed receipt when its Credential becomes %s',
    async state => {
      const credentialId = await createCredential(other);
      const setup = await start({ credentialId });
      const completed = await agent
        .post(`/api/credential-setup/${setup.id}/complete`)
        .set(owner)
        .send({ credentialId })
        .expect(200);
      const reader = state === 'deleted' ? owner : { 'x-owox-authorization': 'limited' };
      if (state === 'deleted') {
        await agent.delete(`/api/credentials/${credentialId}`).set(other).expect(204);
      }
      await agent
        .get(`/api/credentials/${credentialId}`)
        .set(reader)
        .expect(state === 'deleted' ? 404 : 403);
      const status = await agent.get(`/api/credential-setup/${setup.id}`).set(reader).expect(200);
      expect(status.body).toEqual(completed.body);
      expect(JSON.stringify(status.body)).not.toContain(secret);
      await agent.get(`/api/credential-setup/${setup.id}`).set(other).expect(404);
    }
  );

  it('does not replace the winner of competing completion requests', async () => {
    const setup = await start();
    const first = await createCredential();
    const second = await createCredential();
    const results = await Promise.all(
      [first, second].map(credentialId =>
        agent.post(`/api/credential-setup/${setup.id}/complete`).set(owner).send({ credentialId })
      )
    );
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const winner = results.find(result => result.status === 200)!;
    const read = await agent.get(`/api/credential-setup/${setup.id}`).set(owner).expect(200);
    expect(read.body.credentialId).toBe(winner.body.credentialId);
  });

  it('removes setups after thirty minutes regardless of status without deleting Credentials', async () => {
    const credentialId = await createCredential();
    const repository = database.getRepository(CredentialSetup);
    const now = new Date('2030-01-01T12:00:00.000Z');
    const rows = await repository.save(
      [
        { status: 'pending' as const, createdAt: new Date('2030-01-01T11:30:00.001Z') },
        {
          status: 'pending' as const,
          createdAt: new Date('2030-01-01T11:30:00.000Z'),
          projectId: 'another-project',
          userId: '2',
        },
        { status: 'completed' as const, createdAt: new Date('2030-01-01T11:30:00.001Z') },
        { status: 'completed' as const, createdAt: new Date('2030-01-01T11:30:00.000Z') },
        { status: 'cancelled' as const, createdAt: new Date('2030-01-01T11:30:00.001Z') },
        { status: 'cancelled' as const, createdAt: new Date('2030-01-01T11:30:00.000Z') },
        { status: 'pending' as const, createdAt: new Date('2030-01-01T11:50:00.000Z') },
      ].map(input => ({
        projectId: '0',
        userId: '1',
        mode: 'create' as const,
        definitionId: 'databricks-token',
        credentialId: input.status === 'completed' ? credentialId : null,
        expiresAt: new Date(input.createdAt.getTime() + 15 * 60_000),
        completedAt: input.status === 'pending' ? null : new Date('2030-01-01T11:40:00.000Z'),
        ...input,
      }))
    );
    const trigger = await database.getRepository(SystemTrigger).findOneBy({
      type: 'CREDENTIAL_SETUP_CLEANUP',
    });
    expect(trigger).not.toBeNull();
    const clock = jest.spyOn(app.get(SystemTimeService), 'now').mockReturnValue(now);
    try {
      const handler = app.get(SystemTriggerHandlerService);
      await handler.handleTrigger(trigger!);
      for (const index of [0, 2, 4, 6]) {
        await agent.get(`/api/credential-setup/${rows[index].id}`).set(owner).expect(200);
      }
      for (const index of [1, 3, 5]) {
        expect(await repository.findOneBy({ id: rows[index].id })).toBeNull();
      }
      await agent.get(`/api/credential-setup/${rows[3].id}`).set(owner).expect(404);
      await agent.get(`/api/credentials/${credentialId}`).set(owner).expect(200);

      clock.mockReturnValue(new Date(now.getTime() + 1));
      await handler.handleTrigger(trigger!);
      for (const row of rows.slice(0, 6)) {
        expect(await repository.findOneBy({ id: row.id })).toBeNull();
      }
      await agent.get(`/api/credential-setup/${rows[6].id}`).set(owner).expect(200);
      await agent.get(`/api/credentials/${credentialId}`).set(owner).expect(200);
    } finally {
      clock.mockRestore();
    }
  });
});
