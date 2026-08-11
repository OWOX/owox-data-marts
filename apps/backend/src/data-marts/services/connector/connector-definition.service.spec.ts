// These cases drive the service with in-memory repository doubles, which cannot join a real
// transaction. Rollback is covered against the real schema in
// connector-definition-tables.migration.spec.ts.
jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ConnectorDefinitionService } from './connector-definition.service';
import { ConnectorDefinitionVersionStatus } from '../../entities/connector-definition-version.entity';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';

describe('ConnectorDefinitionService', () => {
  const make = () => {
    const store: { defs: any[]; versions: any[] } = { defs: [], versions: [] };

    const defRepo = {
      create: jest.fn(d => ({ id: `def-${store.defs.length + 1}`, ...d })),
      save: jest.fn(async d => {
        const i = store.defs.findIndex(x => x.id === d.id);
        if (i >= 0) store.defs[i] = d;
        else store.defs.push(d);
        return d;
      }),
      // `withDeleted` is honoured, not ignored. TypeORM excludes soft-deleted rows by
      // default and INCLUDES them when the option is set; a double that always excluded
      // them encoded the opposite of production, so a service that dropped the flag kept
      // every test in this file green.
      findOne: jest.fn(
        async ({ where, withDeleted }) =>
          store.defs.find(
            d =>
              (where.id ? d.id === where.id : true) &&
              (where.projectId ? d.projectId === where.projectId : true) &&
              (where.name ? d.name === where.name : true) &&
              (withDeleted === true || !d.deletedAt)
          ) ?? null
      ),
      find: jest.fn(async ({ where }) =>
        store.defs.filter(d => d.projectId === where.projectId && !d.deletedAt)
      ),
      softDelete: jest.fn(async (id: string) => {
        const d = store.defs.find(x => x.id === id);
        if (d) d.deletedAt = new Date();
      }),
    };

    const versionRepo = {
      create: jest.fn(v => ({ id: `ver-${store.versions.length + 1}`, ...v })),
      save: jest.fn(async v => {
        const i = store.versions.findIndex(x => x.id === v.id);
        if (i >= 0) store.versions[i] = v;
        else store.versions.push(v);
        return v;
      }),
      findOne: jest.fn(async ({ where, order }) => {
        let rows = store.versions.filter(
          v =>
            (where.connectorDefinitionId
              ? v.connectorDefinitionId === where.connectorDefinitionId
              : true) &&
            (where.id ? v.id === where.id : true) &&
            (where.version !== undefined ? v.version === where.version : true) &&
            (where.status ? v.status === where.status : true)
        );
        if (order?.version === 'DESC') rows = rows.sort((a, b) => b.version - a.version);
        return rows[0] ?? null;
      }),
      find: jest.fn(async ({ where }) =>
        store.versions.filter(v => v.connectorDefinitionId === where.connectorDefinitionId)
      ),
    };

    const dataMartService = {
      findByProjectIdAndDefinitionType: jest.fn().mockResolvedValue([]),
    };

    const service = new ConnectorDefinitionService(
      defRepo as never,
      versionRepo as never,
      dataMartService as never
    );
    return { service, store, defRepo, versionRepo, dataMartService };
  };

  const validManifest = {
    version: '1.0',
    name: 'MyCustom',
    baseUrl: 'https://api.example.com',
    parameters: { Token: { requiredType: 'string', isRequired: true, label: 'Token' } },
    nodes: {
      items: {
        fields: { id: { type: 'string' } },
        request: { method: 'GET', path: '/items' },
        recordSelector: { recordPath: [] },
      },
    },
  };

  it('create() stores a definition and a draft version 1', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'My Custom',
      manifest: validManifest,
    });
    expect(def.id).toBeDefined();
    expect(store.defs).toHaveLength(1);
    expect(store.versions).toHaveLength(1);
    expect(store.versions[0].version).toBe(1);
    expect(store.versions[0].status).toBe(ConnectorDefinitionVersionStatus.DRAFT);
  });

  it('create() propagates a failed version insert instead of returning a half-built connector', async () => {
    const { service, versionRepo } = make();
    versionRepo.save.mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      service.create('proj-1', 'user-1', {
        name: 'MyCustom',
        title: 'My Custom',
        manifest: validManifest,
      })
    ).rejects.toThrow('connection reset');
  });

  it('create() rejects a name that collides with a bundled connector', async () => {
    const { service } = make();
    await expect(
      service.create('proj-1', 'user-1', { name: 'GitHub', title: 'x', manifest: validManifest })
    ).rejects.toThrow(BadRequestException);
  });

  it('create() rejects a duplicate name within the same project', async () => {
    const { service } = make();
    await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'x',
      manifest: validManifest,
    });
    await expect(
      service.create('proj-1', 'user-1', { name: 'MyCustom', title: 'y', manifest: validManifest })
    ).rejects.toThrow(BadRequestException);
  });

  /**
   * The name of a soft-deleted connector stays reserved: assertNameAvailable() looks it up
   * with `withDeleted: true`, so the tombstoned row is still a collision. Deleting that flag
   * from the service turns this red.
   *
   * This is the flag's SHAPE only -- it proves the service asks the repository to include
   * soft-deleted rows, against a double that now agrees with production about what the
   * option means. Which rows a real database hands back is pinned separately, on the real
   * schema, in connector-definition-tables.migration.spec.ts.
   */
  it('create() keeps a soft-deleted connector name reserved', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'x',
      manifest: validManifest,
    });
    await service.softDelete('proj-1', def.id);
    expect(store.defs[0].deletedAt).toBeInstanceOf(Date);

    await expect(
      service.create('proj-1', 'user-1', { name: 'MyCustom', title: 'y', manifest: validManifest })
    ).rejects.toThrow(/already exists in this project/);
    expect(store.defs).toHaveLength(1);
  });

  it('create() rejects an invalid name pattern', async () => {
    const { service } = make();
    await expect(
      service.create('proj-1', 'user-1', {
        name: '1 bad name',
        title: 'x',
        manifest: validManifest,
      })
    ).rejects.toThrow(BadRequestException);
  });

  it('listByProject() returns only the project rows', async () => {
    const { service } = make();
    await service.create('proj-1', 'u', { name: 'A', title: 'A', manifest: validManifest });
    await service.create('proj-2', 'u', { name: 'B', title: 'B', manifest: validManifest });
    const rows = await service.listByProject('proj-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('A');
  });

  it('getById() enforces tenant isolation', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await expect(service.getById('proj-2', def.id)).rejects.toThrow(NotFoundException);
    const got = await service.getById('proj-1', def.id);
    expect(got.id).toBe(def.id);
  });

  it('resolveManifest() returns the requested version manifest', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    const m = await service.resolveManifest('proj-1', 'A', 1);
    expect(m).toEqual(validManifest);
    void def;
  });

  it('resolveManifest() without a version falls back to the latest version', async () => {
    const { service } = make();
    await service.create('proj-1', 'u', { name: 'A', title: 'A', manifest: validManifest });
    const m = await service.resolveManifest('proj-1', 'A');
    expect(m).toEqual(validManifest);
  });

  it('resolveManifest() without a version prefers the activeVersionId', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    // Simulate a second version and point activeVersionId at version 1.
    const v1 = store.versions[0];
    store.versions.push({
      id: 'ver-2',
      connectorDefinitionId: def.id,
      version: 2,
      manifest: { ...validManifest, baseUrl: 'https://api.v2.example.com' },
      status: 'draft',
    });
    store.defs[0].activeVersionId = v1.id;
    const m = await service.resolveManifest('proj-1', 'A');
    expect(m).toEqual(validManifest); // active (v1), NOT the newer v2
  });

  it('resolveManifest() throws for an unknown connector name', async () => {
    const { service } = make();
    await expect(service.resolveManifest('proj-1', 'DoesNotExist')).rejects.toThrow(
      NotFoundException
    );
  });

  it('getVersion() returns the requested version and isolates by tenant', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    const v = await service.getVersion('proj-1', def.id, 1);
    expect(v.version).toBe(1);
    await expect(service.getVersion('proj-2', def.id, 1)).rejects.toThrow(NotFoundException);
  });

  it('getVersion() throws when the version does not exist', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await expect(service.getVersion('proj-1', def.id, 99)).rejects.toThrow(NotFoundException);
  });

  it('listVersions() returns the connector versions and isolates by tenant', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    const versions = await service.listVersions('proj-1', def.id);
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
    await expect(service.listVersions('proj-2', def.id)).rejects.toThrow(NotFoundException);
  });

  it('saveDraft() updates the open draft manifest', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    const next = { ...validManifest, baseUrl: 'https://api.changed.com' };
    await service.saveDraft('proj-1', def.id, next);
    expect(store.versions[0].manifest.baseUrl).toBe('https://api.changed.com');
    expect(store.versions).toHaveLength(1);
  });

  it('saveDraft() opens a new draft when the latest version is published', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await service.publish('proj-1', def.id);
    await service.saveDraft('proj-1', def.id, { ...validManifest, baseUrl: 'https://api.v2.com' });
    expect(store.versions).toHaveLength(2);
    expect(store.versions[1].version).toBe(2);
    expect(store.versions[1].status).toBe(ConnectorDefinitionVersionStatus.DRAFT);
  });

  it('publish() validates the manifest, marks it published and sets activeVersionId', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    const published = await service.publish('proj-1', def.id);
    expect(published.status).toBe(ConnectorDefinitionVersionStatus.PUBLISHED);
    expect(published.publishedAt).toBeInstanceOf(Date);
    const reloaded = store.defs.find(d => d.id === def.id);
    expect(reloaded.activeVersionId).toBe(published.id);
  });

  it('publish() rejects an invalid manifest', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await service.saveDraft('proj-1', def.id, { not: 'a valid manifest' } as never);
    await expect(service.publish('proj-1', def.id)).rejects.toThrow(BadRequestException);
  });

  it('publish() throws when there is no open draft', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await service.publish('proj-1', def.id);
    await expect(service.publish('proj-1', def.id)).rejects.toThrow(BadRequestException);
  });

  it('softDelete() removes the definition for the project', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await service.softDelete('proj-1', def.id);
    expect(store.defs[0].deletedAt).toBeInstanceOf(Date);
  });

  describe('softDelete() referenced-by-data-mart guard', () => {
    it('refuses to delete a connector referenced by a data mart', async () => {
      const { service, defRepo, dataMartService } = make();
      const def = await service.create('project-1', 'user-1', {
        name: 'CocCocAds',
        title: 'CocCoc Ads',
        manifest: validManifest,
      });
      dataMartService.findByProjectIdAndDefinitionType.mockResolvedValue([
        { id: 'dm-1', definition: { connector: { source: { name: 'CocCocAds' } } } },
        { id: 'dm-2', definition: { connector: { source: { name: 'GoogleAds' } } } },
      ] as never);

      await expect(service.softDelete('project-1', def.id)).rejects.toThrow(
        BusinessViolationException
      );
      expect(defRepo.softDelete).not.toHaveBeenCalled();
    });

    it('reports the referencing data mart ids', async () => {
      const { service, dataMartService } = make();
      const def = await service.create('project-1', 'user-1', {
        name: 'CocCocAds',
        title: 'CocCoc Ads',
        manifest: validManifest,
      });
      dataMartService.findByProjectIdAndDefinitionType.mockResolvedValue([
        { id: 'dm-1', definition: { connector: { source: { name: 'CocCocAds' } } } },
      ] as never);

      await expect(service.softDelete('project-1', def.id)).rejects.toMatchObject({
        errorDetails: { referencedDataMarts: ['dm-1'] },
      });
    });

    it('deletes a connector no data mart references', async () => {
      const { service, defRepo, dataMartService } = make();
      const def = await service.create('project-1', 'user-1', {
        name: 'CocCocAds',
        title: 'CocCoc Ads',
        manifest: validManifest,
      });
      dataMartService.findByProjectIdAndDefinitionType.mockResolvedValue([
        { id: 'dm-2', definition: { connector: { source: { name: 'GoogleAds' } } } },
      ] as never);

      await service.softDelete('project-1', def.id);

      expect(defRepo.softDelete).toHaveBeenCalledWith(def.id);
    });

    it('deletes when the project has no connector data marts at all', async () => {
      const { service, defRepo, dataMartService } = make();
      const def = await service.create('project-1', 'user-1', {
        name: 'CocCocAds',
        title: 'CocCoc Ads',
        manifest: validManifest,
      });
      dataMartService.findByProjectIdAndDefinitionType.mockResolvedValue([]);

      await service.softDelete('project-1', def.id);

      expect(defRepo.softDelete).toHaveBeenCalledWith(def.id);
    });
  });

  it('tryResolveManifest() returns null when no custom connector exists (bundled name)', async () => {
    const { service } = make();
    const result = await service.tryResolveManifest('proj-1', 'GitHub');
    expect(result).toBeNull();
  });

  it('tryResolveManifest() returns the manifest for an existing custom connector (published)', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await service.publish('proj-1', def.id);
    const result = await service.tryResolveManifest('proj-1', 'A');
    expect(result).toEqual(validManifest);
  });

  it('tryResolveManifest() is tenant-isolated', async () => {
    const { service } = make();
    await service.create('proj-1', 'u', { name: 'A', title: 'A', manifest: validManifest });
    const result = await service.tryResolveManifest('proj-2', 'A');
    expect(result).toBeNull();
  });

  it('tryResolveManifest (run path) returns a published version when no version is pinned', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    // draft only → run resolution must NOT return it
    await expect(service.tryResolveManifest('proj-1', 'A')).rejects.toThrow();
    // after publish → returns the published manifest
    await service.publish('proj-1', def.id);
    const m = await service.tryResolveManifest('proj-1', 'A');
    expect(m).toEqual(validManifest);
  });

  it('tryResolveManifest (run path) rejects pinning a draft version', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await service.publish('proj-1', def.id);
    // open a new draft (v2) but do not publish
    await service.saveDraft('proj-1', def.id, { ...validManifest, baseUrl: 'https://api.v2.com' });
    await expect(service.tryResolveManifest('proj-1', 'A', 2)).rejects.toThrow();
    // pinning the published v1 works
    const m = await service.tryResolveManifest('proj-1', 'A', 1);
    expect(m).toEqual(validManifest);
  });

  // --- setActiveVersion ---

  it('setActiveVersion() sets activeVersionId to the published version row id', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    const published = await service.publish('proj-1', def.id);
    // Reset activeVersionId to simulate it not being set (test the method independently)
    const storedDef = store.defs.find(d => d.id === def.id);
    storedDef.activeVersionId = null;
    const result = await service.setActiveVersion('proj-1', def.id, published.version);
    expect(result.activeVersionId).toBe(published.id);
    expect(store.defs.find(d => d.id === def.id)!.activeVersionId).toBe(published.id);
  });

  it('setActiveVersion() throws BadRequestException when the version is a draft', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    // version 1 is DRAFT at this point
    await expect(service.setActiveVersion('proj-1', def.id, 1)).rejects.toThrow(
      BadRequestException
    );
  });

  it('setActiveVersion() throws BadRequestException for a non-existent version number', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await service.publish('proj-1', def.id);
    await expect(service.setActiveVersion('proj-1', def.id, 99)).rejects.toThrow(
      BadRequestException
    );
  });

  it('setActiveVersion() can re-activate a prior published version (rollback)', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    const v1 = await service.publish('proj-1', def.id);
    // publish v2
    await service.saveDraft('proj-1', def.id, { ...validManifest, baseUrl: 'https://api.v2.com' });
    await service.publish('proj-1', def.id);
    // v2 is now active; roll back to v1
    const result = await service.setActiveVersion('proj-1', def.id, v1.version);
    expect(result.activeVersionId).toBe(v1.id);
    expect(store.defs.find(d => d.id === def.id)!.activeVersionId).toBe(v1.id);
  });

  it('getActiveVersionNumberForDef() returns the active version number (or null when none)', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    // no active version yet
    expect(await service.getActiveVersionNumberForDef(def)).toBeNull();
    // after publishing, activeVersionId is set
    await service.publish('proj-1', def.id);
    const reloaded = await service.getById('proj-1', def.id);
    expect(await service.getActiveVersionNumberForDef(reloaded)).toBe(1);
  });

  /**
   * The ceiling belongs to the SERVICE, not to the HTTP DTO alone.
   *
   * A stored manifest reaches the connector child through the OW_MANIFEST environment
   * variable, and Linux refuses a single env string past MAX_ARG_STRLEN (131072 bytes) with
   * an opaque `spawn E2BIG` -- by which point the connector is published and bound to a Data
   * Mart, so every run of it dies. `@MaxJsonSize` on CreateCustomConnectorRequestApiDto
   * covers the HTTP path only: the MCP `connector_publish` tool takes its manifest through
   * a Zod schema (`z.record(z.unknown())`) and reaches create()/saveDraft() without passing
   * that DTO at all. These cases drive the service directly, which is what both paths share.
   *
   * The number is re-stated rather than imported on purpose, as in custom-connector.dto.spec.ts:
   * it is a reasoned trade-off against a kernel limit, so moving it should turn these red
   * rather than have them silently follow.
   */
  describe('manifest size ceiling', () => {
    const MAX_MANIFEST_SIZE_BYTES = 120 * 1024;

    /**
     * A manifest whose `JSON.stringify` is exactly `bytes` long: `{"pad":"<x's>"}` is the
     * padding plus 10 bytes of envelope.
     */
    const manifestOfSize = (bytes: number) => ({ pad: 'x'.repeat(bytes - 10) });

    it('pads to exactly the byte length the service measures', () => {
      // Guards the helper: every boundary case below only means something while this holds.
      for (const size of [MAX_MANIFEST_SIZE_BYTES, MAX_MANIFEST_SIZE_BYTES + 1]) {
        expect(Buffer.byteLength(JSON.stringify(manifestOfSize(size)), 'utf8')).toBe(size);
      }
    });

    it('create() refuses a manifest too large for the connector runner to receive', async () => {
      const { service, store } = make();

      await expect(
        service.create('proj-1', 'user-1', {
          name: 'MyCustom',
          title: 'My Custom',
          manifest: manifestOfSize(MAX_MANIFEST_SIZE_BYTES + 1),
        })
      ).rejects.toThrow(BadRequestException);
      // ...and nothing is stored, so the name is not burned by the refusal.
      expect(store.defs).toHaveLength(0);
      expect(store.versions).toHaveLength(0);
    });

    it('create() accepts a manifest of exactly the ceiling', async () => {
      const { service, store } = make();

      await service.create('proj-1', 'user-1', {
        name: 'MyCustom',
        title: 'My Custom',
        manifest: manifestOfSize(MAX_MANIFEST_SIZE_BYTES),
      });

      expect(store.versions).toHaveLength(1);
    });

    it('saveDraft() refuses a manifest too large for the connector runner to receive', async () => {
      const { service, store } = make();
      const def = await service.create('proj-1', 'user-1', {
        name: 'MyCustom',
        title: 'My Custom',
        manifest: validManifest,
      });

      await expect(
        service.saveDraft('proj-1', def.id, manifestOfSize(MAX_MANIFEST_SIZE_BYTES + 1))
      ).rejects.toThrow(BadRequestException);
      // The draft that was already there is untouched.
      expect(store.versions).toHaveLength(1);
      expect(store.versions[0].manifest).toEqual(validManifest);
    });

    /**
     * MAX_ARG_STRLEN is a BYTE budget, and a manifest is user-authored text: labels,
     * descriptions and field names are routinely non-ASCII. A character count would wave
     * through a manifest three times over the kernel's limit.
     */
    it('measures the ceiling in bytes, not characters', async () => {
      const { service } = make();
      // 41000 '€' (3 bytes each) = 123000 bytes of padding: well past the ceiling in
      // bytes, well under it in characters.
      const multiByteManifest = { pad: '€'.repeat(41000) };
      expect(JSON.stringify(multiByteManifest).length).toBeLessThan(MAX_MANIFEST_SIZE_BYTES);
      expect(Buffer.byteLength(JSON.stringify(multiByteManifest), 'utf8')).toBeGreaterThan(
        MAX_MANIFEST_SIZE_BYTES
      );

      await expect(
        service.create('proj-1', 'user-1', {
          name: 'MyCustom',
          title: 'My Custom',
          manifest: multiByteManifest,
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('validateManifest() returns null for a valid manifest', () => {
    const { service } = make();
    expect(service.validateManifest(validManifest)).toBeNull();
  });

  it('validateManifest() returns an error string for an invalid manifest', () => {
    const { service } = make();
    const result = service.validateManifest({});
    expect(typeof result).toBe('string');
    expect(result).not.toBeNull();
  });

  // ManifestParser marks every parameter a manifest interpolates into a credential
  // position of `authentication` as SECRET, which is what keeps a custom connector's
  // token out of `data_mart.definition` and out of the viewer-readable GET response.
  // It can only mark parameters that are declared, so publish is where the residue
  // has to become visible to an operator.
  describe('publish() authentication-secret reporting', () => {
    const authManifest = (parameters: Record<string, unknown>, format: string) => ({
      version: '1.0',
      name: 'MyCustom',
      baseUrl: 'https://api.example.com',
      authentication: {
        type: 'bearer',
        inject: { into: 'header', name: 'Authorization', format },
      },
      parameters,
      nodes: {
        items: {
          fields: { id: { type: 'string' } },
          request: { method: 'GET', path: '/items' },
          recordSelector: { recordPath: [] },
        },
      },
    });

    const publishWith = async (manifest: Record<string, unknown>) => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const { service } = make();
      const def = await service.create('proj-1', 'u', {
        name: 'MyCustom',
        title: 'My Custom',
        manifest,
      });
      const published = await service.publish('proj-1', def.id);
      const messages = {
        warn: warn.mock.calls.map(c => String(c[0])),
        log: log.mock.calls.map(c => String(c[0])),
      };
      warn.mockRestore();
      log.mockRestore();
      return { published, messages };
    };

    it('reports the parameters it auto-protected so the masking is not a silent behaviour change', async () => {
      const { published, messages } = await publishWith(
        authManifest(
          { Token: { requiredType: 'string', isRequired: true } },
          'Bearer {{ parameters.Token }}'
        )
      );
      expect(published.status).toBe(ConnectorDefinitionVersionStatus.PUBLISHED);
      expect(messages.log.join('\n')).toContain('Token');
      expect(messages.warn).toHaveLength(0);
    });

    it('warns — and still publishes — when a credential reference has no parameter to mark', async () => {
      const { published, messages } = await publishWith(
        authManifest({}, 'Bearer {{ parameters.Ghost }}')
      );
      // A refusal would break connectors that publish and run fine today, so the
      // unprotectable reference is surfaced rather than blocked.
      expect(published.status).toBe(ConnectorDefinitionVersionStatus.PUBLISHED);
      expect(messages.warn.join('\n')).toContain('Ghost');
    });

    it('stays quiet for a manifest whose credential parameters are already declared and marked', async () => {
      const { messages } = await publishWith(
        authManifest(
          { Token: { requiredType: 'string', isRequired: true, attributes: ['SECRET'] } },
          'Bearer {{ parameters.Token }}'
        )
      );
      expect(messages.warn).toHaveLength(0);
      expect(messages.log).toHaveLength(0);
    });

    // The auto-marking above only covers `authentication`. A credential can just as easily
    // sit in a node request — `queryParameters: { api_key: '{{ parameters.ApiKey }}' }` with
    // no authentication block at all — where nothing may mark it, because the same position
    // legitimately carries page sizes and dates. Publish is the only place the author can be
    // told, so it has to say so rather than stay silent.
    const requestManifest = (parameters: Record<string, unknown>, queryParameters: unknown) => ({
      version: '1.0',
      name: 'MyCustom',
      baseUrl: 'https://api.example.com',
      parameters,
      nodes: {
        items: {
          fields: { id: { type: 'string' } },
          request: { method: 'GET', path: '/items', queryParameters },
          recordSelector: { recordPath: [] },
        },
      },
    });

    it('warns — and still publishes — when a node request interpolates an unprotected credential', async () => {
      const { published, messages } = await publishWith(
        requestManifest(
          { ApiKey: { requiredType: 'string', isRequired: true } },
          { api_key: '{{ parameters.ApiKey }}' }
        )
      );
      expect(published.status).toBe(ConnectorDefinitionVersionStatus.PUBLISHED);
      const warning = messages.warn.join('\n');
      // Naming the parameter AND the position is what makes the warning actionable.
      expect(warning).toContain('ApiKey');
      expect(warning).toContain('nodes.items.request.queryParameters.api_key');
    });

    it('does not warn about the ordinary parameters a node request interpolates', async () => {
      const { messages } = await publishWith(
        requestManifest(
          {
            PageSize: { requiredType: 'string' },
            StartDate: { requiredType: 'string' },
            AccountId: { requiredType: 'string' },
          },
          {
            limit: '{{ parameters.PageSize }}',
            since: '{{ parameters.StartDate }}',
            account: '{{ parameters.AccountId }}',
          }
        )
      );
      expect(messages.warn).toHaveLength(0);
      expect(messages.log).toHaveLength(0);
    });

    it('does not warn when the author marked the request credential SECRET himself', async () => {
      const { messages } = await publishWith(
        requestManifest(
          { ApiKey: { requiredType: 'string', attributes: ['SECRET'] } },
          {
            api_key: '{{ parameters.ApiKey }}',
          }
        )
      );
      expect(messages.warn).toHaveLength(0);
    });
  });
});
