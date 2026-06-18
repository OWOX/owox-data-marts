import { Test, TestingModule } from '@nestjs/testing';
import { BlendedReportDataService } from './blended-report-data.service';
import { BlendableSchemaService } from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { OutputControlsValidatorService } from './output-controls-validator.service';
import { BlendedQueryBuilderFacade } from '../data-storage-types/facades/blended-query-builder.facade';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { Report } from '../entities/report.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import {
  AvailableSourceDto,
  BlendableSchemaDto,
  BlendedFieldDto,
} from '../dto/domain/blendable-schema.dto';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { UserProjectionsFetcherService } from './user-projections-fetcher.service';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';

function makeReport(overrides: Partial<Report> = {}): Report {
  const storage = { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY } as DataStorage;
  const dataMart = {
    id: 'dm-1',
    title: 'Main DM',
    projectId: 'project-1',
    storage,
    definition: { sqlQuery: 'SELECT 1' },
  } as unknown as DataMart;

  return {
    id: 'report-1',
    title: 'Test Report',
    dataMart,
    columnConfig: null,
    ...overrides,
  } as Report;
}

function makeBlendableSchema(blendedFieldNames: string[] = []): BlendableSchemaDto {
  return {
    nativeFields: [],
    availableSources: blendedFieldNames.map((_, i) => ({
      aliasPath: `alias_${i}`,
      title: `Target DM ${i}`,
      defaultAlias: `alias_${i}`,
      depth: 1,
      fieldCount: 1,
      isIncluded: true,
      isAccessibleForReporting: true,
      relationshipId: `rel-${i}`,
      dataMartId: `dm-target-${i}`,
    })),
    blendedFields: blendedFieldNames.map((name, i) => {
      const field = new BlendedFieldDto();
      field.name = name;
      field.sourceRelationshipId = `rel-${i}`;
      field.sourceDataMartId = `dm-target-${i}`;
      field.sourceDataMartTitle = `Target DM ${i}`;
      field.targetAlias = `alias_${i}`;
      field.originalFieldName = name;
      field.type = 'STRING';
      field.isHidden = false;
      field.aggregateFunction = 'STRING_AGG';
      field.transitiveDepth = 1;
      field.aliasPath = `alias_${i}`;
      field.outputPrefix = `alias_${i}`;
      return field;
    }),
  };
}

describe('BlendedReportDataService', () => {
  let service: BlendedReportDataService;
  let blendableSchemaService: jest.Mocked<BlendableSchemaService>;
  let relationshipService: jest.Mocked<DataMartRelationshipService>;
  let tableReferenceService: jest.Mocked<DataMartTableReferenceService>;
  let blendedQueryBuilderFacade: jest.Mocked<BlendedQueryBuilderFacade>;
  let userProjectionsFetcher: jest.Mocked<UserProjectionsFetcherService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BlendedReportDataService,
        {
          provide: BlendableSchemaService,
          useValue: {
            computeBlendableSchema: jest.fn(),
          },
        },
        {
          provide: DataMartRelationshipService,
          useValue: {
            findBySourceDataMartId: jest.fn(),
            findById: jest.fn(),
            findByIds: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DataMartTableReferenceService,
          useValue: {
            resolveTableName: jest.fn(),
          },
        },
        {
          provide: BlendedQueryBuilderFacade,
          useValue: {
            buildBlendedQuery: jest.fn(),
          },
        },
        {
          provide: DataMartQueryBuilderFacade,
          useValue: {
            buildQuery: jest.fn(),
          },
        },
        {
          provide: PublicOriginService,
          useValue: {
            getPublicOrigin: jest.fn().mockReturnValue('https://app.example.com'),
          },
        },
        {
          provide: OutputControlsValidatorService,
          useValue: { validateForReport: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: UserProjectionsFetcherService,
          useValue: {
            fetchUserProjection: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(BlendedReportDataService);
    blendableSchemaService = module.get(BlendableSchemaService);
    relationshipService = module.get(DataMartRelationshipService);
    tableReferenceService = module.get(DataMartTableReferenceService);
    blendedQueryBuilderFacade = module.get(BlendedQueryBuilderFacade);
    userProjectionsFetcher = module.get(UserProjectionsFetcherService);
  });

  describe('resolveBlendingDecision', () => {
    it('returns needsBlending=false when columnConfig is null', async () => {
      const report = makeReport({ columnConfig: null });

      const result = await service.resolveBlendingDecision(report, {
        userId: 'user-1',
        roles: ['admin'],
      });

      expect(result).toEqual({ needsBlending: false });
      expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
    });

    it('returns needsBlending=false when columnConfig is undefined', async () => {
      const report = makeReport({ columnConfig: undefined });

      const result = await service.resolveBlendingDecision(report, {
        userId: 'user-1',
        roles: ['admin'],
      });

      expect(result).toEqual({ needsBlending: false });
    });

    it('returns needsBlending=false with columnFilter when no blended columns match', async () => {
      const columnConfig = ['native_field_1', 'native_field_2'];
      const report = makeReport({ columnConfig });

      blendableSchemaService.computeBlendableSchema.mockResolvedValue(
        makeBlendableSchema(['blended_field'])
      );

      const result = await service.resolveBlendingDecision(report, {
        userId: 'user-1',
        roles: ['admin'],
      });

      expect(result).toEqual({
        needsBlending: false,
        columnFilter: columnConfig,
        blendedDataHeaders: [],
      });
      expect(blendableSchemaService.computeBlendableSchema).toHaveBeenCalledWith(
        'dm-1',
        'project-1',
        { userId: 'user-1', roles: ['admin'] }
      );
    });

    it('returns needsBlending=true with blendedSql when blended columns are present', async () => {
      const columnConfig = ['native_field', 'blended_field'];
      const report = makeReport({ columnConfig });

      const blendedField = new BlendedFieldDto();
      blendedField.name = 'blended_field';
      blendedField.sourceRelationshipId = 'rel-1';
      blendedField.sourceDataMartId = 'dm-target-1';
      blendedField.sourceDataMartTitle = 'Target DM';
      blendedField.targetAlias = 'target_alias';
      blendedField.originalFieldName = 'field';
      blendedField.type = 'STRING';
      blendedField.isHidden = false;
      blendedField.aggregateFunction = 'STRING_AGG';
      blendedField.transitiveDepth = 1;
      blendedField.aliasPath = 'target_alias';
      blendedField.outputPrefix = 'target_alias';

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [
          {
            aliasPath: 'target_alias',
            title: 'Target DM',
            defaultAlias: 'target_alias',
            depth: 1,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-1',
            dataMartId: 'dm-target-1',
          },
        ],
        blendedFields: [blendedField],
      });

      const mockRelationship = {
        id: 'rel-1',
        targetAlias: 'target_alias',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-target-1' },
        joinConditions: [],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([mockRelationship]);
      tableReferenceService.resolveTableName
        .mockResolvedValueOnce('`project.dataset.main_table`')
        .mockResolvedValueOnce('`project.dataset.target_table`');

      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue(
        'SELECT native_field, blended_field FROM ...'
      );

      const result = await service.resolveBlendingDecision(report, {
        userId: 'user-1',
        roles: ['admin'],
      });

      expect(result.needsBlending).toBe(true);
      expect(result.blendedSql).toBe('SELECT native_field, blended_field FROM ...');
      expect(blendedQueryBuilderFacade.buildBlendedQuery).toHaveBeenCalledWith(
        DataStorageType.GOOGLE_BIGQUERY,
        expect.objectContaining({
          mainTableReference: '`project.dataset.main_table`',
          mainDataMartTitle: 'Main DM',
          mainDataMartUrl: expect.stringContaining('/ui/project-1/data-marts/dm-1/data-setup'),
          columns: columnConfig,
          chains: expect.arrayContaining([
            expect.objectContaining({
              relationship: mockRelationship,
              targetTableReference: '`project.dataset.target_table`',
              parentAlias: 'main',
            }),
          ]),
        })
      );
    });

    it('populates blendedDataHeaders for blended columns only (native cols are reader-resolved)', async () => {
      const columnConfig = ['native_col', 'my_alias__blended_col'];
      const report = makeReport({ columnConfig });

      const blendedField = new BlendedFieldDto();
      blendedField.name = 'my_alias__blended_col';
      blendedField.sourceRelationshipId = 'rel-1';
      blendedField.sourceDataMartId = 'dm-target';
      blendedField.sourceDataMartTitle = 'Target';
      blendedField.targetAlias = 'alias_1';
      blendedField.originalFieldName = 'blended_col';
      blendedField.type = 'STRING';
      blendedField.alias = 'Blended Display';
      blendedField.description = 'Blended field description';
      blendedField.isHidden = false;
      blendedField.aggregateFunction = 'STRING_AGG';
      blendedField.transitiveDepth = 1;
      blendedField.aliasPath = 'alias_1';
      blendedField.outputPrefix = 'my_alias';

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [
          {
            aliasPath: 'alias_1',
            title: 'Target',
            defaultAlias: 'my_alias',
            depth: 1,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-1',
            dataMartId: 'dm-target',
          },
        ],
        blendedFields: [blendedField],
      });

      const mockRel = {
        id: 'rel-1',
        targetAlias: 'alias_1',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-target' },
        joinConditions: [],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([mockRel]);
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

      const result = await service.resolveBlendingDecision(report, {
        userId: 'user-1',
        roles: ['admin'],
      });

      // Only the blended column gets a header; native columns are resolved
      // by the reader's own headers generator.
      expect(result.blendedDataHeaders).toHaveLength(1);
      expect(result.blendedDataHeaders?.[0].name).toBe('my_alias__blended_col');
      // Exported header: "<outputPrefix> <fieldAlias|originalFieldName>".
      expect(result.blendedDataHeaders?.[0].alias).toBe('my_alias Blended Display');
      expect(result.blendedDataHeaders?.[0].description).toBe('Blended field description');
      expect(result.columnFilter).toEqual(columnConfig);
    });

    describe('blendedDataHeaders carry effective type and aggregateFunction', () => {
      function makeSimpleSchema(
        fieldName: string,
        type: string,
        agg: BlendedFieldDto['aggregateFunction']
      ): BlendableSchemaDto {
        const field = new BlendedFieldDto();
        field.name = fieldName;
        field.sourceRelationshipId = 'rel-1';
        field.sourceDataMartId = 'dm-target';
        field.sourceDataMartTitle = 'Target';
        field.targetAlias = 'alias_1';
        field.originalFieldName = fieldName;
        field.type = type;
        field.isHidden = false;
        field.aggregateFunction = agg;
        field.transitiveDepth = 1;
        field.aliasPath = 'alias_1';
        field.outputPrefix = 'alias_1';

        return {
          nativeFields: [],
          availableSources: [
            {
              aliasPath: 'alias_1',
              title: 'Target',
              defaultAlias: 'alias_1',
              depth: 1,
              fieldCount: 1,
              isIncluded: true,
              isAccessibleForReporting: true,
              relationshipId: 'rel-1',
              dataMartId: 'dm-target',
            },
          ],
          blendedFields: [field],
        };
      }

      async function resolveHeader(
        fieldName: string,
        type: string,
        agg: BlendedFieldDto['aggregateFunction']
      ) {
        blendableSchemaService.computeBlendableSchema.mockResolvedValue(
          makeSimpleSchema(fieldName, type, agg)
        );
        relationshipService.findBySourceDataMartId.mockResolvedValue([
          {
            id: 'rel-1',
            targetAlias: 'alias_1',
            sourceDataMart: { id: 'dm-1' },
            targetDataMart: { id: 'dm-target' },
            joinConditions: [],
          } as unknown as DataMartRelationship,
        ]);
        tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

        const report = makeReport({ columnConfig: [fieldName] });
        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });
        return result.blendedDataHeaders?.[0];
      }

      it('SUM/INTEGER: effective storageFieldType=INTEGER, aggregateFunction=SUM', async () => {
        const header = await resolveHeader('f', 'INTEGER', 'SUM');
        expect(header?.storageFieldType).toBe('INTEGER');
        expect(header?.aggregateFunction).toBe('SUM');
      });

      it('COUNT/STRING: effective storageFieldType=INTEGER, aggregateFunction=COUNT', async () => {
        const header = await resolveHeader('f', 'STRING', 'COUNT');
        expect(header?.storageFieldType).toBe('INTEGER');
        expect(header?.aggregateFunction).toBe('COUNT');
      });

      it('STRING_AGG/STRING: effective storageFieldType=STRING, aggregateFunction=STRING_AGG', async () => {
        const header = await resolveHeader('f', 'STRING', 'STRING_AGG');
        expect(header?.storageFieldType).toBe('STRING');
        expect(header?.aggregateFunction).toBe('STRING_AGG');
      });

      it('MAX/DATE: effective storageFieldType=DATE, aggregateFunction=MAX', async () => {
        const header = await resolveHeader('f', 'DATE', 'MAX');
        expect(header?.storageFieldType).toBe('DATE');
        expect(header?.aggregateFunction).toBe('MAX');
      });
    });

    it('sets parentAlias to main for direct relationships (transitiveDepth=1)', async () => {
      const columnConfig = ['blended_field'];
      const report = makeReport({ columnConfig });

      const blendedField = new BlendedFieldDto();
      blendedField.name = 'blended_field';
      blendedField.sourceRelationshipId = 'rel-1';
      blendedField.sourceDataMartId = 'dm-target';
      blendedField.sourceDataMartTitle = 'Target';
      blendedField.targetAlias = 'alias_1';
      blendedField.originalFieldName = 'field';
      blendedField.type = 'STRING';
      blendedField.isHidden = false;
      blendedField.aggregateFunction = 'STRING_AGG';
      blendedField.transitiveDepth = 1;
      blendedField.aliasPath = 'alias_1';
      blendedField.outputPrefix = 'alias_1';

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [
          {
            aliasPath: 'alias_1',
            title: 'Target',
            defaultAlias: 'alias_1',
            depth: 1,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-1',
            dataMartId: 'dm-target',
          },
        ],
        blendedFields: [blendedField],
      });

      const mockRel = {
        id: 'rel-1',
        targetAlias: 'alias_1',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-target' },
        joinConditions: [],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([mockRel]);
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

      await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

      const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
      expect(context?.chains[0].parentAlias).toBe('main');
    });

    it('throws when two requested chains produce the same outputAlias (cross-chain collision)', async () => {
      const columnConfig = ['shared_alias'];
      const report = makeReport({ columnConfig });

      const fieldFromB = new BlendedFieldDto();
      fieldFromB.name = 'shared_alias';
      fieldFromB.sourceRelationshipId = 'rel-ab';
      fieldFromB.sourceDataMartId = 'dm-b';
      fieldFromB.targetAlias = 'b';
      fieldFromB.originalFieldName = 'name';
      fieldFromB.type = 'STRING';
      fieldFromB.isHidden = false;
      fieldFromB.aggregateFunction = 'STRING_AGG';
      fieldFromB.transitiveDepth = 1;
      fieldFromB.aliasPath = 'b';
      fieldFromB.outputPrefix = 'b';

      const fieldFromC = new BlendedFieldDto();
      fieldFromC.name = 'shared_alias';
      fieldFromC.sourceRelationshipId = 'rel-ac';
      fieldFromC.sourceDataMartId = 'dm-c';
      fieldFromC.targetAlias = 'c';
      fieldFromC.originalFieldName = 'name';
      fieldFromC.type = 'STRING';
      fieldFromC.isHidden = false;
      fieldFromC.aggregateFunction = 'STRING_AGG';
      fieldFromC.transitiveDepth = 1;
      fieldFromC.aliasPath = 'c';
      fieldFromC.outputPrefix = 'c';

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [
          {
            aliasPath: 'b',
            title: 'B',
            defaultAlias: 'b',
            depth: 1,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-ab',
            dataMartId: 'dm-b',
          },
          {
            aliasPath: 'c',
            title: 'C',
            defaultAlias: 'c',
            depth: 1,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-ac',
            dataMartId: 'dm-c',
          },
        ],
        blendedFields: [fieldFromB, fieldFromC],
      });

      const relAB = {
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-b', title: 'B' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;
      const relAC = {
        id: 'rel-ac',
        targetAlias: 'c',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-c', title: 'C' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;
      relationshipService.findBySourceDataMartId.mockResolvedValue([relAB, relAC]);
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');

      // Two blended fields share the same unified name ('shared_alias') across
      // distinct aliasPaths — the field-index ambiguity guard now rejects this
      // first, before the downstream chain outputAlias-collision check.
      await expect(
        service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
      ).rejects.toThrow(
        /Ambiguous blended column name "shared_alias"|outputAlias.+shared_alias.+collision|duplicate.+shared_alias/i
      );
    });

    it('disambiguates CTE names with parent path when two chains share the same targetAlias', async () => {
      // A→B (alias="orders") and B→C (alias="orders") — both legit per-source
      // (the `(sourceDataMart, targetAlias)` unique constraint allows it). The
      // builder must produce distinct CTE names ("orders" and "orders_orders")
      // rather than rejecting the configuration.
      const columnConfig = ['b_orders__field', 'orders__field'];
      const report = makeReport({ columnConfig });

      const directField = new BlendedFieldDto();
      directField.name = 'orders__field';
      directField.sourceRelationshipId = 'rel-ab';
      directField.sourceDataMartId = 'dm-b';
      directField.targetAlias = 'orders';
      directField.originalFieldName = 'field';
      directField.type = 'STRING';
      directField.isHidden = false;
      directField.aggregateFunction = 'STRING_AGG';
      directField.transitiveDepth = 1;
      directField.aliasPath = 'orders';
      directField.outputPrefix = 'orders';

      const transitiveField = new BlendedFieldDto();
      transitiveField.name = 'b_orders__field';
      transitiveField.sourceRelationshipId = 'rel-bc';
      transitiveField.sourceDataMartId = 'dm-c';
      transitiveField.targetAlias = 'orders';
      transitiveField.originalFieldName = 'field';
      transitiveField.type = 'STRING';
      transitiveField.isHidden = false;
      transitiveField.aggregateFunction = 'STRING_AGG';
      transitiveField.transitiveDepth = 2;
      transitiveField.aliasPath = 'orders.orders';
      transitiveField.outputPrefix = 'orders_orders';

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [
          {
            aliasPath: 'orders',
            title: 'B',
            defaultAlias: 'orders',
            depth: 1,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-ab',
            dataMartId: 'dm-b',
          },
          {
            aliasPath: 'orders.orders',
            title: 'C',
            defaultAlias: 'orders_orders',
            depth: 2,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-bc',
            dataMartId: 'dm-c',
          },
        ],
        blendedFields: [directField, transitiveField],
      });

      const relAB = {
        id: 'rel-ab',
        targetAlias: 'orders',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-b', title: 'B' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;
      const relBC = {
        id: 'rel-bc',
        targetAlias: 'orders',
        sourceDataMart: { id: 'dm-b' },
        targetDataMart: { id: 'dm-c', title: 'C' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;
      relationshipService.findBySourceDataMartId.mockResolvedValue([relAB]);
      relationshipService.findByIds.mockImplementation(async (ids: string[]) => {
        const byId: Record<string, DataMartRelationship> = {
          'rel-ab': relAB,
          'rel-bc': relBC,
        };
        return ids.map(id => byId[id]).filter(Boolean);
      });
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

      await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

      const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
      expect(context!.chains).toHaveLength(2);

      const abChain = context!.chains.find(c => c.relationship.id === 'rel-ab');
      expect(abChain).toBeDefined();
      expect(abChain!.parentAlias).toBe('main');
      expect(abChain!.cteName).toBe('orders');

      const bcChain = context!.chains.find(c => c.relationship.id === 'rel-bc');
      expect(bcChain).toBeDefined();
      expect(bcChain!.parentAlias).toBe('orders');
      expect(bcChain!.cteName).toBe('orders_orders');
    });

    it('throws when two paths flatten to the same cteName (path-segment ambiguity safeguard)', async () => {
      // Pathological: targetAlias "a_b" at depth 1 vs targetAlias "a" + "b" at depths 1/2
      // both flatten to the cteName "a_b". The path-prefix scheme normally guarantees
      // uniqueness, but with arbitrary underscores in targetAlias the flattening can
      // collide — the safeguard surfaces this as a clear error instead of broken SQL.
      const columnConfig = ['a_b__x', 'a_b__y'];
      const report = makeReport({ columnConfig });

      const fieldFromSingle = new BlendedFieldDto();
      fieldFromSingle.name = 'a_b__x';
      fieldFromSingle.sourceRelationshipId = 'rel-ab-direct';
      fieldFromSingle.sourceDataMartId = 'dm-ab';
      fieldFromSingle.targetAlias = 'a_b';
      fieldFromSingle.originalFieldName = 'x';
      fieldFromSingle.type = 'STRING';
      fieldFromSingle.isHidden = false;
      fieldFromSingle.aggregateFunction = 'STRING_AGG';
      fieldFromSingle.transitiveDepth = 1;
      fieldFromSingle.aliasPath = 'a_b';
      fieldFromSingle.outputPrefix = 'a_b';

      const fieldFromTwoStep = new BlendedFieldDto();
      fieldFromTwoStep.name = 'a_b__y';
      fieldFromTwoStep.sourceRelationshipId = 'rel-a-b';
      fieldFromTwoStep.sourceDataMartId = 'dm-b';
      fieldFromTwoStep.targetAlias = 'b';
      fieldFromTwoStep.originalFieldName = 'y';
      fieldFromTwoStep.type = 'STRING';
      fieldFromTwoStep.isHidden = false;
      fieldFromTwoStep.aggregateFunction = 'STRING_AGG';
      fieldFromTwoStep.transitiveDepth = 2;
      fieldFromTwoStep.aliasPath = 'a.b';
      fieldFromTwoStep.outputPrefix = 'a_b';

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [
          {
            aliasPath: 'a_b',
            title: 'AB',
            defaultAlias: 'a_b',
            depth: 1,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-ab-direct',
            dataMartId: 'dm-ab',
          },
          {
            aliasPath: 'a',
            title: 'A',
            defaultAlias: 'a',
            depth: 1,
            fieldCount: 0,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-main-a',
            dataMartId: 'dm-a',
          },
          {
            aliasPath: 'a.b',
            title: 'B',
            defaultAlias: 'a_b',
            depth: 2,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-a-b',
            dataMartId: 'dm-b',
          },
        ],
        blendedFields: [fieldFromSingle, fieldFromTwoStep],
      });

      const relAbDirect = {
        id: 'rel-ab-direct',
        targetAlias: 'a_b',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-ab', title: 'AB' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;
      const relMainA = {
        id: 'rel-main-a',
        targetAlias: 'a',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-a', title: 'A' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;
      const relAB = {
        id: 'rel-a-b',
        targetAlias: 'b',
        sourceDataMart: { id: 'dm-a' },
        targetDataMart: { id: 'dm-b', title: 'B' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([relAbDirect, relMainA]);
      relationshipService.findByIds.mockImplementation(async (ids: string[]) => {
        const byId: Record<string, DataMartRelationship> = {
          'rel-ab-direct': relAbDirect,
          'rel-main-a': relMainA,
          'rel-a-b': relAB,
        };
        return ids.map(id => byId[id]).filter(Boolean);
      });
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');

      await expect(
        service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
      ).rejects.toThrow(/cteName "a_b" is produced by multiple/);
    });

    it('disambiguates CTE names in a diamond pattern (two paths reaching same target with same targetAlias)', async () => {
      // Diamond: main→left→shared and main→right→shared, both with targetAlias="shared".
      // Pre-fix this used to throw a "duplicate CTE name" error; now it must
      // produce CTE names "left_shared" and "right_shared".
      const columnConfig = ['left_shared__value', 'right_shared__value'];
      const report = makeReport({ columnConfig });

      const leftField = new BlendedFieldDto();
      leftField.name = 'left_shared__value';
      leftField.sourceRelationshipId = 'rel-left-shared';
      leftField.sourceDataMartId = 'dm-shared';
      leftField.targetAlias = 'shared';
      leftField.originalFieldName = 'value';
      leftField.type = 'STRING';
      leftField.isHidden = false;
      leftField.aggregateFunction = 'STRING_AGG';
      leftField.transitiveDepth = 2;
      leftField.aliasPath = 'left.shared';
      leftField.outputPrefix = 'left_shared';

      const rightField = new BlendedFieldDto();
      rightField.name = 'right_shared__value';
      rightField.sourceRelationshipId = 'rel-right-shared';
      rightField.sourceDataMartId = 'dm-shared';
      rightField.targetAlias = 'shared';
      rightField.originalFieldName = 'value';
      rightField.type = 'STRING';
      rightField.isHidden = false;
      rightField.aggregateFunction = 'STRING_AGG';
      rightField.transitiveDepth = 2;
      rightField.aliasPath = 'right.shared';
      rightField.outputPrefix = 'right_shared';

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [
          {
            aliasPath: 'left',
            title: 'Left',
            defaultAlias: 'left',
            depth: 1,
            fieldCount: 0,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-main-left',
            dataMartId: 'dm-left',
          },
          {
            aliasPath: 'right',
            title: 'Right',
            defaultAlias: 'right',
            depth: 1,
            fieldCount: 0,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-main-right',
            dataMartId: 'dm-right',
          },
          {
            aliasPath: 'left.shared',
            title: 'Shared',
            defaultAlias: 'left_shared',
            depth: 2,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-left-shared',
            dataMartId: 'dm-shared',
          },
          {
            aliasPath: 'right.shared',
            title: 'Shared',
            defaultAlias: 'right_shared',
            depth: 2,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-right-shared',
            dataMartId: 'dm-shared',
          },
        ],
        blendedFields: [leftField, rightField],
      });

      const relMainLeft = {
        id: 'rel-main-left',
        targetAlias: 'left',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-left', title: 'Left' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;
      const relMainRight = {
        id: 'rel-main-right',
        targetAlias: 'right',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-right', title: 'Right' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;
      const relLeftShared = {
        id: 'rel-left-shared',
        targetAlias: 'shared',
        sourceDataMart: { id: 'dm-left' },
        targetDataMart: { id: 'dm-shared', title: 'Shared' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;
      const relRightShared = {
        id: 'rel-right-shared',
        targetAlias: 'shared',
        sourceDataMart: { id: 'dm-right' },
        targetDataMart: { id: 'dm-shared', title: 'Shared' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([relMainLeft, relMainRight]);
      relationshipService.findByIds.mockImplementation(async (ids: string[]) => {
        const byId: Record<string, DataMartRelationship> = {
          'rel-main-left': relMainLeft,
          'rel-main-right': relMainRight,
          'rel-left-shared': relLeftShared,
          'rel-right-shared': relRightShared,
        };
        return ids.map(id => byId[id]).filter(Boolean);
      });
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

      await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

      const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
      const cteNames = context!.chains.map(c => c.cteName).sort();
      expect(cteNames).toEqual(['left', 'left_shared', 'right', 'right_shared']);

      const leftShared = context!.chains.find(c => c.relationship.id === 'rel-left-shared')!;
      expect(leftShared.cteName).toBe('left_shared');
      expect(leftShared.parentAlias).toBe('left');

      const rightShared = context!.chains.find(c => c.relationship.id === 'rel-right-shared')!;
      expect(rightShared.cteName).toBe('right_shared');
      expect(rightShared.parentAlias).toBe('right');
    });

    it('includes intermediate relationships when only a deep (transitiveDepth>1) field is selected', async () => {
      // Scenario: A → B → C. User only selects a field from C.
      // Expected: chains must contain BOTH A→B and B→C, with C's parentAlias = B's targetAlias.
      const columnConfig = ['b_c__product_name'];
      const report = makeReport({ columnConfig });

      const bField = new BlendedFieldDto();
      bField.name = 'b__b_field';
      bField.sourceRelationshipId = 'rel-ab';
      bField.sourceDataMartId = 'dm-b';
      bField.sourceDataMartTitle = 'DM B';
      bField.targetAlias = 'b';
      bField.originalFieldName = 'b_field';
      bField.type = 'STRING';
      bField.isHidden = false;
      bField.aggregateFunction = 'STRING_AGG';
      bField.transitiveDepth = 1;
      bField.aliasPath = 'b';
      bField.outputPrefix = 'b';

      const cField = new BlendedFieldDto();
      cField.name = 'b_c__product_name';
      cField.sourceRelationshipId = 'rel-bc';
      cField.sourceDataMartId = 'dm-c';
      cField.sourceDataMartTitle = 'DM C';
      cField.targetAlias = 'c';
      cField.originalFieldName = 'product_name';
      cField.type = 'STRING';
      cField.isHidden = false;
      cField.aggregateFunction = 'STRING_AGG';
      cField.transitiveDepth = 2;
      cField.aliasPath = 'b.c';
      cField.outputPrefix = 'b_c';

      const availableSourceB = {
        aliasPath: 'b',
        title: 'DM B',
        defaultAlias: 'b',
        depth: 1,
        fieldCount: 1,
        isIncluded: true,
        isAccessibleForReporting: true,
        relationshipId: 'rel-ab',
        dataMartId: 'dm-b',
      };
      const availableSourceC = {
        aliasPath: 'b.c',
        title: 'DM C',
        defaultAlias: 'b_c',
        depth: 2,
        fieldCount: 1,
        isIncluded: true,
        isAccessibleForReporting: true,
        relationshipId: 'rel-bc',
        dataMartId: 'dm-c',
      };

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [availableSourceB, availableSourceC],
        blendedFields: [bField, cField],
      });

      const relAB = {
        id: 'rel-ab',
        targetAlias: 'b',
        sourceDataMart: { id: 'dm-1', title: 'Main DM' },
        targetDataMart: { id: 'dm-b', title: 'DM B' },
        joinConditions: [{ sourceFieldName: 'b_id', targetFieldName: 'b_id' }],
      } as unknown as DataMartRelationship;
      const relBC = {
        id: 'rel-bc',
        targetAlias: 'c',
        sourceDataMart: { id: 'dm-b', title: 'DM B' },
        targetDataMart: { id: 'dm-c', title: 'DM C' },
        joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'product_id' }],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([relAB]);
      relationshipService.findByIds.mockImplementation(async (ids: string[]) => {
        const byId: Record<string, DataMartRelationship> = {
          'rel-ab': relAB,
          'rel-bc': relBC,
        };
        return ids.map(id => byId[id]).filter(Boolean);
      });
      tableReferenceService.resolveTableName.mockImplementation(async (id: string) => {
        if (id === 'dm-1') return '`p`.`d`.`main`';
        if (id === 'dm-b') return '`p`.`d`.`b`';
        if (id === 'dm-c') return '`p`.`d`.`c`';
        return '';
      });
      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

      await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

      const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
      expect(context).toBeDefined();
      expect(context!.chains).toHaveLength(2);

      // A→B chain must be present (even though no B-field is requested), with parentAlias = 'main'.
      const abChain = context!.chains.find(c => c.relationship.id === 'rel-ab');
      expect(abChain).toBeDefined();
      expect(abChain!.parentAlias).toBe('main');
      // No B-field requested → blendedFields is empty (only joinKeys remain in aggregation CTE).
      expect(abChain!.blendedFields).toHaveLength(0);

      // B→C chain must have parentAlias = 'b' (the targetAlias of A→B), NOT 'main'.
      const bcChain = context!.chains.find(c => c.relationship.id === 'rel-bc');
      expect(bcChain).toBeDefined();
      expect(bcChain!.parentAlias).toBe('b');
      expect(bcChain!.blendedFields).toHaveLength(1);
      expect(bcChain!.blendedFields[0].outputAlias).toBe('b_c__product_name');

      // Sorted by transitiveDepth: A→B (depth 1) must come before B→C (depth 2).
      expect(context!.chains[0].relationship.id).toBe('rel-ab');
      expect(context!.chains[1].relationship.id).toBe('rel-bc');
    });

    it('routes blended fields to the chain matching their aliasPath when one relationship is reused by multiple paths', async () => {
      const columnConfig = ['orders_products__product_price', 'orders_2_products__product_price'];
      const report = makeReport({ columnConfig });

      const ordersProductsField = new BlendedFieldDto();
      ordersProductsField.name = 'orders_products__product_price';
      ordersProductsField.sourceRelationshipId = 'rel-orders-products';
      ordersProductsField.sourceDataMartId = 'dm-products';
      ordersProductsField.targetAlias = 'products';
      ordersProductsField.originalFieldName = 'product_price';
      ordersProductsField.type = 'INTEGER';
      ordersProductsField.isHidden = false;
      ordersProductsField.aggregateFunction = 'SUM';
      ordersProductsField.transitiveDepth = 2;
      ordersProductsField.aliasPath = 'orders.products';
      ordersProductsField.outputPrefix = 'orders_products';

      const orders2ProductsField = new BlendedFieldDto();
      orders2ProductsField.name = 'orders_2_products__product_price';
      orders2ProductsField.sourceRelationshipId = 'rel-orders-products';
      orders2ProductsField.sourceDataMartId = 'dm-products';
      orders2ProductsField.targetAlias = 'products';
      orders2ProductsField.originalFieldName = 'product_price';
      orders2ProductsField.type = 'INTEGER';
      orders2ProductsField.isHidden = false;
      orders2ProductsField.aggregateFunction = 'SUM';
      orders2ProductsField.transitiveDepth = 2;
      orders2ProductsField.aliasPath = 'orders_2.products';
      orders2ProductsField.outputPrefix = 'orders_2_products';

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [
          {
            aliasPath: 'orders',
            title: 'Orders',
            defaultAlias: 'orders',
            depth: 1,
            fieldCount: 0,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-campaigns-orders',
            dataMartId: 'dm-orders',
          },
          {
            aliasPath: 'orders_2',
            title: 'Orders',
            defaultAlias: 'orders_2',
            depth: 1,
            fieldCount: 0,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-campaigns-orders-2',
            dataMartId: 'dm-orders',
          },
          {
            aliasPath: 'orders.products',
            title: 'Products',
            defaultAlias: 'orders_products',
            depth: 2,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-orders-products',
            dataMartId: 'dm-products',
          },
          {
            aliasPath: 'orders_2.products',
            title: 'Products',
            defaultAlias: 'orders_2_products',
            depth: 2,
            fieldCount: 1,
            isIncluded: true,
            isAccessibleForReporting: true,
            relationshipId: 'rel-orders-products',
            dataMartId: 'dm-products',
          },
        ],
        blendedFields: [ordersProductsField, orders2ProductsField],
      });

      const relCampaignsOrders = {
        id: 'rel-campaigns-orders',
        targetAlias: 'orders',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-orders', title: 'Orders' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'campaign_id' }],
      } as unknown as DataMartRelationship;
      const relCampaignsOrders2 = {
        id: 'rel-campaigns-orders-2',
        targetAlias: 'orders_2',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-orders', title: 'Orders' },
        joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'campaign_id' }],
      } as unknown as DataMartRelationship;
      const relOrdersProducts = {
        id: 'rel-orders-products',
        targetAlias: 'products',
        sourceDataMart: { id: 'dm-orders' },
        targetDataMart: { id: 'dm-products', title: 'Products' },
        joinConditions: [{ sourceFieldName: 'product_id', targetFieldName: 'id' }],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([
        relCampaignsOrders,
        relCampaignsOrders2,
      ]);
      relationshipService.findByIds.mockImplementation(async (ids: string[]) => {
        const byId: Record<string, DataMartRelationship> = {
          'rel-campaigns-orders': relCampaignsOrders,
          'rel-campaigns-orders-2': relCampaignsOrders2,
          'rel-orders-products': relOrdersProducts,
        };
        return ids.map(id => byId[id]).filter(Boolean);
      });
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

      await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

      const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
      expect(context!.chains).toHaveLength(4);

      const ordersProductsChain = context!.chains.find(c => c.cteName === 'orders_products')!;
      expect(ordersProductsChain.blendedFields).toHaveLength(1);
      expect(ordersProductsChain.blendedFields[0].outputAlias).toBe(
        'orders_products__product_price'
      );

      const orders2ProductsChain = context!.chains.find(c => c.cteName === 'orders_2_products')!;
      expect(orders2ProductsChain.blendedFields).toHaveLength(1);
      expect(orders2ProductsChain.blendedFields[0].outputAlias).toBe(
        'orders_2_products__product_price'
      );
    });

    describe('access denial', () => {
      function makeAccessibleSource(
        overrides: Partial<AvailableSourceDto> = {}
      ): AvailableSourceDto {
        return {
          aliasPath: 'b',
          title: 'Joined DM',
          defaultAlias: 'b',
          depth: 1,
          fieldCount: 1,
          isIncluded: true,
          isAccessibleForReporting: true,
          relationshipId: 'rel-1',
          dataMartId: 'dm-target-1',
          ...overrides,
        };
      }

      function makeField(name: string, aliasPath: string): BlendedFieldDto {
        const segments = aliasPath.split('.');
        const f = new BlendedFieldDto();
        f.name = name;
        f.targetAlias = segments[segments.length - 1];
        f.originalFieldName = name;
        f.type = 'STRING';
        f.isHidden = false;
        f.aggregateFunction = 'STRING_AGG';
        f.transitiveDepth = segments.length;
        f.aliasPath = aliasPath;
        f.outputPrefix = segments.join('_');
        return f;
      }

      it('throws BusinessViolationException listing the user and inaccessible DM title', async () => {
        const report = makeReport({ columnConfig: ['b__field'] });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            makeAccessibleSource({
              aliasPath: 'b',
              title: 'Inaccessible DM',
              dataMartId: 'dm-secret',
              isAccessibleForReporting: false,
            }),
          ],
          blendedFields: [makeField('b__field', 'b')],
        });
        userProjectionsFetcher.fetchUserProjection.mockResolvedValue(
          new UserProjectionDto('user-1', 'Alice Example', 'alice@example.com')
        );

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          message:
            'Cannot build report SQL, user "Alice Example" is missing access to data marts: "Inaccessible DM"',
          errorDetails: {
            userId: 'user-1',
            deniedDataMartIds: ['dm-secret'],
            deniedAliasPaths: ['b'],
          },
        });

        expect(blendedQueryBuilderFacade.buildBlendedQuery).not.toHaveBeenCalled();
        expect(tableReferenceService.resolveTableName).not.toHaveBeenCalled();
        expect(userProjectionsFetcher.fetchUserProjection).toHaveBeenCalledWith('user-1');
      });

      it('falls back to email when fullName is missing', async () => {
        const report = makeReport({ columnConfig: ['b__field'] });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            makeAccessibleSource({
              aliasPath: 'b',
              title: 'Inaccessible DM',
              dataMartId: 'dm-secret',
              isAccessibleForReporting: false,
            }),
          ],
          blendedFields: [makeField('b__field', 'b')],
        });
        userProjectionsFetcher.fetchUserProjection.mockResolvedValue(
          new UserProjectionDto('user-1', null, 'alice@example.com')
        );

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          message:
            'Cannot build report SQL, user "alice@example.com" is missing access to data marts: "Inaccessible DM"',
        });
      });

      it('falls back to userId when no user projection is available', async () => {
        const report = makeReport({ columnConfig: ['b__field'] });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            makeAccessibleSource({
              aliasPath: 'b',
              title: 'Inaccessible DM',
              dataMartId: 'dm-secret',
              isAccessibleForReporting: false,
            }),
          ],
          blendedFields: [makeField('b__field', 'b')],
        });
        userProjectionsFetcher.fetchUserProjection.mockResolvedValue(undefined);

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          message:
            'Cannot build report SQL, user "user-1" is missing access to data marts: "Inaccessible DM"',
        });
      });

      it('throws when only an ancestor on the aliasPath is inaccessible (cascade)', async () => {
        const report = makeReport({ columnConfig: ['b_c__field'] });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            makeAccessibleSource({
              aliasPath: 'b',
              title: 'Parent DM',
              dataMartId: 'dm-b',
              isAccessibleForReporting: false,
            }),
            makeAccessibleSource({
              aliasPath: 'b.c',
              title: 'Child DM',
              defaultAlias: 'b_c',
              depth: 2,
              dataMartId: 'dm-c',
              relationshipId: 'rel-bc',
              isAccessibleForReporting: false,
            }),
          ],
          blendedFields: [makeField('b_c__field', 'b.c')],
        });
        userProjectionsFetcher.fetchUserProjection.mockResolvedValue(
          new UserProjectionDto('user-1', 'Alice Example', 'alice@example.com')
        );

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          message:
            'Cannot build report SQL, user "Alice Example" is missing access to data marts: "Parent DM", "Child DM"',
          errorDetails: {
            userId: 'user-1',
            deniedDataMartIds: ['dm-b', 'dm-c'],
            deniedAliasPaths: ['b', 'b.c'],
          },
        });
      });

      it('lists multiple inaccessible DMs comma-separated when several chains are denied', async () => {
        const report = makeReport({ columnConfig: ['b__x', 'c__y'] });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            makeAccessibleSource({
              aliasPath: 'b',
              title: 'DM Bravo',
              dataMartId: 'dm-bravo',
              relationshipId: 'rel-b',
              isAccessibleForReporting: false,
            }),
            makeAccessibleSource({
              aliasPath: 'c',
              title: 'DM Charlie',
              defaultAlias: 'c',
              dataMartId: 'dm-charlie',
              relationshipId: 'rel-c',
              isAccessibleForReporting: false,
            }),
          ],
          blendedFields: [makeField('b__x', 'b'), makeField('c__y', 'c')],
        });
        userProjectionsFetcher.fetchUserProjection.mockResolvedValue(
          new UserProjectionDto('user-1', 'Alice Example', 'alice@example.com')
        );

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          message:
            'Cannot build report SQL, user "Alice Example" is missing access to data marts: "DM Bravo", "DM Charlie"',
          errorDetails: {
            userId: 'user-1',
            deniedDataMartIds: ['dm-bravo', 'dm-charlie'],
            deniedAliasPaths: ['b', 'c'],
          },
        });
      });

      it('does not throw when all requested sources are accessible (regression guard)', async () => {
        const report = makeReport({ columnConfig: ['b__field'] });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            makeAccessibleSource({
              aliasPath: 'b',
              isAccessibleForReporting: true,
            }),
          ],
          blendedFields: [makeField('b__field', 'b')],
        });

        relationshipService.findBySourceDataMartId.mockResolvedValue([
          {
            id: 'rel-1',
            targetAlias: 'b',
            sourceDataMart: { id: 'dm-1' },
            targetDataMart: { id: 'dm-target-1', title: 'Joined DM' },
            joinConditions: [],
          } as unknown as DataMartRelationship,
        ]);
        tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.needsBlending).toBe(true);
        expect(blendedQueryBuilderFacade.buildBlendedQuery).toHaveBeenCalled();
      });

      it('does not throw when no blended columns are referenced (native-only report)', async () => {
        const report = makeReport({ columnConfig: ['native_only'] });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            makeAccessibleSource({
              aliasPath: 'b',
              title: 'Inaccessible',
              isAccessibleForReporting: false,
            }),
          ],
          blendedFields: [makeField('b__field', 'b')],
        });

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result).toEqual({
          needsBlending: false,
          columnFilter: ['native_only'],
          blendedDataHeaders: [],
        });
        expect(blendedQueryBuilderFacade.buildBlendedQuery).not.toHaveBeenCalled();
      });

      it('does not throw when an inaccessible source exists but is not in the join chain', async () => {
        const report = makeReport({ columnConfig: ['b__field'] });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            makeAccessibleSource({
              aliasPath: 'b',
              isAccessibleForReporting: true,
            }),
            makeAccessibleSource({
              aliasPath: 'z',
              title: 'Unused Inaccessible',
              dataMartId: 'dm-z',
              relationshipId: 'rel-z',
              isAccessibleForReporting: false,
            }),
          ],
          blendedFields: [makeField('b__field', 'b'), makeField('z__other', 'z')],
        });

        relationshipService.findBySourceDataMartId.mockResolvedValue([
          {
            id: 'rel-1',
            targetAlias: 'b',
            sourceDataMart: { id: 'dm-1' },
            targetDataMart: { id: 'dm-target-1', title: 'Joined DM' },
            joinConditions: [],
          } as unknown as DataMartRelationship,
        ]);
        tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.needsBlending).toBe(true);
      });

      it('rejects a pre-join slice targeting an EXCLUDED source on the run path', async () => {
        // The save-time validator rejects slices on excluded sources, but the run
        // path resolves slices through a fieldIndex that still includes excluded
        // fields (isIncluded:false). This locks the run-path guard.
        const report = makeReport({
          columnConfig: ['b__field'],
          filterConfig: [
            { column: 'excluded__field', operator: 'eq', value: 'x', placement: 'pre-join' },
          ] as any,
        });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            makeAccessibleSource({ aliasPath: 'b', isAccessibleForReporting: true }),
            makeAccessibleSource({
              aliasPath: 'excluded',
              title: 'Excluded DM',
              dataMartId: 'dm-excluded',
              relationshipId: 'rel-excluded',
              isAccessibleForReporting: true,
              isIncluded: false,
            }),
          ],
          blendedFields: [makeField('b__field', 'b'), makeField('excluded__field', 'excluded')],
        });

        relationshipService.findBySourceDataMartId.mockResolvedValue([
          {
            id: 'rel-1',
            targetAlias: 'b',
            sourceDataMart: { id: 'dm-1' },
            targetDataMart: { id: 'dm-target-1', title: 'Joined DM' },
            joinConditions: [],
          } as unknown as DataMartRelationship,
        ]);
        tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          message: expect.stringContaining('excluded from reporting'),
          errorDetails: {
            excludedDataMartIds: ['dm-excluded'],
            excludedAliasPaths: ['excluded'],
          },
        });

        expect(blendedQueryBuilderFacade.buildBlendedQuery).not.toHaveBeenCalled();
      });
    });

    describe('resolveBlendingDecision — filter on non-selected blended column', () => {
      it('extends join chain when filterConfig references a blended column not in columnConfig', async () => {
        // columnConfig = ['main_a'] (native), filterConfig references 'blended_b' (blended, not selected)
        const columnConfig = ['main_a'];
        const report = makeReport({
          columnConfig,
          filterConfig: [{ column: 'blended_b', operator: 'eq', value: 1 }] as any,
        });

        const blendedField = new BlendedFieldDto();
        blendedField.name = 'blended_b';
        blendedField.sourceRelationshipId = 'rel-1';
        blendedField.sourceDataMartId = 'dm-target-1';
        blendedField.sourceDataMartTitle = 'Target DM';
        blendedField.targetAlias = 'target_alias';
        blendedField.originalFieldName = 'b';
        blendedField.type = 'INTEGER';
        blendedField.isHidden = false;
        blendedField.aggregateFunction = 'SUM';
        blendedField.transitiveDepth = 1;
        blendedField.aliasPath = 'target_alias';
        blendedField.outputPrefix = 'target_alias';

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            {
              aliasPath: 'target_alias',
              title: 'Target DM',
              defaultAlias: 'target_alias',
              depth: 1,
              fieldCount: 1,
              isIncluded: true,
              isAccessibleForReporting: true,
              relationshipId: 'rel-1',
              dataMartId: 'dm-target-1',
            },
          ],
          blendedFields: [blendedField],
        });

        const mockRelationship = {
          id: 'rel-1',
          targetAlias: 'target_alias',
          sourceDataMart: { id: 'dm-1' },
          targetDataMart: { id: 'dm-target-1', title: 'Target DM' },
          joinConditions: [],
        } as unknown as DataMartRelationship;

        relationshipService.findBySourceDataMartId.mockResolvedValue([mockRelationship]);
        tableReferenceService.resolveTableName
          .mockResolvedValueOnce('`project.dataset.main_table`')
          .mockResolvedValueOnce('`project.dataset.target_table`');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        // hasBlendedColumns must be true because filter references a blended column
        expect(result.needsBlending).toBe(true);
        expect(blendedQueryBuilderFacade.buildBlendedQuery).toHaveBeenCalled();

        const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
        expect(context!.chains).toHaveLength(1);

        const chain = context!.chains[0];
        expect(chain.relationship.id).toBe('rel-1');
        // The blended_b field must be present in the chain
        expect(chain.blendedFields).toHaveLength(1);
        expect(chain.blendedFields[0].outputAlias).toBe('blended_b');
        // It is referenced only via filterConfig, so it must be hidden
        expect(chain.blendedFields[0].isHidden).toBe(true);
      });

      it('does not include blended chain if filterConfig references only a native column', async () => {
        const columnConfig = ['main_a'];
        const report = makeReport({
          columnConfig,
          filterConfig: [{ column: 'main_x', operator: 'eq', value: 'foo' }] as any,
        });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue(
          makeBlendableSchema(['blended_field'])
        );

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        // Neither columnConfig nor filterConfig references a blended column
        expect(result.needsBlending).toBe(false);
        expect(blendedQueryBuilderFacade.buildBlendedQuery).not.toHaveBeenCalled();
      });

      it('keeps isHidden=false when a blended field appears in both columnConfig and filterConfig', async () => {
        const columnConfig = ['blended_b'];
        const report = makeReport({
          columnConfig,
          filterConfig: [{ column: 'blended_b', operator: 'eq', value: 42 }] as any,
        });

        const blendedField = new BlendedFieldDto();
        blendedField.name = 'blended_b';
        blendedField.sourceRelationshipId = 'rel-1';
        blendedField.sourceDataMartId = 'dm-target-1';
        blendedField.sourceDataMartTitle = 'Target DM';
        blendedField.targetAlias = 'target_alias';
        blendedField.originalFieldName = 'b';
        blendedField.type = 'INTEGER';
        blendedField.isHidden = false;
        blendedField.aggregateFunction = 'SUM';
        blendedField.transitiveDepth = 1;
        blendedField.aliasPath = 'target_alias';
        blendedField.outputPrefix = 'target_alias';

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: [
            {
              aliasPath: 'target_alias',
              title: 'Target DM',
              defaultAlias: 'target_alias',
              depth: 1,
              fieldCount: 1,
              isIncluded: true,
              isAccessibleForReporting: true,
              relationshipId: 'rel-1',
              dataMartId: 'dm-target-1',
            },
          ],
          blendedFields: [blendedField],
        });

        const mockRelationship = {
          id: 'rel-1',
          targetAlias: 'target_alias',
          sourceDataMart: { id: 'dm-1' },
          targetDataMart: { id: 'dm-target-1', title: 'Target DM' },
          joinConditions: [],
        } as unknown as DataMartRelationship;

        relationshipService.findBySourceDataMartId.mockResolvedValue([mockRelationship]);
        tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.needsBlending).toBe(true);

        const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
        expect(context!.chains).toHaveLength(1);
        const field = context!.chains[0].blendedFields[0];
        expect(field.outputAlias).toBe('blended_b');
        // Present in columnConfig → must NOT be hidden
        expect(field.isHidden).toBe(false);
      });
    });

    describe('resolveBlendingDecision — orphaned column references', () => {
      function makeMainSchema(fields: object[]): DataMart['schema'] {
        return {
          type: 'bigquery-data-mart-schema',
          fields,
        } as unknown as DataMart['schema'];
      }

      function nativeField(name: string, overrides: object = {}): object {
        return { name, type: 'STRING', status: 'CONNECTED', ...overrides };
      }

      function mockChains(): void {
        relationshipService.findBySourceDataMartId.mockResolvedValue([
          {
            id: 'rel-0',
            targetAlias: 'alias_0',
            sourceDataMart: { id: 'dm-1' },
            targetDataMart: { id: 'dm-target-0', title: 'Target DM 0' },
            joinConditions: [],
          } as unknown as DataMartRelationship,
        ]);
        tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');
      }

      it('throws BusinessViolationException listing columns missing from both native schema and blended fields', async () => {
        const report = makeReport({
          columnConfig: ['date', 'page__pageGroup', 'page_hash__pageGroup', 'page_hash__pagePath'],
        });
        report.dataMart.schema = makeMainSchema([nativeField('date'), nativeField('sessionId')]);

        blendableSchemaService.computeBlendableSchema.mockResolvedValue(
          makeBlendableSchema(['page__pageGroup'])
        );

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          message: expect.stringContaining('"page_hash__pageGroup", "page_hash__pagePath"'),
          errorDetails: {
            unknownColumns: ['page_hash__pageGroup', 'page_hash__pagePath'],
            dataMartId: 'dm-1',
          },
        });

        expect(blendedQueryBuilderFacade.buildBlendedQuery).not.toHaveBeenCalled();
      });

      it('throws for orphaned references even when no valid blended column is selected (native path)', async () => {
        const report = makeReport({ columnConfig: ['date', 'page_hash__pageGroup'] });
        report.dataMart.schema = makeMainSchema([nativeField('date')]);

        blendableSchemaService.computeBlendableSchema.mockResolvedValue(
          makeBlendableSchema(['page__pageGroup'])
        );

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          errorDetails: { unknownColumns: ['page_hash__pageGroup'] },
        });
      });

      it('accepts nested struct paths and struct containers', async () => {
        const report = makeReport({
          columnConfig: ['date', 'user', 'user.email', 'blended_field'],
        });
        report.dataMart.schema = makeMainSchema([
          nativeField('date'),
          nativeField('user', { type: 'RECORD', fields: [nativeField('email')] }),
        ]);

        blendableSchemaService.computeBlendableSchema.mockResolvedValue(
          makeBlendableSchema(['blended_field'])
        );
        mockChains();

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.needsBlending).toBe(true);
        expect(blendedQueryBuilderFacade.buildBlendedQuery).toHaveBeenCalled();
      });

      it('passes recursive native field types to the blended query builder for nested post-join controls', async () => {
        const report = makeReport({
          columnConfig: ['user.created_at', 'blended_field'],
          filterConfig: [
            {
              column: 'user.created_at',
              operator: 'relative_date',
              value: { kind: 'last_n_days', n: 7 },
            },
          ],
          sortConfig: [{ column: 'user.created_at', direction: 'asc' }],
        });
        report.dataMart.schema = makeMainSchema([
          nativeField('user', { type: 'RECORD', fields: [nativeField('created_at')] }),
        ]);

        const schema = makeBlendableSchema(['blended_field']);
        schema.nativeFields = [
          {
            name: 'user',
            type: 'RECORD',
            status: 'CONNECTED',
            fields: [{ name: 'created_at', type: 'TIMESTAMP', status: 'CONNECTED' }],
          },
        ] as never;
        blendableSchemaService.computeBlendableSchema.mockResolvedValue(schema);
        mockChains();

        await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
        expect(context!.columnTypes?.postJoin?.get('user.created_at')).toBe('TIMESTAMP');
      });

      it('treats hidden-for-reporting native fields as no longer available', async () => {
        const report = makeReport({
          columnConfig: ['date', 'secret', 'user.hidden_child', 'blended_field'],
        });
        report.dataMart.schema = makeMainSchema([
          nativeField('date'),
          nativeField('secret', { isHiddenForReporting: true }),
          nativeField('user', {
            type: 'RECORD',
            fields: [nativeField('hidden_child', { isHiddenForReporting: true })],
          }),
        ]);

        blendableSchemaService.computeBlendableSchema.mockResolvedValue(
          makeBlendableSchema(['blended_field'])
        );

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          errorDetails: { unknownColumns: ['secret', 'user.hidden_child'] },
        });
      });

      it('treats blended fields hidden in the joined data marts setup as no longer available', async () => {
        const report = makeReport({
          columnConfig: ['date', 'alias__hidden_field', 'blended_field'],
        });
        report.dataMart.schema = makeMainSchema([nativeField('date')]);

        const schema = makeBlendableSchema(['blended_field', 'alias__hidden_field']);
        schema.blendedFields[1].isHidden = true;
        blendableSchemaService.computeBlendableSchema.mockResolvedValue(schema);
        mockChains();

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          errorDetails: { unknownColumns: ['alias__hidden_field'] },
        });

        expect(blendedQueryBuilderFacade.buildBlendedQuery).not.toHaveBeenCalled();
      });

      it('treats DISCONNECTED native fields as no longer available', async () => {
        const report = makeReport({ columnConfig: ['date', 'legacy', 'blended_field'] });
        report.dataMart.schema = makeMainSchema([
          nativeField('date'),
          nativeField('legacy', { status: 'DISCONNECTED' }),
        ]);

        blendableSchemaService.computeBlendableSchema.mockResolvedValue(
          makeBlendableSchema(['blended_field'])
        );

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toMatchObject({
          errorDetails: { unknownColumns: ['legacy'] },
        });
      });

      it('skips the check when the data mart schema is not actualized', async () => {
        const report = makeReport({ columnConfig: ['whatever_unknown', 'blended_field'] });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue(
          makeBlendableSchema(['blended_field'])
        );
        mockChains();

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.needsBlending).toBe(true);
      });
    });
  });
});
