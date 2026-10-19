jest.mock('../../services/data-mart.service', () => ({ DataMartService: jest.fn() }));
import { ContextReferenceGuard } from '../../entities/context-reference-guard.entity';
jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));
import { DataSource, EntitySchema } from 'typeorm';
import { ReadContextSetupService } from './read-context-setup.service';
import { ContextSetupMapper } from '../../mappers/context-setup.mapper';
import type { ContextSetupActor } from '../../dto/domain/mcp-context-setup.dto';
import { RoleScope } from '../../enums/role-scope.enum';
import { OwnerStatus } from '../../services/access-decision/access-decision.types';

const contextSchema = new EntitySchema({
  name: 'A2Context',
  columns: {
    id: { type: String, primary: true },
    projectId: { type: String },
    name: { type: String },
    description: { type: String, nullable: true },
    deletedAt: { type: Date, nullable: true, deleteDate: true },
  },
});
const kinds = ['DataMart', 'Storage', 'Destination', 'Credential'];
const resourceSchemas = kinds.map(
  kind =>
    new EntitySchema<Record<string, unknown>>({
      name: `A2${kind}`,
      columns: {
        id: { type: String, primary: true },
        projectId: { type: String },
        title: { type: String },
        secret: { type: String, nullable: true },
        deletedAt: { type: Date, nullable: true, deleteDate: true },
      },
      relations: {
        contexts: { type: 'one-to-many', target: `A2${kind}Context`, inverseSide: 'resource' },
      },
    })
);
const idColumns = ['dataMartId', 'storageId', 'destinationId', 'credentialId'];
const bindingSchemas = kinds.map(
  (kind, index) =>
    new EntitySchema({
      name: `A2${kind}Context`,
      columns: {
        [idColumns[index]]: { type: String, primary: true },
        contextId: { type: String, primary: true },
      },
      relations: {
        resource: {
          type: 'many-to-one',
          target: `A2${kind}`,
          joinColumn: { name: idColumns[index] },
        },
        context: { type: 'many-to-one', target: 'A2Context', joinColumn: { name: 'contextId' } },
      },
    })
);
const memberSchema = new EntitySchema({
  name: 'A2MemberContext',
  columns: {
    userId: { type: String, primary: true },
    projectId: { type: String, primary: true },
    contextId: { type: String, primary: true },
  },
});
const defaultsSchema = new EntitySchema({
  name: 'A2DefaultsContext',
  columns: {
    projectId: { type: String, primary: true },
    contextId: { type: String, primary: true },
  },
});
const actor: ContextSetupActor = { projectId: 'project', userId: 'admin', roles: ['admin'] };

describe('Context setup SQL projection and isolation', () => {
  let db: DataSource;
  let service: ReadContextSetupService;
  beforeAll(async () => {
    db = await new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [
        ContextReferenceGuard,
        contextSchema,
        ...resourceSchemas,
        ...bindingSchemas,
        memberSchema,
        defaultsSchema,
      ],
      synchronize: true,
    }).initialize();
    const resources = resourceSchemas.map(schema => db.getRepository(schema));
    const bindings = bindingSchemas.map(schema => db.getRepository(schema));
    service = new ReadContextSetupService(
      db.getRepository(contextSchema) as never,
      ...(resources as [never, never, never, never]),
      ...(bindings as [never, never, never, never]),
      db.getRepository(memberSchema) as never,
      db.getRepository(defaultsSchema) as never,
      {
        getProjectMembersOrThrow: jest
          .fn()
          .mockResolvedValue([{ userId: 'member', role: 'editor' }]),
      } as never,
      {
        getReadOnlyMemberScope: jest
          .fn()
          .mockResolvedValue({ roleScope: RoleScope.SELECTED_CONTEXTS, contextIds: ['context'] }),
      } as never,
      {
        getDefaultSettings: jest
          .fn()
          .mockResolvedValue({ roleScope: RoleScope.ENTIRE_PROJECT, contextIds: [] }),
      } as never,
      {
        canAccessStored: jest.fn().mockResolvedValue(true),
        getOwnerStatus: jest.fn().mockResolvedValue(OwnerStatus.OWNER),
      } as never,
      new ContextSetupMapper()
    );
    await db.getRepository(contextSchema).save([
      { id: 'context', projectId: 'project', name: 'Marketing' },
      { id: 'foreign-context', projectId: 'foreign', name: 'Foreign' },
      { id: 'deleted-context', projectId: 'project', name: 'Deleted', deletedAt: new Date() },
    ]);
    for (let index = 0; index < resources.length; index++) {
      await resources[index].save([
        { id: 'attached', projectId: 'project', title: 'Attached', secret: 'must never appear' },
        {
          id: 'unassigned',
          projectId: 'project',
          title: 'Unassigned',
          secret: 'must never appear',
        },
        { id: 'foreign', projectId: 'foreign', title: 'Foreign' },
        { id: 'deleted', projectId: 'project', title: 'Deleted', deletedAt: new Date() },
      ]);
      await bindings[index].save([
        { [idColumns[index]]: 'attached', contextId: 'context' },
        { [idColumns[index]]: 'attached', contextId: 'foreign-context' },
        { [idColumns[index]]: 'attached', contextId: 'deleted-context' },
      ]);
    }
  });
  afterAll(async () => {
    await db?.destroy();
  });

  it('returns all four entity types including unassigned, without foreign/deleted rows or secrets', async () => {
    const result = await service.listResources(actor, { limit: 100, offset: 0 });
    expect(result).toHaveLength(8);
    expect(new Set(result.map(row => row.type))).toEqual(
      new Set(['DATA_MART', 'STORAGE', 'DESTINATION', 'CREDENTIAL'])
    );
    for (const row of result) {
      expect(row.contextIds).toEqual(row.id === 'attached' ? ['context'] : []);
      expect(['attached', 'unassigned']).toContain(row.id);
    }
    expect(JSON.stringify(result)).not.toMatch(/secret|foreign-context|deleted-context/);
  });

  it('resolves attachment selection and rejects Contexts from another project', async () => {
    const result = await service.listResources(actor, {
      contextId: 'context',
      type: 'CREDENTIAL',
      limit: 10,
      offset: 0,
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('CREDENTIAL');
    await expect(service.getContext(actor, 'foreign-context')).rejects.toThrow('Context not found');
  });

  it('reports complete persisted impact across every attachment type without changing rows', async () => {
    await db
      .getRepository(memberSchema)
      .save({ projectId: 'project', userId: 'member', contextId: 'context' });
    await db.getRepository(defaultsSchema).save({ projectId: 'project', contextId: 'context' });
    const impact = await service.getImpact(actor, 'context');
    expect(Object.values(impact.blockers)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(impact.affectedMemberIds).toEqual(['member']);
    expect(impact.detached).toBe(false);
    expect(await db.getRepository(memberSchema).count()).toBe(1);
    expect(await db.getRepository(defaultsSchema).count()).toBe(1);
  });
});
