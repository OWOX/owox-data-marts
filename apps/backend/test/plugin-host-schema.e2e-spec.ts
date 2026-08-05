import { INestApplication } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { createTestApp } from '@owox/test-utils';
import { PluginAuditEvent } from 'src/plugin-host/entities/plugin-audit-event.entity';
import { PluginInstallation } from 'src/plugin-host/entities/plugin-installation.entity';
import { PluginPublicationProject } from 'src/plugin-host/entities/plugin-publication-project.entity';
import { PluginPublication } from 'src/plugin-host/entities/plugin-publication.entity';
import { PluginVersion } from 'src/plugin-host/entities/plugin-version.entity';
import { Plugin } from 'src/plugin-host/entities/plugin.entity';
import { PluginCollectionDocument } from 'src/plugin-host/collections/entities/plugin-collection-document.collection.entity';
import { PluginCollectionUsage } from 'src/plugin-host/collections/entities/plugin-collection-usage.collection.entity';
import { PluginCollectionAuditEvent } from 'src/plugin-host/collections/entities/plugin-collection-audit-event.collection.entity';
import { PLUGIN_COLLECTIONS_DATA_SOURCE } from 'src/config/plugin-collections-data-source-options.config';
import { DataSource, Repository } from 'typeorm';
import { PluginService } from 'src/plugin-host/services/plugin.service';
import { PluginVersionService } from 'src/plugin-host/services/plugin-version.service';

/**
 * Guards against entity/migration drift.
 *
 * The migration guards each table with `if (!hasTable) return`, so a silently skipped
 * or mismatched table would not fail any other suite -- every query below names real
 * columns, so a renamed or missing one fails here instead of in production.
 */
describe('Plugin host schema (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = (await createTestApp()).app;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const repo = <T extends object>(entity: new () => T): Repository<T> =>
    app.get(getRepositoryToken(entity));
  const collectionRepo = <T extends object>(entity: new () => T): Repository<T> =>
    app.get(getRepositoryToken(entity, PLUGIN_COLLECTIONS_DATA_SOURCE));

  it('creates all six tables with columns matching the entities', async () => {
    await expect(repo(Plugin).find({ where: { githubRepoId: '1' } })).resolves.toEqual([]);
    await expect(repo(PluginVersion).find({ where: { semver: '1.0.0' } })).resolves.toEqual([]);
    await expect(
      repo(PluginPublication).find({ where: { uniquenessKey: 'deployment:none' } })
    ).resolves.toEqual([]);
    await expect(
      repo(PluginPublicationProject).find({ where: { projectId: 'none' } })
    ).resolves.toEqual([]);
    await expect(repo(PluginInstallation).find({ where: { userId: 'none' } })).resolves.toEqual([]);
    await expect(repo(PluginAuditEvent).find({ where: { pluginId: 'none' } })).resolves.toEqual([]);
  });

  it('round-trips a plugin through the json and bigint transformers', async () => {
    const plugins = repo(Plugin);

    const saved = await plugins.save(
      plugins.create({
        // Beyond Number.MAX_SAFE_INTEGER on purpose: this must survive as a string.
        githubRepoId: '9007199254740993',
        repoOwner: 'OWOX',
        repoName: 'example-plugin',
        repoHtmlUrl: 'https://github.com/OWOX/example-plugin',
        isPrivateRepo: false,
        currentVersionId: null,
        lastSyncReport: {
          syncedAt: '2026-07-28T10:00:00.000Z',
          accessMode: 'anonymous',
          acceptedSemvers: ['1.0.0'],
          unchangedSemvers: [],
          rejections: [
            { tagName: 'v2.0.0-rc.1', githubReleaseId: '7', code: 'PRERELEASE_TAG', detail: 'rc' },
          ],
        },
      } as Partial<Plugin>)
    );

    const loaded = await plugins.findOneByOrFail({ id: saved.id });

    expect(loaded.githubRepoId).toBe('9007199254740993');
    expect(loaded.lastSyncReport?.rejections[0].code).toBe('PRERELEASE_TAG');
    expect(loaded.suspendedAt).toBeNull();
    expect(loaded.syncLeaseId).toBeNull();
    expect(loaded.syncLeaseStartedAt).toBeNull();

    await plugins.update(saved.id, {
      syncLeaseId: '11111111-1111-4111-8111-111111111111',
      syncLeaseStartedAt: new Date('2026-08-05T12:00:00.000Z'),
    });
    await expect(plugins.findOneByOrFail({ id: saved.id })).resolves.toMatchObject({
      syncLeaseId: '11111111-1111-4111-8111-111111111111',
      syncLeaseStartedAt: expect.any(Date),
    });
  });

  it('isolates collection tables in the named data source', async () => {
    await expect(collectionRepo(PluginCollectionDocument).find()).resolves.toEqual([]);
    await expect(collectionRepo(PluginCollectionUsage).find()).resolves.toEqual([]);
    await expect(collectionRepo(PluginCollectionAuditEvent).find()).resolves.toEqual([]);

    const main = app.get(DataSource);
    const collections = app.get<DataSource>(getDataSourceToken(PLUGIN_COLLECTIONS_DATA_SOURCE));
    expect(main.hasMetadata(PluginCollectionDocument)).toBe(false);
    expect(collections.hasMetadata(PluginCollectionDocument)).toBe(true);
    expect(await main.createQueryRunner().hasTable('plugin_collection_document')).toBe(false);
    expect(await collections.createQueryRunner().hasTable('plugin_collection_document')).toBe(true);
  });

  it('enforces one plugin per github repository', async () => {
    const plugins = repo(Plugin);
    const base = {
      githubRepoId: '424242',
      repoOwner: 'OWOX',
      repoName: 'dup',
      repoHtmlUrl: 'https://github.com/OWOX/dup',
    };

    await plugins.save(plugins.create(base as Partial<Plugin>));

    // A second row for the same repository is what the identity model exists to prevent.
    await expect(
      plugins.save(plugins.create({ ...base, repoName: 'renamed' } as Partial<Plugin>))
    ).rejects.toThrow();
  });

  it('fences version inserts with the current sync lease owner', async () => {
    const plugins = repo(Plugin);
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: '616161',
        repoOwner: 'OWOX',
        repoName: 'lease-fence',
        repoHtmlUrl: 'https://github.com/OWOX/lease-fence',
      } as Partial<Plugin>)
    );
    const pluginService = app.get(PluginService);
    const versions = app.get(PluginVersionService);
    const leaseId = await pluginService.tryClaimSyncSlot(plugin.id, 0);
    const input = {
      pluginId: plugin.id,
      semver: '1.0.0',
      commitSha: 'b'.repeat(40),
      githubReleaseId: '616161',
      tagName: 'v1.0.0',
      displayName: 'Lease fence',
      description: 'Lease fence',
      deliveryUrl: 'https://plugin.example.com',
      collections: [],
      releasePublishedAt: null,
    };

    await expect(versions.insertVersionForLease(input, 'stale-worker')).resolves.toBeNull();
    await expect(versions.insertVersionForLease(input, leaseId!)).resolves.toMatchObject({
      semver: '1.0.0',
    });
  });

  it('enforces one logical publication per uniqueness key', async () => {
    const plugins = repo(Plugin);
    const publications = repo(PluginPublication);
    const plugin = await plugins.save(
      plugins.create({
        githubRepoId: '515151',
        repoOwner: 'OWOX',
        repoName: 'pub',
        repoHtmlUrl: 'https://github.com/OWOX/pub',
      } as Partial<Plugin>)
    );

    const row = {
      pluginId: plugin.id,
      scope: 'deployment',
      uniquenessKey: `deployment:${plugin.id}`,
    };

    await publications.save(publications.create(row as Partial<PluginPublication>));

    // NULL projectId and userId would make a composite index useless here -- both
    // drivers treat NULLs as distinct, which is why the computed key exists.
    await expect(
      publications.save(publications.create(row as Partial<PluginPublication>))
    ).rejects.toThrow();
  });
});
