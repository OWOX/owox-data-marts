import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DataDestinationIndexableSource } from './data-destination.source';
import { SearchIndexRepository } from '../schema/search-index.repository';
import { DataDestination } from '../../entities/data-destination.entity';
import { DataDestinationSearchIndex } from '../../entities/search/data-destination-search-index.entity';
import { DataDestinationCredential } from '../../entities/data-destination-credential.entity';
import { DestinationOwner } from '../../entities/destination-owner.entity';
import { DestinationContext } from '../../entities/destination-context.entity';
import { Context } from '../../entities/context.entity';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataStorageCredential } from '../../entities/data-storage-credential.entity';
import { DataMartContext } from '../../entities/data-mart-context.entity';
import { DataMartBusinessOwner } from '../../entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../../entities/data-mart-technical-owner.entity';
import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { ConnectorState } from '../../entities/connector-state.entity';
import { StorageOwner } from '../../entities/storage-owner.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import {
  DataDestinationType,
  toHumanReadable,
} from '../../data-destination-types/enums/data-destination-type.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextAccessService } from '../../services/context/context-access.service';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { toCursorTimestamp } from './indexable-source.port';
import type { PageCursor, SourceAccessScope } from './indexable-source.port';
import { describeLoadSearchableOneContract } from './indexable-source.contract';

const TEST_ENTITIES = [
  DataMart,
  DataStorage,
  DataStorageCredential,
  DataMartContext,
  DataMartBusinessOwner,
  DataMartTechnicalOwner,
  DataMartRelationship,
  ConnectorState,
  Context,
  StorageOwner,
  StorageContext,
  MemberRoleContext,
  DataDestination,
  DataDestinationSearchIndex,
  DataDestinationCredential,
  DestinationOwner,
  DestinationContext,
];

const STUB_EMBEDDING = Buffer.from(new Float32Array([1, 0]).buffer);

describe('DataDestinationIndexableSource', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let source: DataDestinationIndexableSource;
  let indexRepo: SearchIndexRepository;
  let destinationRepo: Repository<DataDestination>;
  let contextRepo: Repository<Context>;
  const getRoleScope = jest.fn<Promise<RoleScope>, [string, string]>();

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: TEST_ENTITIES,
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([DataDestination, DestinationContext, Context]),
      ],
      providers: [
        DataDestinationIndexableSource,
        SearchIndexRepository,
        { provide: ContextAccessService, useValue: { getRoleScope } },
      ],
    }).compile();

    dataSource = module.get(getDataSourceToken());

    source = module.get(DataDestinationIndexableSource);
    indexRepo = module.get(SearchIndexRepository);
    destinationRepo = module.get(getRepositoryToken(DataDestination));
    contextRepo = module.get(getRepositoryToken(Context));
  }, 30_000);

  afterAll(async () => {
    await module.close();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM data_destination_search_index');
    await dataSource.query('DELETE FROM member_role_contexts');
    await dataSource.query('DELETE FROM destination_contexts');
    await dataSource.query('DELETE FROM destination_owners');
    await dataSource.query('DELETE FROM context');
    await dataSource.query('DELETE FROM data_destination');
    await dataSource.query('DELETE FROM data_destination_credentials');
  });

  beforeEach(() => {
    getRoleScope.mockReset();
    getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
  });

  async function seedDestination(
    overrides: Partial<DataDestination> = {},
    projectId = 'proj-1'
  ): Promise<DataDestination> {
    const dest = destinationRepo.create();
    dest.title = 'Test Destination';
    dest.type = DataDestinationType.GOOGLE_SHEETS;
    dest.projectId = projectId;
    dest.createdById = 'user-1';
    dest.availableForUse = true;
    dest.availableForMaintenance = false;
    Object.assign(dest, overrides);
    return destinationRepo.save(dest);
  }

  async function seedIndexRow(entityId: string, projectId = 'proj-1'): Promise<void> {
    await indexRepo.upsert(SearchableEntityType.DATA_DESTINATION, {
      entityId,
      projectId,
      isDraft: false,
      embedding: STUB_EMBEDDING,
      document: null,
      fieldCount: null,
      docHash: 'hash',
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
  }

  async function visibleIds(
    projectId: string,
    accessScope?: SourceAccessScope
  ): Promise<Set<string>> {
    const predicate = await source.accessPredicateProvider.build('idx', projectId, accessScope);
    const page = await indexRepo.searchCandidates(
      SearchableEntityType.DATA_DESTINATION,
      projectId,
      predicate,
      '',
      { candidateLimit: 1000 }
    );
    return new Set(page.rows.map(r => r.entityId));
  }

  describe('listSearchablePage projection', () => {
    it('projects title and type label for Google Sheets destination', async () => {
      const dest = await seedDestination({
        title: 'My Sheets',
        type: DataDestinationType.GOOGLE_SHEETS,
      });

      const page = await source.listSearchablePage('proj-1', null, 100);
      expect(page.descriptors).toHaveLength(1);
      const [descriptor] = page.descriptors;

      expect(descriptor.entityType).toBe(SearchableEntityType.DATA_DESTINATION);
      expect(descriptor.entityId).toBe(dest.id);
      expect(descriptor.title).toBe('My Sheets');
      expect(descriptor.description).toBeNull();
      expect(descriptor.fieldCount).toBe(0);
      expect(descriptor.extendability).toBe(0);

      expect(descriptor.richTextSlots).toEqual([
        { kind: 'title', text: 'My Sheets' },
        { kind: 'context', text: toHumanReadable(DataDestinationType.GOOGLE_SHEETS) },
      ]);
      expect(descriptor.atomicTokenSlots).toEqual([]);
    });

    it('omits linked context name and description from richTextSlots', async () => {
      const dest = await seedDestination({ title: 'Sheets With Context' });

      const ctx = contextRepo.create();
      ctx.name = 'Marketing';
      ctx.description = 'Marketing team data';
      ctx.projectId = 'proj-1';
      const savedCtx = await contextRepo.save(ctx);

      await dataSource.query(
        'INSERT INTO destination_contexts (destination_id, context_id) VALUES (?, ?)',
        [dest.id, savedCtx.id]
      );

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;

      expect(descriptor.richTextSlots).toEqual([
        { kind: 'title', text: 'Sheets With Context' },
        { kind: 'context', text: toHumanReadable(DataDestinationType.GOOGLE_SHEETS) },
      ]);
    });

    it('emits Google Sheets identity email into atomicTokenSlots', async () => {
      const dest = await seedDestination({
        title: 'Sheets With Email',
        type: DataDestinationType.GOOGLE_SHEETS,
      });

      const cred = dataSource.getRepository(DataDestinationCredential).create();
      cred.projectId = 'proj-1';
      cred.type = 'google-oauth' as never;
      cred.credentials = {} as never;
      cred.identity = { email: 'sheets@example.com' };
      const savedCred = await dataSource.getRepository(DataDestinationCredential).save(cred);

      await dataSource.query('UPDATE data_destination SET credentialId = ? WHERE id = ?', [
        savedCred.id,
        dest.id,
      ]);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;

      expect(descriptor.atomicTokenSlots).toEqual([{ kind: 'field', text: 'sheets@example.com' }]);
    });

    it('emits SA clientEmail when present on credential identity', async () => {
      const dest = await seedDestination({
        title: 'SA Sheets',
        type: DataDestinationType.GOOGLE_SHEETS,
      });

      const cred = dataSource.getRepository(DataDestinationCredential).create();
      cred.projectId = 'proj-1';
      cred.type = 'google-service-account' as never;
      cred.credentials = {} as never;
      cred.identity = { clientEmail: 'sa@proj.iam.gserviceaccount.com' };
      const savedCred = await dataSource.getRepository(DataDestinationCredential).save(cred);

      await dataSource.query('UPDATE data_destination SET credentialId = ? WHERE id = ?', [
        savedCred.id,
        dest.id,
      ]);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;

      expect(descriptor.atomicTokenSlots).toContainEqual({
        kind: 'field',
        text: 'sa@proj.iam.gserviceaccount.com',
      });
    });

    it('emits to[] recipients for email-based destination (EMAIL type)', async () => {
      const dest = await seedDestination({
        title: 'Email Report',
        type: DataDestinationType.EMAIL,
      });

      const cred = dataSource.getRepository(DataDestinationCredential).create();
      cred.projectId = 'proj-1';
      cred.type = 'email' as never;
      cred.credentials = {
        type: 'email-credentials',
        to: ['alice@example.com', 'bob@example.com'],
      } as never;
      const savedCred = await dataSource.getRepository(DataDestinationCredential).save(cred);

      await dataSource.query('UPDATE data_destination SET credentialId = ? WHERE id = ?', [
        savedCred.id,
        dest.id,
      ]);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;

      expect(descriptor.atomicTokenSlots).toEqual([
        { kind: 'field', text: 'alice@example.com' },
        { kind: 'field', text: 'bob@example.com' },
      ]);
    });

    it('emits to[] recipients for SLACK destination', async () => {
      const dest = await seedDestination({
        title: 'Slack Report',
        type: DataDestinationType.SLACK,
      });

      const cred = dataSource.getRepository(DataDestinationCredential).create();
      cred.projectId = 'proj-1';
      cred.type = 'slack' as never;
      cred.credentials = { type: 'email-credentials', to: ['channel@slack.com'] } as never;
      const savedCred = await dataSource.getRepository(DataDestinationCredential).save(cred);

      await dataSource.query('UPDATE data_destination SET credentialId = ? WHERE id = ?', [
        savedCred.id,
        dest.id,
      ]);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;

      expect(descriptor.atomicTokenSlots).toEqual([{ kind: 'field', text: 'channel@slack.com' }]);
    });

    it('emits no email for Looker Studio destination', async () => {
      await seedDestination({
        title: 'Looker Report',
        type: DataDestinationType.LOOKER_STUDIO,
      });

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;

      expect(descriptor.atomicTokenSlots).toEqual([]);
    });

    it('embeddingText excludes linked context name and content', async () => {
      const dest = await seedDestination({
        title: 'Marketing Sheets',
        type: DataDestinationType.GOOGLE_SHEETS,
      });

      const ctx = contextRepo.create();
      ctx.name = 'Marketing Team';
      ctx.description = 'Marketing campaigns data';
      ctx.projectId = 'proj-1';
      const savedCtx = await contextRepo.save(ctx);

      await dataSource.query(
        'INSERT INTO destination_contexts (destination_id, context_id) VALUES (?, ?)',
        [dest.id, savedCtx.id]
      );

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;
      const expected = [
        'Marketing Sheets',
        toHumanReadable(DataDestinationType.GOOGLE_SHEETS),
      ].join('\n');
      expect(descriptor.embeddingText).toBe(expected);
    });

    it('embeddingText includes emails for email-based destination', async () => {
      const dest = await seedDestination({
        title: 'Email Report',
        type: DataDestinationType.EMAIL,
      });

      const cred = dataSource.getRepository(DataDestinationCredential).create();
      cred.projectId = 'proj-1';
      cred.type = 'email' as never;
      cred.credentials = {
        type: 'email-credentials',
        to: ['alice@example.com', 'bob@example.com'],
      } as never;
      const savedCred = await dataSource.getRepository(DataDestinationCredential).save(cred);

      await dataSource.query('UPDATE data_destination SET credentialId = ? WHERE id = ?', [
        savedCred.id,
        dest.id,
      ]);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;
      expect(descriptor.embeddingText).toContain('alice@example.com');
      expect(descriptor.embeddingText).toContain('bob@example.com');
    });

    it('embeddingText excludes context with name only', async () => {
      const dest = await seedDestination({ title: 'Name Only Context Dest' });

      const ctx = contextRepo.create();
      ctx.name = 'Ops';
      ctx.description = '';
      ctx.projectId = 'proj-1';
      const savedCtx = await contextRepo.save(ctx);

      await dataSource.query(
        'INSERT INTO destination_contexts (destination_id, context_id) VALUES (?, ?)',
        [dest.id, savedCtx.id]
      );

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;
      expect(descriptor.embeddingText).not.toContain('Ops');
    });

    it('omits deleted destinations', async () => {
      const active = await seedDestination({ title: 'Active' });
      const toDelete = await seedDestination({ title: 'Deleted' });
      await destinationRepo.softDelete(toDelete.id);

      const page = await source.listSearchablePage('proj-1', null, 100);
      expect(page.descriptors).toHaveLength(1);
      expect(page.descriptors[0].entityId).toBe(active.id);
    });

    it('filters by projectId when provided', async () => {
      const inProject = await seedDestination({ title: 'In Project' }, 'proj-1');
      await seedDestination({ title: 'Other Project' }, 'proj-2');

      const page = await source.listSearchablePage('proj-1', null, 100);
      expect(page.descriptors).toHaveLength(1);
      expect(page.descriptors[0].entityId).toBe(inProject.id);
    });
  });

  describe('listSearchablePage', () => {
    it('returns descriptors for a page of destinations', async () => {
      await seedDestination({ title: 'D1' });
      await seedDestination({ title: 'D2' });

      const page = await source.listSearchablePage('proj-1', null, 10);
      expect(page.descriptors).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('paginates using cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await seedDestination({ title: `Dest ${i}` });
      }

      const collected: string[] = [];
      let cursor: PageCursor | null = null;
      do {
        const page = await source.listSearchablePage('proj-1', cursor, 2);
        for (const d of page.descriptors) collected.push(d.entityId);
        cursor = page.nextCursor;
      } while (cursor !== null);

      expect(collected).toHaveLength(5);
      expect(new Set(collected).size).toBe(5);
    });

    it('excludes soft-deleted destinations', async () => {
      const live = await seedDestination({ title: 'Live' });
      const dead = await seedDestination({ title: 'Dead' });
      await destinationRepo.softDelete(dead.id);

      const page = await source.listSearchablePage('proj-1', null, 10);
      const ids = page.descriptors.map(d => d.entityId);
      expect(ids).toContain(live.id);
      expect(ids).not.toContain(dead.id);
    });

    it('handles same-second createdAt tie-breaker by id', async () => {
      const now = new Date('2024-06-01T12:00:00.000Z');
      const d1 = await seedDestination({ title: 'First' });
      const d2 = await seedDestination({ title: 'Second' });
      await dataSource.query('UPDATE data_destination SET createdAt = ? WHERE id IN (?, ?)', [
        toCursorTimestamp(now),
        d1.id,
        d2.id,
      ]);

      const first = await source.listSearchablePage('proj-1', null, 1);
      expect(first.descriptors).toHaveLength(1);
      expect(first.nextCursor).not.toBeNull();

      const second = await source.listSearchablePage('proj-1', first.nextCursor, 1);
      const allIds = [first.descriptors[0].entityId, second.descriptors[0].entityId];
      expect(new Set(allIds)).toEqual(new Set([d1.id, d2.id]));
    });
  });

  describe('listProjectIds', () => {
    it('returns distinct project ids with non-deleted destinations', async () => {
      await seedDestination({ title: 'A' }, 'proj-1');
      await seedDestination({ title: 'B' }, 'proj-2');
      await seedDestination({ title: 'C' }, 'proj-1');

      const ids = await source.listProjectIds();
      expect(ids.sort()).toEqual(['proj-1', 'proj-2']);
    });

    it('excludes soft-deleted destinations', async () => {
      const deleted = await seedDestination({ title: 'Dead' }, 'proj-deleted');
      await destinationRepo.softDelete(deleted.id);

      const ids = await source.listProjectIds();
      expect(ids).not.toContain('proj-deleted');
    });
  });

  describe('source metadata', () => {
    it('exposes the DATA_DESTINATION entity type', () => {
      expect(source.entityType).toBe(SearchableEntityType.DATA_DESTINATION);
    });
  });

  describeLoadSearchableOneContract(
    () => source,
    async () => {
      const live = await seedDestination({ title: 'Contract Live' });
      const deleted = await seedDestination({ title: 'Contract Deleted' });
      await destinationRepo.softDelete(deleted.id);
      return { liveId: live.id, deletedId: deleted.id };
    },
    SearchableEntityType.DATA_DESTINATION
  );

  describe('access predicate parity', () => {
    it('returns only non-deleted rows without accessScope', async () => {
      const active = await seedDestination({ title: 'Active' });
      const deleted = await seedDestination({ title: 'Deleted' });
      await destinationRepo.softDelete(deleted.id);

      await seedIndexRow(active.id);
      await seedIndexRow(deleted.id);

      const visible = await visibleIds('proj-1');
      expect(visible).toEqual(new Set([active.id]));
    });

    it('user without ownership sees shared destination (availableForUse)', async () => {
      const shared = await seedDestination({
        title: 'Shared For Use',
        availableForUse: true,
        availableForMaintenance: false,
      });

      await seedIndexRow(shared.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const visible = await visibleIds('proj-1', { userId: 'user-1', roles: ['viewer'] });
      expect(visible).toEqual(new Set([shared.id]));
    });

    it('user without ownership sees maintenance-shared destination', async () => {
      const maint = await seedDestination({
        title: 'Maintenance Shared',
        availableForUse: false,
        availableForMaintenance: true,
      });

      await seedIndexRow(maint.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const visible = await visibleIds('proj-1', { userId: 'user-1', roles: ['viewer'] });
      expect(visible).toEqual(new Set([maint.id]));
    });

    it('user sees private destination they own', async () => {
      const owned = await seedDestination({
        title: 'Private Owned',
        availableForUse: false,
        availableForMaintenance: false,
      });

      await dataSource.query(
        'INSERT INTO destination_owners (destination_id, user_id) VALUES (?, ?)',
        [owned.id, 'owner-1']
      );

      await seedIndexRow(owned.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const visible = await visibleIds('proj-1', { userId: 'owner-1', roles: ['viewer'] });
      expect(visible).toEqual(new Set([owned.id]));
    });

    it('user does not see private destination they do not own', async () => {
      const priv = await seedDestination({
        title: 'Private Not Owned',
        availableForUse: false,
        availableForMaintenance: false,
      });

      await seedIndexRow(priv.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const visible = await visibleIds('proj-1', { userId: 'outsider', roles: ['viewer'] });
      expect(visible.size).toBe(0);
    });

    it('admin sees all destinations and bypasses roleScope resolution', async () => {
      const priv = await seedDestination({
        title: 'Private',
        availableForUse: false,
        availableForMaintenance: false,
      });

      await seedIndexRow(priv.id);

      const visible = await visibleIds('proj-1', {
        userId: 'admin-user',
        roles: ['admin'],
      });
      expect(visible).toEqual(new Set([priv.id]));
      expect(getRoleScope).not.toHaveBeenCalled();
    });

    it('editor and viewer see shared destination equally — no role branch', async () => {
      const shared = await seedDestination({
        title: 'Shared Equal',
        availableForUse: true,
        availableForMaintenance: false,
      });

      await seedIndexRow(shared.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const asViewer = await visibleIds('proj-1', { userId: 'u1', roles: ['viewer'] });
      const asEditor = await visibleIds('proj-1', { userId: 'u2', roles: ['editor'] });
      expect(asViewer).toEqual(new Set([shared.id]));
      expect(asEditor).toEqual(new Set([shared.id]));
    });

    describe('SELECTED_CONTEXTS role scope', () => {
      beforeEach(() => {
        getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
      });

      it('shows shared destination to user with overlapping context', async () => {
        const dest = await seedDestination({
          title: 'Context Gated',
          availableForUse: true,
          availableForMaintenance: false,
        });

        const ctx = contextRepo.create();
        ctx.name = 'Sales';
        ctx.projectId = 'proj-1';
        const savedCtx = await contextRepo.save(ctx);

        await dataSource.query(
          'INSERT INTO destination_contexts (destination_id, context_id) VALUES (?, ?)',
          [dest.id, savedCtx.id]
        );
        await dataSource.query(
          'INSERT INTO member_role_contexts (user_id, project_id, context_id) VALUES (?, ?, ?)',
          ['scoped-user', 'proj-1', savedCtx.id]
        );

        await seedIndexRow(dest.id);

        const visible = await visibleIds('proj-1', {
          userId: 'scoped-user',
          roles: ['viewer'],
        });
        expect(visible).toEqual(new Set([dest.id]));
      });

      it('hides shared destination when user has no overlapping context', async () => {
        const dest = await seedDestination({
          title: 'Context Gated No Overlap',
          availableForUse: true,
          availableForMaintenance: false,
        });

        const ctx = contextRepo.create();
        ctx.name = 'Sales';
        ctx.projectId = 'proj-1';
        const savedCtx = await contextRepo.save(ctx);

        await dataSource.query(
          'INSERT INTO destination_contexts (destination_id, context_id) VALUES (?, ?)',
          [dest.id, savedCtx.id]
        );

        await seedIndexRow(dest.id);

        const visible = await visibleIds('proj-1', {
          userId: 'scoped-user',
          roles: ['viewer'],
        });
        expect(visible.size).toBe(0);
      });

      it('user with SELECTED_CONTEXTS sees owned private destination regardless of context', async () => {
        const owned = await seedDestination({
          title: 'Owned Private',
          availableForUse: false,
          availableForMaintenance: false,
        });

        await dataSource.query(
          'INSERT INTO destination_owners (destination_id, user_id) VALUES (?, ?)',
          [owned.id, 'scoped-user']
        );

        await seedIndexRow(owned.id);

        const visible = await visibleIds('proj-1', {
          userId: 'scoped-user',
          roles: ['viewer'],
        });
        expect(visible).toEqual(new Set([owned.id]));
      });
    });
  });
});
