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
  /**
   * `select` is honoured, not ignored, for the same reason `withDeleted` is below: it is an
   * instruction about what the driver hands back, and a double that returns whole rows
   * regardless agrees with a service that asks for a projection and with one that does not.
   * Which columns a real database omits is pinned on the real schema in
   * connector-definition-tables.migration.spec.ts.
   */
  const project = <T extends object>(row: T, select?: (keyof T)[]): T =>
    select?.length
      ? (Object.fromEntries(select.map(column => [column, row[column]])) as T)
      : { ...row };

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
      find: jest.fn(async ({ where, withDeleted, select }) =>
        store.defs
          .filter(d => d.projectId === where.projectId && (withDeleted === true || !d.deletedAt))
          .map(d => project(d, select))
      ),
      // Writes ONLY the columns it is given, to the rows matching every criterion — which is
      // the whole reason the service uses it instead of save(): a save ships every column
      // that differs from the entity it read, reverting whatever landed in between. A double
      // that assigned the entity wholesale would agree with both and pin neither.
      update: jest.fn(async (criteria, patch) => {
        const rows = store.defs.filter(d =>
          Object.entries(criteria).every(([column, value]) => d[column] === value)
        );
        for (const row of rows) Object.assign(row, patch);
        return { affected: rows.length };
      }),
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
      find: jest.fn(async ({ where, select }) =>
        store.versions
          .filter(v => v.connectorDefinitionId === where.connectorDefinitionId)
          .map(v => project(v, select))
      ),
      // The guarded UPDATE saveDraft() uses instead of a read-modify-write save(): only rows
      // matching EVERY criterion are touched, and `affected` is what tells the service
      // whether the draft it read is still a draft.
      update: jest.fn(async (criteria, patch) => {
        const rows = store.versions.filter(v =>
          Object.entries(criteria).every(([column, value]) => v[column] === value)
        );
        for (const row of rows) Object.assign(row, patch);
        return { affected: rows.length };
      }),
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

  /**
   * The reserved-name guard is what keeps a custom connector from shadowing a bundled one --
   * ConnectorService resolves bundled names FIRST, so a custom connector allowed through
   * under a bundled name is unreachable by every resolve path and its author gets the
   * bundled connector's specification instead, with nothing anywhere saying why.
   *
   * A case-sensitive Set only guards the exact spelling. `googleads` is a different string
   * from `GoogleAds`, and the connector name is a case-INSENSITIVE identifier everywhere it
   * matters: MySQL's default collation makes the unique index treat them as one name, and a
   * human reading `googleads` reads it as Google Ads.
   */
  it('create() rejects a name that differs from a bundled connector only in case', async () => {
    const { service } = make();
    await expect(
      service.create('proj-1', 'user-1', { name: 'googleads', title: 'x', manifest: validManifest })
    ).rejects.toThrow(/reserved by a built-in connector/);
  });

  /**
   * Two names that differ only in case are one name to the production index (MySQL's default
   * collation is case-insensitive) and two to the local one (sqlite compares varchar as
   * BINARY). Left to the collation, the same create succeeds in dev and fails in production
   * -- and fails there as a driver error, since the app-layer guard cleared it.
   */
  it('create() rejects a name that differs from an existing one only in case', async () => {
    const { service } = make();
    await service.create('proj-1', 'user-1', {
      name: 'Report',
      title: 'x',
      manifest: validManifest,
    });
    await expect(
      service.create('proj-1', 'user-1', { name: 'report', title: 'y', manifest: validManifest })
    ).rejects.toThrow(/already exists in this project/);
  });

  it('create() still allows the same name in a different project', async () => {
    const { service } = make();
    await service.create('proj-1', 'user-1', {
      name: 'Report',
      title: 'x',
      manifest: validManifest,
    });
    await expect(
      service.create('proj-2', 'user-1', { name: 'report', title: 'y', manifest: validManifest })
    ).resolves.toMatchObject({ name: 'report' });
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
   * Deleting a connector frees its name. softDelete() renames the row it tombstones, which is
   * the whole mechanism -- assertNameAvailable() still reads `withDeleted: true`, so a
   * tombstone that kept its name would still collide and this would go red.
   *
   * The name has to survive on the row in some form: it is what tells whoever reads the table
   * later which connector this tombstone was.
   */
  it('create() reuses the name of a soft-deleted connector', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'x',
      manifest: validManifest,
    });
    await service.softDelete('proj-1', def.id);
    expect(store.defs[0].deletedAt).toBeInstanceOf(Date);
    expect(store.defs[0].name).toBe(`deleted:${def.id}:MyCustom`);

    const recreated = await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'y',
      manifest: validManifest,
    });

    expect(recreated.id).not.toBe(def.id);
    expect(recreated.name).toBe('MyCustom');
    expect(store.defs).toHaveLength(2);
  });

  /**
   * A name may be reused any number of times, so the tombstones pile up -- and every one of
   * them sits under the unique index on (projectId, name). Keying the tombstone on the
   * definition's id is what keeps them apart; a fixed suffix would collide on the second
   * delete and take the DELETE down with a driver error.
   */
  it('softDelete() tombstones each row under a name of its own', async () => {
    const { service, store } = make();
    for (let i = 0; i < 3; i++) {
      const def = await service.create('proj-1', 'user-1', {
        name: 'MyCustom',
        title: `attempt ${String(i)}`,
        manifest: validManifest,
      });
      await service.softDelete('proj-1', def.id);
    }

    const names = store.defs.map(d => d.name);
    expect(new Set(names).size).toBe(3);
    expect(names.every(n => n.endsWith(':MyCustom'))).toBe(true);
  });

  /**
   * `name` is varchar(255). A tombstone prefixes an id and must still fit, so the original is
   * truncated rather than the row failing to save -- an unsaveable tombstone would mean an
   * undeletable connector.
   */
  it('softDelete() keeps a tombstoned name inside the column', async () => {
    const { service, store } = make();
    const longName = 'A'.repeat(255);
    const def = await service.create('proj-1', 'user-1', {
      name: longName,
      title: 'x',
      manifest: validManifest,
    });
    await service.softDelete('proj-1', def.id);

    expect(store.defs[0].name.length).toBe(255);
    expect(store.defs[0].name.startsWith(`deleted:${def.id}:A`)).toBe(true);
  });

  /**
   * The row is what every list, picker and data-mart page reads; the manifest is what the
   * builder shows. Before updateMetadata() existed, only the manifest could be edited, so a
   * retitled connector kept its old title everywhere except the screen it was retitled on.
   */
  it('updateMetadata() writes the columns the rest of the product reads', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'Old title',
      description: 'Old description',
      docUrl: 'https://old.example',
      manifest: validManifest,
    });

    await service.updateMetadata('proj-1', def.id, {
      title: 'New title',
      description: 'New description',
    });

    expect(store.defs[0].title).toBe('New title');
    expect(store.defs[0].description).toBe('New description');
    // Untouched: a PATCH leaves out what it does not mention.
    expect(store.defs[0].docUrl).toBe('https://old.example');
  });

  /**
   * `undefined` and `null` have to mean different things or a nullable field can be set and
   * never unset: absent leaves the column, null clears it. Collapsing the two -- the shape a
   * `?? undefined` or a spread of the whole body would produce -- makes the difference
   * invisible.
   */
  it('updateMetadata() clears a nullable field on an explicit null', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'Title',
      description: 'Old description',
      docUrl: 'https://old.example',
      manifest: validManifest,
    });

    await service.updateMetadata('proj-1', def.id, { description: null });

    expect(store.defs[0].description).toBeNull();
    expect(store.defs[0].docUrl).toBe('https://old.example');
    expect(store.defs[0].title).toBe('Title');
  });

  /**
   * A data mart stores the connector it runs as `connector.source.name`, so a rename would
   * unbind every data mart pointing at the old name with no error at either end. The name is
   * absent from the input type, and this pins that a body carrying one anyway changes nothing.
   */
  it('updateMetadata() cannot rename a connector', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'Title',
      manifest: validManifest,
    });

    await service.updateMetadata('proj-1', def.id, {
      title: 'New title',
      ...({ name: 'Renamed' } as Record<string, never>),
    });

    expect(store.defs[0].name).toBe('MyCustom');
    expect(store.defs[0].title).toBe('New title');
  });

  it('updateMetadata() rejects a connector from another project', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'Title',
      manifest: validManifest,
    });

    await expect(service.updateMetadata('proj-2', def.id, { title: 'New title' })).rejects.toThrow(
      NotFoundException
    );
  });

  /**
   * `activeVersionId` lives on this row and belongs to publish(). Writing the loaded entity
   * back with save() ships every column that differs from the snapshot it was read at, so a
   * publish landing between the read and the write is reverted -- the released version becomes
   * unpublished and every run 400s with "has no published version to run". saveDraft() was hit
   * by exactly this and answered it the same way: write only the named columns.
   *
   * Not a hypothetical race here. The builder calls this immediately after saveDraft(), which
   * is the moment a publish is most likely to be in flight against the same connector.
   */
  it('updateMetadata() does not revert a publish that lands mid-update', async () => {
    const { service, store, defRepo } = make();
    const def = await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'Old title',
      manifest: validManifest,
    });

    // The row as this call reads it: nothing published yet.
    defRepo.findOne.mockResolvedValueOnce({ ...store.defs[0] });
    // ...and the publish that lands before the update is written.
    store.defs[0].activeVersionId = 'ver-1';

    await service.updateMetadata('proj-1', def.id, { title: 'New title' });

    expect(store.defs[0].title).toBe('New title');
    expect(store.defs[0].activeVersionId).toBe('ver-1');
  });

  it('updateMetadata() leaves the row alone when the body carries nothing', async () => {
    const { service, defRepo } = make();
    const def = await service.create('proj-1', 'user-1', {
      name: 'MyCustom',
      title: 'Title',
      manifest: validManifest,
    });
    defRepo.update.mockClear();

    await service.updateMetadata('proj-1', def.id, {});

    // TypeORM rejects an empty update outright, so this has to be skipped, not sent.
    expect(defRepo.update).not.toHaveBeenCalled();
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

  it('resolveManifest() returns the requested version manifest once it is published', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await service.publish('proj-1', def.id);
    const m = await service.resolveManifest('proj-1', 'A', 1);
    expect(m).toEqual(validManifest);
  });

  /**
   * `resolveManifest` is the SPEC path: what it returns is rendered into the parameter
   * schema the viewer-level GET :id/specification and :id/fields serve. A draft is an
   * editor's work in progress -- its parameter names, labels and defaults are literally
   * being typed -- so serving one there hands every project member a read of unfinished
   * editor state through an endpoint that was never meant to expose the manifest.
   */
  it('resolveManifest() refuses a pinned version that is still a draft', async () => {
    const { service } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await service.publish('proj-1', def.id);
    // v2: saved but never published.
    await service.saveDraft('proj-1', def.id, {
      ...validManifest,
      baseUrl: 'https://api.v2.example.com',
    });

    await expect(service.resolveManifest('proj-1', 'A', 2)).rejects.toThrow(NotFoundException);
    // The published version it supersedes still resolves.
    expect(await service.resolveManifest('proj-1', 'A', 1)).toEqual(validManifest);
  });

  it('resolveManifest() without a version refuses a connector that has never published', async () => {
    const { service } = make();
    await service.create('proj-1', 'u', { name: 'A', title: 'A', manifest: validManifest });
    await expect(service.resolveManifest('proj-1', 'A')).rejects.toThrow(NotFoundException);
  });

  it('resolveManifest() without a version serves the active version, not a newer draft', async () => {
    const { service, store } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    await service.publish('proj-1', def.id);
    store.versions.push({
      id: 'ver-2',
      connectorDefinitionId: def.id,
      version: 2,
      manifest: { ...validManifest, baseUrl: 'https://api.v2.example.com' },
      status: 'draft',
    });
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

  /**
   * The SHAPE of the projection only -- that the service asks for version metadata and not
   * the manifest column. What a real database then leaves out is pinned against the real
   * schema in connector-definition-tables.migration.spec.ts.
   */
  it('listVersions() asks for version metadata, not the manifests', async () => {
    const { service, versionRepo } = make();
    const def = await service.create('proj-1', 'u', {
      name: 'A',
      title: 'A',
      manifest: validManifest,
    });
    const versions = await service.listVersions('proj-1', def.id);

    expect(versionRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.not.arrayContaining(['manifest']) })
    );
    expect(versions[0].manifest).toBeUndefined();
    expect(versions[0]).toMatchObject({
      version: 1,
      status: ConnectorDefinitionVersionStatus.DRAFT,
    });
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
    const { version: published } = await service.publish('proj-1', def.id);
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

  /**
   * The secret model leans on the author noticing these: nothing refuses a manifest that
   * leaves a credential unprotected, because refusing on a heuristic would break working
   * connectors. That makes the warning the whole mitigation -- and a mitigation delivered
   * only to the backend logger does not exist for an author on managed cloud, who has no
   * way to read it. So publish() has to hand them back to whoever called it.
   */
  describe('publish() returns the coverage warnings, not just logs them', () => {
    const publishManifest = async (manifest: Record<string, unknown>) => {
      const { service } = make();
      const def = await service.create('proj-1', 'u', { name: 'A', title: 'A', manifest });
      return service.publish('proj-1', def.id);
    };

    it('is quiet for a manifest with nothing to report', async () => {
      const { warnings } = await publishManifest(validManifest);
      expect(warnings).toEqual([]);
    });

    it('reports an "authentication" reference with no parameter to protect', async () => {
      const { warnings } = await publishManifest({
        ...validManifest,
        authentication: {
          type: 'bearer',
          inject: {
            into: 'header',
            name: 'Authorization',
            format: 'Bearer {{ parameters.Undeclared }}',
          },
        },
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Undeclared');
      expect(warnings[0]).toContain('plain text');
    });

    it('reports a credential-looking parameter a node request interpolates unprotected', async () => {
      const { warnings } = await publishManifest({
        ...validManifest,
        parameters: { ApiKey: { requiredType: 'string', label: 'API key' } },
        nodes: {
          items: {
            fields: { id: { type: 'string' } },
            request: {
              method: 'GET',
              path: '/items',
              queryParameters: { api_key: '{{ parameters.ApiKey }}' },
            },
            recordSelector: { recordPath: [] },
          },
        },
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('ApiKey');
      expect(warnings[0]).toContain('SECRET');
    });

    /**
     * The other half of the specification fix: a SECRET parameter's `default` no longer
     * reaches the config form, so an author who put a working credential there has to be
     * told -- otherwise their connector simply stops pre-filling with no explanation.
     */
    it('reports a SECRET parameter whose value the specification will withhold', async () => {
      const { warnings } = await publishManifest({
        ...validManifest,
        parameters: {
          Token: {
            requiredType: 'string',
            label: 'Token',
            attributes: ['SECRET'],
            default: 'ghp_REAL_CREDENTIAL',
          },
        },
      });
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Token');
      expect(warnings[0]).toContain('default');
    });
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
    const { version: published } = await service.publish('proj-1', def.id);
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
    const { version: v1 } = await service.publish('proj-1', def.id);
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
      const { version: published } = await service.publish('proj-1', def.id);
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
