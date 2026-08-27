jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

jest.mock('../services/user-projections-fetcher.service', () => ({
  UserProjectionsFetcherService: jest.fn(),
}));

jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UpdateDataMartRelationshipService } from './update-data-mart-relationship.service';
import { UpdateRelationshipCommand } from '../dto/domain/update-relationship.command';
import { EntityType, Action } from '../services/access-decision';

describe('UpdateDataMartRelationshipService', () => {
  const relationship = {
    id: 'rel-1',
    sourceDataMart: { id: 'dm-source', schema: [] },
    targetDataMart: { id: 'dm-target', schema: [] },
    targetAlias: 'old-alias',
    createdById: 'user-1',
  };

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  /**
   * `rowAtWriteTime`, when given, is the Data Mart as it stands when the cascade writes — i.e. a
   * concurrent save landed after this request loaded the row. Leaving it out means nothing else
   * wrote, and the write-time read serves the same row `findById` did.
   */
  const createService = (canAccess = true, sourceDm: unknown = null, rowAtWriteTime?: unknown) => {
    const relationshipService = {
      findById: jest.fn().mockResolvedValue(relationship),
      validateUniqueAlias: jest.fn().mockResolvedValue(undefined),
      validateJoinFieldTypes: jest.fn(),
      update: jest.fn().mockResolvedValue({ ...relationship, targetAlias: 'new-alias' }),
    };
    // Whatever actually reached the database, however it got there — so a test asserts the
    // persisted result rather than the shape of the call that produced it.
    const persisted: { row?: Record<string, unknown> } = {};
    const dataMartService = {
      findById: jest.fn().mockResolvedValue(sourceDm),
      save: jest.fn().mockImplementation(async (dm: Record<string, unknown>) => {
        persisted.row = dm;
        return dm;
      }),
      rewriteSchemaPaths: jest
        .fn()
        .mockImplementation(
          async (_id: string, rewrite: (dm: Record<string, unknown>) => boolean) => {
            const row = clone(rowAtWriteTime ?? sourceDm) as Record<string, unknown> | null;
            if (!row || !rewrite(row)) return false;
            persisted.row = row;
            return true;
          }
        ),
      getByIdAndProjectId: jest.fn().mockResolvedValue({ id: 'dm-source' }),
    };
    const userProjectionsFetcherService = {
      fetchCreatedByUser: jest.fn().mockResolvedValue(null),
    };
    const reportDataCacheService = {
      invalidateByDataMartId: jest.fn().mockResolvedValue(undefined),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'rel-1' }),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(canAccess),
    };

    const service = new UpdateDataMartRelationshipService(
      relationshipService as never,
      dataMartService as never,
      userProjectionsFetcherService as never,
      reportDataCacheService as never,
      mapper as never,
      accessDecisionService as never
    );

    return { service, relationshipService, dataMartService, accessDecisionService, persisted };
  };

  beforeEach(() => jest.clearAllMocks());

  it('should update relationship when user has EDIT access on source DataMart', async () => {
    const { service, accessDecisionService } = createService(true);

    const command = new UpdateRelationshipCommand(
      'rel-1',
      'dm-source',
      'proj-1',
      'user-1',
      ['editor'],
      'new-alias',
      undefined
    );

    await service.run(command);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      'dm-source',
      Action.EDIT,
      'proj-1'
    );
  });

  it('should throw ForbiddenException when user lacks EDIT on source DataMart', async () => {
    const { service } = createService(false);

    const command = new UpdateRelationshipCommand(
      'rel-1',
      'dm-source',
      'proj-1',
      'user-1',
      ['viewer'],
      'new-alias',
      undefined
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should throw NotFoundException when relationship not found', async () => {
    const { service, relationshipService } = createService(true);
    relationshipService.findById = jest.fn().mockResolvedValue(null);

    const command = new UpdateRelationshipCommand('rel-1', 'dm-source', 'proj-1', 'user-1', []);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when source data mart is not in the caller project', async () => {
    const { service, dataMartService, relationshipService, accessDecisionService } =
      createService(true);
    dataMartService.getByIdAndProjectId.mockRejectedValueOnce(
      new NotFoundException('DataMart not found')
    );

    const command = new UpdateRelationshipCommand('rel-1', 'dm-source', 'other-proj', 'user-1', [
      'editor',
    ]);

    await expect(service.run(command)).rejects.toThrow(NotFoundException);
    expect(relationshipService.findById).not.toHaveBeenCalled();
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when userId is empty', async () => {
    const { service, accessDecisionService, relationshipService, dataMartService } =
      createService(true);

    const command = new UpdateRelationshipCommand('rel-1', 'dm-source', 'proj-1', '', []);

    await expect(service.run(command)).rejects.toThrow(UnauthorizedException);
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(relationshipService.findById).not.toHaveBeenCalled();
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  // A formula's `path` is the same structural alias a blended-fields config carries, so the rename
  // has to reach both or a working metric silently becomes a broken one.
  describe('cascadeAliasRename — stored formulas', () => {
    const renameCommand = () =>
      new UpdateRelationshipCommand(
        'rel-1',
        'dm-source',
        'proj-1',
        'user-1',
        ['editor'],
        'new-alias',
        undefined
      );

    const dmWith = (fields: Array<Record<string, unknown>>, blendedFieldsConfig?: unknown) => ({
      id: 'dm-source',
      schema: { type: 'bigquery-data-mart-schema', fields },
      blendedFieldsConfig,
    });

    const metric = (formula: string) => ({
      name: 'roi',
      type: 'FLOAT',
      calculated: { formula, level: 'metric' },
    });

    const formulaOf = (
      persisted: { row?: Record<string, unknown> },
      name = 'roi'
    ): string | undefined => {
      const fields = (
        persisted.row?.schema as { fields?: Array<Record<string, never>> } | undefined
      )?.fields;
      const field = fields?.find((f: { name?: string }) => f.name === name) as
        | { calculated?: { formula?: string } }
        | undefined;
      return field?.calculated?.formula;
    };

    it('rewrites the renamed alias inside a formula', async () => {
      const sourceDm = dmWith([
        { name: 'cost', type: 'FLOAT' },
        metric('SUM({{ref field="cost"}}) * SUM({{ref path="old-alias" field="amount"}})'),
      ]);
      const { service, persisted } = createService(true, sourceDm);

      await service.run(renameCommand());

      expect(formulaOf(persisted)).toBe(
        'SUM({{ref field="cost"}}) * SUM({{ref path="new-alias" field="amount"}})'
      );
    });

    it('rewrites only the FIRST segment of a nested path', async () => {
      const sourceDm = dmWith([metric('SUM({{ref path="old-alias.items" field="qty"}})')]);
      const { service, persisted } = createService(true, sourceDm);

      await service.run(renameCommand());

      expect(formulaOf(persisted)).toBe('SUM({{ref path="new-alias.items" field="qty"}})');
    });

    // The inherited grandparent gap, asserted rather than fixed: this cascade only ever visits the
    // relationship's own SOURCE Data Mart, where the renamed alias is the first segment. A Data Mart
    // that reaches the same relationship one level deeper is never visited, so its formula is left
    // pointing at a path that no longer resolves — broken with a reason, which
    // `calculatedFieldIssues` then reports.
    it('leaves a path whose renamed alias is NOT the first segment untouched', async () => {
      const sourceDm = dmWith([metric('SUM({{ref path="parent.old-alias" field="amount"}})')]);
      const { service, persisted } = createService(true, sourceDm);

      await service.run(renameCommand());

      expect(persisted.row).toBeUndefined();
    });

    it('leaves an own-Data-Mart reference untouched', async () => {
      const sourceDm = dmWith([metric('SUM({{ref field="cost"}})')]);
      const { service, persisted } = createService(true, sourceDm);

      await service.run(renameCommand());

      expect(persisted.row).toBeUndefined();
    });

    it('still cascades the blended-fields config when the schema has no formula', async () => {
      const sourceDm = dmWith([{ name: 'cost', type: 'FLOAT' }], {
        sources: [{ path: 'old-alias', isExcluded: false }],
      });
      const { service, persisted } = createService(true, sourceDm);

      await service.run(renameCommand());

      expect(persisted.row?.blendedFieldsConfig).toEqual({
        sources: [{ path: 'new-alias', isExcluded: false }],
      });
    });

    // An unparseable formula is already broken; refusing the rename over it would leave no way to
    // repair either one.
    it('does not block the rename on a formula it cannot parse', async () => {
      const sourceDm = dmWith([metric('SUM({{ref field="cost"}}) + {{')], {
        sources: [{ path: 'old-alias', isExcluded: false }],
      });
      const { service, persisted } = createService(true, sourceDm);

      await expect(service.run(renameCommand())).resolves.toBeDefined();
      expect(persisted.row?.blendedFieldsConfig).toEqual({
        sources: [{ path: 'new-alias', isExcluded: false }],
      });
    });

    /**
     * The interleaving this forces (H6): an analyst's schema save commits AFTER this request has
     * loaded the Data Mart and BEFORE the cascade writes — the gap the cascade used to span with a
     * request-scoped read. `findById` therefore serves the pre-save row (no `margin`) while the
     * write-time read serves the post-save one, and the rename must land on the latter.
     *
     * A regression that reverts to renaming whatever the request loaded earlier makes this go red
     * on `margin` being absent from what was persisted — the analyst's SQL, silently discarded.
     */
    it('renames on the row as it stands at write time, not the one loaded earlier', async () => {
      const rowWhenRequestStarted = dmWith([
        metric('SUM({{ref path="old-alias" field="amount"}})'),
      ]);
      const rowAfterTheAnalystSaved = dmWith([
        metric('SUM({{ref path="old-alias" field="amount"}})'),
        {
          name: 'margin',
          type: 'FLOAT',
          calculated: {
            formula: 'SUM({{ref path="old-alias" field="profit"}})',
            level: 'metric',
          },
        },
      ]);
      const { service, persisted } = createService(
        true,
        rowWhenRequestStarted,
        rowAfterTheAnalystSaved
      );

      await service.run(renameCommand());

      expect(formulaOf(persisted, 'margin')).toBe('SUM({{ref path="new-alias" field="profit"}})');
      expect(formulaOf(persisted)).toBe('SUM({{ref path="new-alias" field="amount"}})');
    });
  });
});
