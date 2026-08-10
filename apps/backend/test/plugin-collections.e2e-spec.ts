import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createTestApp } from '@owox/test-utils';
import { PLUGIN_COLLECTIONS_DATA_SOURCE } from 'src/config/plugin-collections-data-source-options.config';
import {
  PLUGIN_ENTITY_AUTHORIZATION_FACADE,
  PluginEntityAuthorizationRequest,
} from 'src/data-marts/facades/plugin-entity-authorization.facade';
import { IdpProviderService } from 'src/idp/services/idp-provider.service';
import { PLUGIN_RUNTIME_AUTHORIZER } from 'src/idp/ports/plugin-runtime-authorizer.port';
import { PluginCollectionAuditEvent } from 'src/plugin-host/collections/entities/plugin-collection-audit-event.collection.entity';
import { PluginCollectionDocument } from 'src/plugin-host/collections/entities/plugin-collection-document.collection.entity';
import { PluginCollectionUsage } from 'src/plugin-host/collections/entities/plugin-collection-usage.collection.entity';
import { PluginVersion } from 'src/plugin-host/entities/plugin-version.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { Repository } from 'typeorm';
import * as supertest from 'supertest';
import { createHash } from 'node:crypto';

describe('Plugin collections (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let pluginId: string;
  const deniedParents = new Set<string>();
  const canAccessMany = jest.fn(
    async (requests: PluginEntityAuthorizationRequest[]) =>
      new Map(requests.map(request => [request.entityId, !deniedParents.has(request.entityId)]))
  );

  const payload = (userId: string, authFlow: string) => ({
    userId,
    projectId: 'project-1',
    roles: ['viewer'],
    authFlow,
    ...(authFlow === 'plugin' ? { pluginId, installationId: `installation-${userId}` } : {}),
  });

  beforeAll(async () => {
    const idpProvider = {
      getProvider: () => ({
        parseToken: async (token: string) =>
          token.includes('member') ? payload('user-1', 'app_owox') : payload(token, 'plugin'),
      }),
    };
    const entityAuthorization = {
      canAccess: async (request: PluginEntityAuthorizationRequest) =>
        !deniedParents.has(request.entityId),
      canAccessMany,
    };
    const testApp = await createTestApp([
      { provide: IdpProviderService, useValue: idpProvider },
      {
        provide: PLUGIN_RUNTIME_AUTHORIZER,
        useValue: { assertActiveInstallation: jest.fn() },
      },
      { provide: PLUGIN_ENTITY_AUTHORIZATION_FACADE, useValue: entityAuthorization },
    ]);
    app = testApp.app;
    agent = testApp.agent;

    const plugins = app.get<Repository<Plugin>>(getRepositoryToken(Plugin));
    const versions = app.get<Repository<PluginVersion>>(getRepositoryToken(PluginVersion));
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: '6788',
        repoOwner: 'OWOX',
        repoName: 'collections-e2e',
        repoHtmlUrl: 'https://github.com/OWOX/collections-e2e',
      })
    );
    pluginId = plugin.id;
    const version = await versions.save(
      versions.create({
        pluginId,
        semver: '1.0.0',
        commitSha: 'a'.repeat(40),
        githubReleaseId: '6788',
        tagName: 'v1.0.0',
        displayName: 'Collections E2E',
        description: 'Collections E2E',
        deliveryType: 'remote',
        deliveryUrl: 'https://plugin.example.com',
        releasePublishedAt: new Date(),
        collections: [
          {
            name: 'dashboards',
            scope: 'project',
            entityBinding: {
              type: 'data-mart',
              actions: { read: 'SEE', create: 'SEE', update: 'SEE', delete: 'SEE' },
            },
          },
          { name: 'settings', scope: 'member' },
          {
            name: 'scan',
            scope: 'project',
            entityBinding: {
              type: 'data-mart',
              actions: { read: 'SEE', create: 'SEE', update: 'SEE', delete: 'SEE' },
            },
          },
        ],
      })
    );
    await plugins.update(pluginId, { currentVersionId: version.id });
  }, 60_000);

  afterAll(async () => app?.close());

  const request = (user = 'user-1') => ({
    get: (path: string) => agent.get(path).set('x-owox-authorization', user),
    put: (path: string) => agent.put(path).set('x-owox-authorization', user),
    delete: (path: string) => agent.delete(path).set('x-owox-authorization', user),
  });

  it('rejects a normal member token on the plugin-only API', async () => {
    await agent
      .get('/api/plugins/runtime/collections/dashboards/documents')
      .set('x-owox-authorization', 'member')
      .expect(403);
  });

  it('persists, updates and paginates entity-bound project documents', async () => {
    const path = '/api/plugins/runtime/collections/dashboards/documents';
    await request()
      .put(`${path}/one`)
      .send({ document: { title: 'One' }, parentId: 'mart-1' })
      .expect(200);
    await request()
      .put(`${path}/two`)
      .send({ document: { title: 'Two' }, parentId: 'mart-1' })
      .expect(200);

    const updated = await request()
      .put(`${path}/one`)
      .send({ document: { title: 'Updated' }, parentId: 'mart-1' })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: 'one',
      parentId: 'mart-1',
      document: { title: 'Updated' },
    });

    const first = await request().get(`${path}?limit=1`).expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await request()
      .get(`${path}?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`)
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
  });

  it('keeps parentId immutable and hides a document after parent access is lost', async () => {
    const path = '/api/plugins/runtime/collections/dashboards/documents/one';
    await request().put(path).send({ document: {}, parentId: 'mart-2' }).expect(400);

    deniedParents.add('mart-1');
    // Authorization is evaluated against the stored parent before parent immutability,
    // so a caller cannot probe an inaccessible document id via 400 vs 403 responses.
    await request().put(path).send({ document: {}, parentId: 'mart-2' }).expect(403);
    await request().get(path).expect(404);
    await request().delete(path).expect(404);
    deniedParents.delete('mart-1');
    await request().get(path).expect(200);
  });

  it('isolates member-scoped namespaces', async () => {
    const path = '/api/plugins/runtime/collections/settings/documents/preferences';
    await request('user-1')
      .put(path)
      .send({ document: { theme: 'dark' } })
      .expect(200);
    await request('user-2').get(path).expect(404);
    await request('user-1').get(path).expect(200);
  });

  it('treats document ids as byte-exact values independent of database collation', async () => {
    const base = '/api/plugins/runtime/collections/settings/documents';
    await request()
      .put(`${base}/Case`)
      .send({ document: { value: 'upper' } })
      .expect(200);
    await request()
      .put(`${base}/case`)
      .send({ document: { value: 'lower' } })
      .expect(200);

    await expect(request().get(`${base}/Case`)).resolves.toMatchObject({
      status: 200,
      body: { document: { value: 'upper' } },
    });
    await expect(request().get(`${base}/case`)).resolves.toMatchObject({
      status: 200,
      body: { document: { value: 'lower' } },
    });
  });

  it('serializes concurrent upserts without double-counting the document', async () => {
    const path = '/api/plugins/runtime/collections/dashboards/documents/concurrent';
    const results = await Promise.all([
      request()
        .put(path)
        .send({ document: { revision: 1 }, parentId: 'mart-1' }),
      request()
        .put(path)
        .send({ document: { revision: 2 }, parentId: 'mart-1' }),
    ]);
    expect(results.map(result => result.status)).toEqual([200, 200]);

    const documents = app.get<Repository<PluginCollectionDocument>>(
      getRepositoryToken(PluginCollectionDocument, PLUGIN_COLLECTIONS_DATA_SOURCE)
    );
    const usages = app.get<Repository<PluginCollectionUsage>>(
      getRepositoryToken(PluginCollectionUsage, PLUGIN_COLLECTIONS_DATA_SOURCE)
    );
    const stored = await documents.findOneByOrFail({ documentId: 'concurrent' });
    const namespaceUsage = await usages.findOneByOrFail({
      level: 'namespace',
      namespaceKey: stored.namespaceKey,
    });
    expect(namespaceUsage.documentCount).toBe(
      await documents.countBy({ namespaceKey: stored.namespaceKey })
    );
  });

  it('rejects an oversized UTF-8 document without persisting it', async () => {
    const path = '/api/plugins/runtime/collections/settings/documents/oversized';
    await request()
      .put(path)
      .send({ document: { value: 'x'.repeat(1024 * 1024) } })
      .expect(413);

    const documents = app.get<Repository<PluginCollectionDocument>>(
      getRepositoryToken(PluginCollectionDocument, PLUGIN_COLLECTIONS_DATA_SOURCE)
    );
    await expect(documents.findOneBy({ documentId: 'oversized' })).resolves.toBeNull();
  });

  it('rejects deeply nested JSON without recursive validation', async () => {
    let nested: Record<string, unknown> = {};
    for (let depth = 0; depth <= 100; depth += 1) nested = { child: nested };

    await request()
      .put('/api/plugins/runtime/collections/settings/documents/too-deep')
      .send({ document: nested })
      .expect(400);
  });

  it('bounds the raw rows scanned for an authorization-filtered page', async () => {
    const documents = app.get<Repository<PluginCollectionDocument>>(
      getRepositoryToken(PluginCollectionDocument, PLUGIN_COLLECTIONS_DATA_SOURCE)
    );
    const anchor = await documents.findOneByOrFail({ documentId: 'one' });
    const namespaceKey = createHash('sha256')
      .update(JSON.stringify([pluginId, 'project-1', 'project', null, 'scan']))
      .digest('hex');
    const hidden = Array.from({ length: 11 }, (_, index) => {
      const documentId = `scan-${String(index).padStart(3, '0')}`;
      const parentId = `denied-${String(index).padStart(3, '0')}`;
      deniedParents.add(parentId);
      return documents.create({
        ...anchor,
        id: undefined,
        namespaceKey,
        collectionName: 'scan',
        documentKey: createHash('sha256').update(documentId).digest('hex'),
        documentId,
        parentId,
      });
    });
    await documents.save(hidden);
    canAccessMany.mockClear();

    const cursor = Buffer.from('0'.repeat(64), 'utf8').toString('base64url');
    const page = await request()
      .get(
        `/api/plugins/runtime/collections/scan/documents?limit=100&cursor=${encodeURIComponent(cursor)}`
      )
      .expect(200);

    expect(page.body.items).toEqual([]);
    expect(page.body.nextCursor).toEqual(expect.any(String));
    expect(canAccessMany).toHaveBeenCalledTimes(1);
    expect(canAccessMany.mock.calls[0][0]).toHaveLength(10);

    const audits = app.get<Repository<PluginCollectionAuditEvent>>(
      getRepositoryToken(PluginCollectionAuditEvent, PLUGIN_COLLECTIONS_DATA_SOURCE)
    );
    await expect(
      audits.findOneBy({ action: 'LIST', outcome: 'AUTHORIZATION_DENIED' })
    ).resolves.toMatchObject({ metadata: { deniedCount: 10 } });

    await documents.remove(hidden);
    for (const entity of hidden) deniedParents.delete(entity.parentId!);
  });

  it('deletes data and keeps counters and body-free audit records consistent', async () => {
    const path = '/api/plugins/runtime/collections/dashboards/documents/two';
    await request().delete(path).expect(204);
    await request().get(path).expect(404);

    const documents = app.get<Repository<PluginCollectionDocument>>(
      getRepositoryToken(PluginCollectionDocument, PLUGIN_COLLECTIONS_DATA_SOURCE)
    );
    const usages = app.get<Repository<PluginCollectionUsage>>(
      getRepositoryToken(PluginCollectionUsage, PLUGIN_COLLECTIONS_DATA_SOURCE)
    );
    const audits = app.get<Repository<PluginCollectionAuditEvent>>(
      getRepositoryToken(PluginCollectionAuditEvent, PLUGIN_COLLECTIONS_DATA_SOURCE)
    );
    await expect(documents.findOneBy({ documentId: 'two' })).resolves.toBeNull();
    expect(
      (await usages.find()).every(row => row.documentCount >= 0 && Number(row.totalBytes) >= 0)
    ).toBe(true);
    const events = await audits.find();
    expect(events.some(event => event.action === 'DELETE' && event.outcome === 'SUCCESS')).toBe(
      true
    );
    expect(events.some(event => event.outcome === 'AUTHORIZATION_DENIED')).toBe(true);
    expect(events.every(event => !JSON.stringify(event).includes('Updated'))).toBe(true);
  });
});
