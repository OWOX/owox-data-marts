import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DataDestination } from '../entities/data-destination.entity';
import { DataDestinationCredential } from '../entities/data-destination-credential.entity';
import { DestinationOwner } from '../entities/destination-owner.entity';
import { DestinationContext } from '../entities/destination-context.entity';
import { Context } from '../entities/context.entity';
import { MemberRoleContext } from '../entities/member-role-context.entity';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { RoleScope } from '../enums/role-scope.enum';
import {
  applyDataDestinationVisibilityFilter,
  DataDestinationVisibilityFilterOptions,
} from './apply-data-destination-visibility-filter';

const TEST_ENTITIES = [
  DataDestination,
  DataDestinationCredential,
  DestinationOwner,
  DestinationContext,
  Context,
  MemberRoleContext,
];

describe('applyDataDestinationVisibilityFilter', () => {
  let dataSource: DataSource;
  let destinationRepo: Repository<DataDestination>;
  let contextRepo: Repository<Context>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: TEST_ENTITIES,
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([DataDestination, Context]),
      ],
    }).compile();

    dataSource = module.get(getDataSourceToken());
    destinationRepo = module.get(getRepositoryToken(DataDestination));
    contextRepo = module.get(getRepositoryToken(Context));
  }, 30_000);

  afterAll(async () => {
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM member_role_contexts');
    await dataSource.query('DELETE FROM destination_owners');
    await dataSource.query('DELETE FROM destination_contexts');
    await dataSource.query('DELETE FROM data_destination');
    await dataSource.query('DELETE FROM context');
  });

  async function seedDestination(
    overrides: Partial<DataDestination> = {},
    projectId = 'proj-1'
  ): Promise<DataDestination> {
    const d = destinationRepo.create();
    d.type = DataDestinationType.GOOGLE_SHEETS;
    d.title = 'Test Destination';
    d.projectId = projectId;
    d.createdById = 'creator';
    Object.assign(d, overrides);
    return destinationRepo.save(d);
  }

  async function seedContext(name: string, projectId = 'proj-1'): Promise<Context> {
    const ctx = contextRepo.create();
    ctx.name = name;
    ctx.projectId = projectId;
    return contextRepo.save(ctx);
  }

  function query(opts: DataDestinationVisibilityFilterOptions): Promise<DataDestination[]> {
    let qb = destinationRepo
      .createQueryBuilder('d')
      .where('d.projectId = :projectId', { projectId: opts.projectId })
      .andWhere('d.deletedAt IS NULL');
    qb = applyDataDestinationVisibilityFilter(qb, opts);
    return qb.getMany();
  }

  it('admin sees all destinations regardless of sharing flags', async () => {
    await seedDestination({ availableForUse: false, availableForMaintenance: false });
    const results = await query({
      destinationAlias: 'd',
      projectId: 'proj-1',
      userId: 'admin-user',
      roles: ['admin'],
    });
    expect(results).toHaveLength(1);
  });

  it('no userId returns all destinations (system call path)', async () => {
    await seedDestination({ availableForUse: false, availableForMaintenance: false });
    const results = await query({
      destinationAlias: 'd',
      projectId: 'proj-1',
    });
    expect(results).toHaveLength(1);
  });

  describe('non-admin (no role branch for destinations)', () => {
    it('viewer sees an owned destination', async () => {
      const d = await seedDestination({ availableForUse: false, availableForMaintenance: false });
      await dataSource.query(
        'INSERT INTO destination_owners (destination_id, user_id) VALUES (?, ?)',
        [d.id, 'user-1']
      );

      const results = await query({
        destinationAlias: 'd',
        projectId: 'proj-1',
        userId: 'user-1',
        roles: ['viewer'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(1);
    });

    it('editor sees an owned destination', async () => {
      const d = await seedDestination({ availableForUse: false, availableForMaintenance: false });
      await dataSource.query(
        'INSERT INTO destination_owners (destination_id, user_id) VALUES (?, ?)',
        [d.id, 'editor-1']
      );

      const results = await query({
        destinationAlias: 'd',
        projectId: 'proj-1',
        userId: 'editor-1',
        roles: ['editor'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(1);
    });

    it('viewer sees availableForUse destination they do not own (ENTIRE_PROJECT scope)', async () => {
      await seedDestination({ availableForUse: true, availableForMaintenance: false });
      const results = await query({
        destinationAlias: 'd',
        projectId: 'proj-1',
        userId: 'user-1',
        roles: ['viewer'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(1);
    });

    it('editor sees availableForMaintenance destination (ENTIRE_PROJECT scope)', async () => {
      await seedDestination({ availableForUse: false, availableForMaintenance: true });
      const results = await query({
        destinationAlias: 'd',
        projectId: 'proj-1',
        userId: 'editor-1',
        roles: ['editor'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(1);
    });

    it('non-owner non-shared destination is hidden from both viewer and editor', async () => {
      await seedDestination({ availableForUse: false, availableForMaintenance: false });

      const viewerResults = await query({
        destinationAlias: 'd',
        projectId: 'proj-1',
        userId: 'outsider',
        roles: ['viewer'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(viewerResults).toHaveLength(0);

      const editorResults = await query({
        destinationAlias: 'd',
        projectId: 'proj-1',
        userId: 'outsider',
        roles: ['editor'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(editorResults).toHaveLength(0);
    });

    it('SELECTED_CONTEXTS scope gates shared destination by context overlap', async () => {
      const d = await seedDestination({ availableForUse: true, availableForMaintenance: false });
      const ctx = await seedContext('billing');

      await dataSource.query(
        'INSERT INTO destination_contexts (destination_id, context_id) VALUES (?, ?)',
        [d.id, ctx.id]
      );
      await dataSource.query(
        'INSERT INTO member_role_contexts (user_id, project_id, context_id) VALUES (?, ?, ?)',
        ['scoped-user', 'proj-1', ctx.id]
      );

      const withOverlap = await query({
        destinationAlias: 'd',
        projectId: 'proj-1',
        userId: 'scoped-user',
        roles: ['viewer'],
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      expect(withOverlap).toHaveLength(1);

      const withoutOverlap = await query({
        destinationAlias: 'd',
        projectId: 'proj-1',
        userId: 'outsider',
        roles: ['viewer'],
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      expect(withoutOverlap).toHaveLength(0);
    });
  });
});
