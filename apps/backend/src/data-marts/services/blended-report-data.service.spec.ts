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
    availableSources: [],
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
  let _queryBuilderFacade: jest.Mocked<DataMartQueryBuilderFacade>;

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
    _queryBuilderFacade = module.get(DataMartQueryBuilderFacade);
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

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [],
        blendedFields: [blendedField],
      });

      const mockRelationship = {
        id: 'rel-1',
        targetAlias: 'target_alias',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-target-1' },
        joinConditions: [],
        blendedFields: [],
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

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [],
        blendedFields: [blendedField],
      });

      const mockRel = {
        id: 'rel-1',
        targetAlias: 'alias_1',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-target' },
        joinConditions: [],
        blendedFields: [],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([mockRel]);
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

      const result = await service.resolveBlendingDecision(report);

      // Only the blended column gets a header; native columns are resolved
      // by the reader's own headers generator.
      expect(result.blendedDataHeaders).toHaveLength(1);
      expect(result.blendedDataHeaders?.[0].name).toBe('my_alias__blended_col');
      expect(result.blendedDataHeaders?.[0].alias).toBe('Blended Display');
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

      blendableSchemaService.computeBlendableSchema.mockResolvedValue({
        nativeFields: [],
        availableSources: [],
        blendedFields: [blendedField],
      });

      const mockRel = {
        id: 'rel-1',
        targetAlias: 'alias_1',
        sourceDataMart: { id: 'dm-1' },
        targetDataMart: { id: 'dm-target' },
        joinConditions: [],
        blendedFields: [],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([mockRel]);
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

      await service.resolveBlendingDecision(report);

      const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
      expect(context?.chains[0].parentAlias).toBe('main');
    });
  });
});
