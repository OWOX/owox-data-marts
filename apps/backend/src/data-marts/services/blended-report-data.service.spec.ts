import { Test, TestingModule } from '@nestjs/testing';
import { BlendedReportDataService } from './blended-report-data.service';
import { BlendableSchemaService } from './blendable-schema.service';
import { DataMartRelationshipService } from './data-mart-relationship.service';
import { DataMartTableReferenceService } from './data-mart-table-reference.service';
import { BlendedQueryBuilderFacade } from '../data-storage-types/facades/blended-query-builder.facade';
import { DataMartQueryBuilderFacade } from '../data-storage-types/facades/data-mart-query-builder.facade';
import { Report } from '../entities/report.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartRelationship } from '../entities/data-mart-relationship.entity';
import { BlendableSchemaDto, BlendedFieldDto } from '../dto/domain/blendable-schema.dto';
import { PublicOriginService } from '../../common/config/public-origin.service';

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
      ],
    }).compile();

    service = module.get(BlendedReportDataService);
    blendableSchemaService = module.get(BlendableSchemaService);
    relationshipService = module.get(DataMartRelationshipService);
    tableReferenceService = module.get(DataMartTableReferenceService);
    blendedQueryBuilderFacade = module.get(BlendedQueryBuilderFacade);
  });

  describe('resolveBlendingDecision', () => {
    it('returns needsBlending=false when columnConfig is null', async () => {
      const report = makeReport({ columnConfig: null });

      const result = await service.resolveBlendingDecision(report);

      expect(result).toEqual({ needsBlending: false });
      expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
    });

    it('returns needsBlending=false when columnConfig is undefined', async () => {
      const report = makeReport({ columnConfig: undefined });

      const result = await service.resolveBlendingDecision(report);

      expect(result).toEqual({ needsBlending: false });
    });

    it('returns needsBlending=false with columnFilter when no blended columns match', async () => {
      const columnConfig = ['native_field_1', 'native_field_2'];
      const report = makeReport({ columnConfig });

      blendableSchemaService.computeBlendableSchema.mockResolvedValue(
        makeBlendableSchema(['blended_field'])
      );

      const result = await service.resolveBlendingDecision(report);

      expect(result).toEqual({
        needsBlending: false,
        columnFilter: columnConfig,
        blendedDataHeaders: [],
      });
      expect(blendableSchemaService.computeBlendableSchema).toHaveBeenCalledWith(
        'dm-1',
        'project-1'
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

      const result = await service.resolveBlendingDecision(report);

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

      const result = await service.resolveBlendingDecision(report);

      // Only the blended column gets a header; native columns are resolved
      // by the reader's own headers generator.
      expect(result.blendedDataHeaders).toHaveLength(1);
      expect(result.blendedDataHeaders?.[0].name).toBe('my_alias__blended_col');
      // Exported header: "<outputPrefix> <fieldAlias|originalFieldName>".
      expect(result.blendedDataHeaders?.[0].alias).toBe('my_alias Blended Display');
      expect(result.blendedDataHeaders?.[0].description).toBe('Blended field description');
      expect(result.columnFilter).toEqual(columnConfig);
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

      await service.resolveBlendingDecision(report);

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

      await expect(service.resolveBlendingDecision(report)).rejects.toThrow(
        /outputAlias.+shared_alias.+collision|duplicate.+shared_alias/i
      );
    });

    it('throws when two chains share the same targetAlias (CTE name collision)', async () => {
      // A→B (alias="orders") and B→C (alias="orders") — both legit per-source but
      // would produce duplicate CTE names in the generated SQL.
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

      await expect(service.resolveBlendingDecision(report)).rejects.toThrow(
        /targetAlias.+orders.+collision|duplicate.+CTE.+orders/i
      );
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

      await service.resolveBlendingDecision(report);

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
  });
});
