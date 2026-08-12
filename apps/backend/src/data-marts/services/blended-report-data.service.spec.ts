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
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import {
  AvailableSourceDto,
  BlendableSchemaDto,
  BlendedFieldDto,
} from '../dto/domain/blendable-schema.dto';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { UserProjectionsFetcherService } from './user-projections-fetcher.service';
import { UserProjectionDto } from '../../idp/dto/domain/user-projection.dto';
import { BigQueryBlendedQueryBuilder } from '../data-storage-types/bigquery/services/bigquery-blended-query-builder';
import { BigQueryClauseRenderer } from '../data-storage-types/bigquery/services/bigquery-clause-renderer';

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
  let outputControlsValidator: jest.Mocked<OutputControlsValidatorService>;

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
    outputControlsValidator = module.get(OutputControlsValidatorService);
  });

  describe('resolveBlendingDecision', () => {
    it('returns needsBlending=false when columnConfig is null', async () => {
      const report = makeReport({ columnConfig: null });

      const result = await service.resolveBlendingDecision(report, {
        userId: 'user-1',
        roles: ['admin'],
      });

      expect(result).toEqual({ needsBlending: false, primaryKeyColumns: [] });
      expect(blendableSchemaService.computeBlendableSchema).not.toHaveBeenCalled();
    });

    it('returns needsBlending=false when columnConfig is undefined', async () => {
      const report = makeReport({ columnConfig: undefined });

      const result = await service.resolveBlendingDecision(report, {
        userId: 'user-1',
        roles: ['admin'],
      });

      expect(result).toEqual({ needsBlending: false, primaryKeyColumns: [] });
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
        primaryKeyColumns: [],
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

    // The joined-field label convention is per destination: Google Sheets writes it into a narrow
    // header cell and puts the data mart name last, everything else keeps it as a prefix. A read
    // plan (totals / HTTP data / MCP) carries no destination and therefore keeps the prefix too.
    it.each([
      {
        case: 'a Google Sheets destination',
        destinationType: DataDestinationType.GOOGLE_SHEETS,
        expectedAlias: 'Blended Display (my_alias)',
      },
      {
        case: 'a Looker Studio destination',
        destinationType: DataDestinationType.LOOKER_STUDIO,
        expectedAlias: 'my_alias Blended Display',
      },
      {
        case: 'no destination at all',
        destinationType: undefined,
        expectedAlias: 'my_alias Blended Display',
      },
    ])(
      'populates blendedDataHeaders for blended columns only, with $case (native cols are reader-resolved)',
      async ({ destinationType, expectedAlias }) => {
        const columnConfig = ['native_col', 'my_alias__blended_col'];
        const report = makeReport({
          columnConfig,
          ...(destinationType ? { dataDestination: { type: destinationType } } : {}),
        } as Partial<Report>);

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
        expect(result.blendedDataHeaders?.[0].alias).toBe(expectedAlias);
        expect(result.blendedDataHeaders?.[0].description).toBe('Blended field description');
        expect(result.columnFilter).toEqual(columnConfig);
      }
    );

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

    describe('COUNT beside a joined COUNT_DISTINCT', () => {
      const joinedReport = (aggregationConfig: NonNullable<Report['aggregationConfig']>) =>
        makeReport({ columnConfig: ['blended_field'], aggregationConfig });

      const withJoinedStringField = () => {
        const blendedField = new BlendedFieldDto();
        blendedField.name = 'blended_field';
        blendedField.sourceRelationshipId = 'rel-1';
        blendedField.sourceDataMartId = 'dm-target';
        blendedField.sourceDataMartTitle = 'Target';
        blendedField.targetAlias = 'alias_1';
        blendedField.originalFieldName = 'field';
        blendedField.type = 'STRING';
        blendedField.isHidden = false;
        blendedField.aggregateFunction = 'ANY_VALUE';
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

        relationshipService.findBySourceDataMartId.mockResolvedValue([
          {
            id: 'rel-1',
            targetAlias: 'alias_1',
            sourceDataMart: { id: 'dm-1' },
            targetDataMart: { id: 'dm-target', title: 'Target' },
            joinConditions: [{ sourceFieldName: 'a', targetFieldName: 'b' }],
          } as unknown as DataMartRelationship,
        ]);
        tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');
      };

      it('drops the COUNT from the built query and reports the normalised list', async () => {
        withJoinedStringField();
        const aggregationConfig: NonNullable<Report['aggregationConfig']> = [
          { column: 'blended_field', function: 'COUNT' },
          { column: 'blended_field', function: 'COUNT_DISTINCT' },
        ];
        const report = joinedReport(aggregationConfig);

        const decision = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
        expect(context?.aggregations).toEqual([
          { column: 'blended_field', function: 'COUNT_DISTINCT' },
        ]);
        // Readers emit one header per (column, function); without this they would emit a
        // `| COUNT` header the SQL no longer has.
        expect(decision.aggregations).toEqual([
          { column: 'blended_field', function: 'COUNT_DISTINCT' },
        ]);
        expect(report.aggregationConfig).toBe(aggregationConfig);
      });

      it('leaves a lone joined COUNT alone', async () => {
        withJoinedStringField();
        const report = joinedReport([{ column: 'blended_field', function: 'COUNT' }]);

        const decision = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
        expect(context?.aggregations).toEqual([{ column: 'blended_field', function: 'COUNT' }]);
        expect(decision.aggregations).toBeUndefined();
      });
    });

    it("carries the joined Data Mart's declared primary key onto its chain", async () => {
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
      blendedField.aggregateFunction = 'ANY_VALUE';
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
        targetDataMart: {
          id: 'dm-target',
          title: 'Target',
          schema: {
            fields: [
              { name: 'org_key', type: 'STRING', status: 'CONNECTED', isPrimaryKey: true },
              {
                name: 'tenant',
                type: 'STRING',
                status: 'CONNECTED',
                isPrimaryKey: true,
                isHiddenForReporting: true,
              },
              { name: 'field', type: 'STRING', status: 'CONNECTED', isPrimaryKey: false },
            ],
          },
        },
        joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'org_key' }],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([mockRel]);
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

      await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

      const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
      expect(context?.chains[0].targetPrimaryKeyFields).toEqual(['org_key', 'tenant']);
    });

    it('drops the whole key when one component is gone from the source', async () => {
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
      blendedField.aggregateFunction = 'ANY_VALUE';
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
        targetDataMart: {
          id: 'dm-target',
          title: 'Target',
          schema: {
            fields: [
              { name: 'date', type: 'DATE', status: 'CONNECTED', isPrimaryKey: true },
              {
                name: 'campaign_id',
                type: 'STRING',
                status: 'DISCONNECTED',
                isPrimaryKey: true,
              },
              { name: 'field', type: 'STRING', status: 'CONNECTED', isPrimaryKey: false },
            ],
          },
        },
        joinConditions: [{ sourceFieldName: 'org_id', targetFieldName: 'date' }],
      } as unknown as DataMartRelationship;

      relationshipService.findBySourceDataMartId.mockResolvedValue([mockRel]);
      tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
      blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

      await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

      const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
      expect(context?.chains[0].targetPrimaryKeyFields).toEqual([]);
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
          primaryKeyColumns: [],
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

      it('does NOT reject an EXCLUDED-but-accessible source referenced via a POST-join filter (documents current behavior)', async () => {
        // Counterpart to the pre-join-slice test above. The exclusion guard covers ONLY pre-join
        // slices: an excluded (isIncluded:false) source that the caller's role CAN report on
        // (isAccessibleForReporting:true) is NOT rejected when named via columnConfig or a
        // post-join filter — it resolves and builds the blend, exactly as the regular report run
        // path does (both go through this same method). The role gate (isAccessibleForReporting)
        // is still enforced; isIncluded is a blend-config hint that the FE picker (report builder
        // AND MCP discovery) hides but the backend does not enforce here. So MCP mirrors the
        // platform — aligning discovery and the run path on exclusion is a platform-wide decision,
        // not an MCP-local one. This test locks that current behavior.
        const report = makeReport({
          columnConfig: ['b__field'],
          filterConfig: [
            { column: 'excluded__field', operator: 'eq', value: 'x', placement: 'post-join' },
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
          {
            id: 'rel-excluded',
            targetAlias: 'excluded',
            sourceDataMart: { id: 'dm-1' },
            targetDataMart: { id: 'dm-excluded', title: 'Excluded DM' },
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

      // A Totals plan projects ONLY metrics and carries no HAVING in filterConfig — its dimensions
      // and metric filters live in `groupRestriction`. The emitted SQL still references
      // them, so they must count as referenced columns here: otherwise a joined restriction
      // dimension never reaches the chain builder, its qualifier falls back to `main."<alias>"`
      // (unrecognized name), and a plan whose only blended reference was that dimension is routed
      // to the flat builder altogether.
      it('extends the join chain for a blended dimension referenced only by groupRestriction', async () => {
        const report = {
          ...makeReport({ columnConfig: ['main_a'] }),
          groupRestriction: {
            dimensions: ['blended_b'],
            having: [{ column: 'main_a', function: 'SUM', operator: 'gt', value: 1 }],
          },
        } as unknown as Report;

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

        relationshipService.findBySourceDataMartId.mockResolvedValue([
          {
            id: 'rel-1',
            targetAlias: 'target_alias',
            sourceDataMart: { id: 'dm-1' },
            targetDataMart: { id: 'dm-target-1', title: 'Target DM' },
            joinConditions: [],
          } as unknown as DataMartRelationship,
        ]);
        tableReferenceService.resolveTableName
          .mockResolvedValueOnce('`project.dataset.main_table`')
          .mockResolvedValueOnce('`project.dataset.target_table`');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.needsBlending).toBe(true);
        const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
        expect(context!.chains).toHaveLength(1);
        expect(context!.chains[0].blendedFields[0].outputAlias).toBe('blended_b');
        // ...and the restriction itself reaches the builder, or there is nothing to join on.
        expect(context!.groupRestriction?.dimensions).toEqual(['blended_b']);
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

    describe('rowCount driven by aggregationConfig (blended path)', () => {
      async function resolveAndCaptureRowCount(
        overrides: Partial<Report>
      ): Promise<boolean | undefined> {
        const report = makeReport({ columnConfig: ['blended_field'], ...overrides });

        const blendedField = new BlendedFieldDto();
        blendedField.name = 'blended_field';
        blendedField.sourceRelationshipId = 'rel-1';
        blendedField.sourceDataMartId = 'dm-target-1';
        blendedField.sourceDataMartTitle = 'Target DM';
        blendedField.targetAlias = 'target_alias';
        blendedField.originalFieldName = 'field';
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
          targetDataMart: { id: 'dm-target-1' },
          joinConditions: [],
        } as unknown as DataMartRelationship;

        relationshipService.findBySourceDataMartId.mockResolvedValue([mockRelationship]);
        tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

        await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

        const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
        return context?.rowCount;
      }

      it('passes rowCount=true to buildBlendedQuery when aggregationConfig is non-empty', async () => {
        const rowCount = await resolveAndCaptureRowCount({
          aggregationConfig: [{ column: 'field', function: 'SUM' }] as any,
        });
        expect(rowCount).toBe(true);
      });

      it('passes rowCount=false to buildBlendedQuery when aggregationConfig is empty', async () => {
        const rowCount = await resolveAndCaptureRowCount({
          aggregationConfig: [],
        });
        expect(rowCount).toBe(false);
      });

      it('passes rowCount=false when aggregationConfig is absent', async () => {
        const rowCount = await resolveAndCaptureRowCount({
          aggregationConfig: undefined,
        });
        expect(rowCount).toBe(false);
      });
    });

    describe('uniqueCount and primaryKeyColumns passed to buildBlendedQuery', () => {
      function makeBlendedFieldForUniqueCount(): BlendedFieldDto {
        const blendedField = new BlendedFieldDto();
        blendedField.name = 'blended_field';
        blendedField.sourceRelationshipId = 'rel-1';
        blendedField.sourceDataMartId = 'dm-target-1';
        blendedField.sourceDataMartTitle = 'Target DM';
        blendedField.targetAlias = 'target_alias';
        blendedField.originalFieldName = 'field';
        blendedField.type = 'INTEGER';
        blendedField.isHidden = false;
        blendedField.aggregateFunction = 'SUM';
        blendedField.transitiveDepth = 1;
        blendedField.aliasPath = 'target_alias';
        blendedField.outputPrefix = 'target_alias';
        return blendedField;
      }

      async function resolveAndCaptureUniqueCountContext(
        overrides: Partial<Report>,
        schemaFields?: object[]
      ): Promise<{ uniqueCount: unknown; primaryKeyColumns: unknown }> {
        const storage = { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY } as DataStorage;
        const dataMart = {
          id: 'dm-1',
          title: 'Main DM',
          projectId: 'project-1',
          storage,
          definition: { sqlQuery: 'SELECT 1' },
          schema: schemaFields ? { fields: schemaFields } : undefined,
        } as unknown as DataMart;

        const report = {
          id: 'report-1',
          title: 'Test Report',
          dataMart,
          columnConfig: ['blended_field'],
          ...overrides,
        } as Report;

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
          blendedFields: [makeBlendedFieldForUniqueCount()],
        });

        const mockRelationship = {
          id: 'rel-1',
          targetAlias: 'target_alias',
          sourceDataMart: { id: 'dm-1' },
          targetDataMart: { id: 'dm-target-1' },
          joinConditions: [],
        } as unknown as DataMartRelationship;

        relationshipService.findBySourceDataMartId.mockResolvedValue([mockRelationship]);
        tableReferenceService.resolveTableName.mockResolvedValue('table_ref');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT ...');

        await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

        const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
        return {
          uniqueCount: context?.uniqueCount,
          primaryKeyColumns: context?.primaryKeyColumns,
        };
      }

      it('passes uniqueCount=true when uniqueCountConfig is true', async () => {
        const { uniqueCount } = await resolveAndCaptureUniqueCountContext({
          uniqueCountConfig: true,
        });
        expect(uniqueCount).toBe(true);
      });

      it('passes uniqueCount=false when uniqueCountConfig is false', async () => {
        const { uniqueCount } = await resolveAndCaptureUniqueCountContext({
          uniqueCountConfig: false,
        });
        expect(uniqueCount).toBe(false);
      });

      it('passes uniqueCount=false when uniqueCountConfig is absent', async () => {
        const { uniqueCount } = await resolveAndCaptureUniqueCountContext({
          uniqueCountConfig: undefined,
        });
        expect(uniqueCount).toBe(false);
      });

      it('passes primaryKeyColumns from the main DM schema PK fields', async () => {
        const schemaFields = [
          { name: 'user_id', type: 'STRING', isPrimaryKey: true },
          { name: 'date', type: 'DATE', isPrimaryKey: false },
        ];
        const { primaryKeyColumns } = await resolveAndCaptureUniqueCountContext(
          { uniqueCountConfig: true },
          schemaFields
        );
        expect(primaryKeyColumns).toEqual(['user_id']);
      });

      it('passes empty primaryKeyColumns when schema has no PK fields', async () => {
        const schemaFields = [
          { name: 'user_id', type: 'STRING', isPrimaryKey: false },
          { name: 'date', type: 'DATE', isPrimaryKey: false },
        ];
        const { primaryKeyColumns } = await resolveAndCaptureUniqueCountContext(
          { uniqueCountConfig: true },
          schemaFields
        );
        expect(primaryKeyColumns).toEqual([]);
      });

      it('passes composite primaryKeyColumns for multi-field PK', async () => {
        const schemaFields = [
          { name: 'project_id', type: 'STRING', isPrimaryKey: true },
          { name: 'user_id', type: 'STRING', isPrimaryKey: true },
        ];
        const { primaryKeyColumns } = await resolveAndCaptureUniqueCountContext(
          { uniqueCountConfig: true },
          schemaFields
        );
        expect(primaryKeyColumns).toEqual(['project_id', 'user_id']);
      });
    });

    describe('validateForReport chokepoint (schema-drift)', () => {
      it('forwards uniqueCountConfig so the run path re-validates the PK gate', async () => {
        const report = makeReport({ columnConfig: ['native_field'], uniqueCountConfig: true });

        blendableSchemaService.computeBlendableSchema.mockResolvedValue(makeBlendableSchema([]));

        await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

        expect(outputControlsValidator.validateForReport).toHaveBeenCalledWith(
          expect.objectContaining({ uniqueCountConfig: true })
        );
      });
    });

    describe('joined Unique Count sources (#6792)', () => {
      interface JoinedSourceSpec {
        aliasPath: string;
        defaultAlias: string;
        relationshipId: string;
        primaryKey?: string[];
        accessible?: boolean;
        included?: boolean;
      }

      const ORDERS: JoinedSourceSpec = {
        aliasPath: 'orders',
        defaultAlias: 'Orders',
        relationshipId: 'rel-orders',
        primaryKey: ['order_id'],
      };
      const ITEMS: JoinedSourceSpec = {
        aliasPath: 'orders.items',
        defaultAlias: 'Items',
        relationshipId: 'rel-items',
        primaryKey: ['item_id'],
      };

      function makeJoinedReport(
        overrides: Partial<Report>,
        sources: JoinedSourceSpec[],
        mainPrimaryKey: string[] = ['user_id']
      ): Report {
        const storage = { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY } as DataStorage;
        const dataMart = {
          id: 'dm-1',
          title: 'Main DM',
          projectId: 'project-1',
          storage,
          definition: { sqlQuery: 'SELECT 1' },
          schema: {
            fields: [
              { name: 'customer_email', type: 'STRING' },
              ...mainPrimaryKey.map(name => ({ name, type: 'STRING', isPrimaryKey: true })),
            ],
          },
        } as unknown as DataMart;

        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          nativeFields: [],
          availableSources: sources.map((s, i) => ({
            aliasPath: s.aliasPath,
            title: `${s.defaultAlias} DM`,
            defaultAlias: s.defaultAlias,
            depth: s.aliasPath.split('.').length,
            fieldCount: 1,
            isIncluded: s.included ?? true,
            isAccessibleForReporting: s.accessible ?? true,
            relationshipId: s.relationshipId,
            dataMartId: `dm-${i}`,
          })),
          blendedFields: sources.map(s => {
            const field = new BlendedFieldDto();
            field.name = `${s.aliasPath.split('.').join('_')}__status`;
            field.sourceRelationshipId = s.relationshipId;
            field.sourceDataMartId = 'dm-x';
            field.sourceDataMartTitle = `${s.defaultAlias} DM`;
            field.targetAlias = s.aliasPath.split('.').slice(-1)[0];
            field.originalFieldName = 'status';
            field.type = 'STRING';
            field.isHidden = false;
            field.aggregateFunction = 'STRING_AGG';
            field.transitiveDepth = 1;
            field.aliasPath = s.aliasPath;
            field.outputPrefix = s.defaultAlias;
            return field;
          }),
        });

        const relationships = sources.map(
          s =>
            ({
              id: s.relationshipId,
              targetAlias: s.aliasPath.split('.').slice(-1)[0],
              sourceDataMart: { id: 'dm-1' },
              targetDataMart: {
                id: `dm-${s.relationshipId}`,
                title: `${s.defaultAlias} DM`,
                schema: {
                  fields: (s.primaryKey ?? []).map(name => ({
                    name,
                    type: 'STRING',
                    isPrimaryKey: true,
                  })),
                },
              },
              joinConditions: [{ sourceFieldName: 'customer_id', targetFieldName: 'customer_id' }],
            }) as unknown as DataMartRelationship
        );
        relationshipService.findBySourceDataMartId.mockResolvedValue(relationships);
        relationshipService.findByIds.mockResolvedValue(relationships);
        tableReferenceService.resolveTableName.mockResolvedValue('`p.d.t`');
        blendedQueryBuilderFacade.buildBlendedQuery.mockResolvedValue('SELECT 1');

        return {
          id: 'report-1',
          title: 'Test Report',
          dataMart,
          columnConfig: ['customer_email'],
          ...overrides,
        } as Report;
      }

      function capturedContext() {
        const [, context] = blendedQueryBuilderFacade.buildBlendedQuery.mock.calls[0];
        return context;
      }

      // The headline case: the ONLY blended content is a joined Unique Count. Nothing else drags
      // the report onto the blended path, so every seeding site has to let it through.
      it('blends a report whose only blended content is a joined Unique Count', async () => {
        const report = makeJoinedReport({ uniqueCountConfig: ['orders'] }, [ORDERS]);

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.needsBlending).toBe(true);
        expect(result.chains?.map(c => c.cteName)).toEqual(['orders']);
        expect(capturedContext()?.uniqueCountSources).toEqual([
          {
            aliasPath: 'orders',
            cteName: 'orders',
            pkColumns: ['order_id'],
            outputLabel: 'orders__unique_count',
            displayLabel: 'Orders Unique Count',
          },
        ]);
      });

      // query_data_mart's pseudo-field split (#6792) can leave `fields` — this report's
      // `columnConfig` — as an explicit EMPTY array (e.g. "how many unique orders in total",
      // where the pseudo-field was the only requested field). That must NOT take the
      // `columnConfig === null` branch above (which requires an explicit column selection and
      // throws for a blended reference) — `[]` already IS an explicit selection, just an empty
      // one, and the joined Unique Count is a synthetic column that needs no companion dimension.
      it('blends on an explicit EMPTY columnConfig ([], not null) when the only content is a joined Unique Count', async () => {
        const report = makeJoinedReport({ columnConfig: [], uniqueCountConfig: ['orders'] }, [
          ORDERS,
        ]);

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.needsBlending).toBe(true);
        expect(result.uniqueCountSources?.map(s => s.aliasPath)).toEqual(['orders']);
      });

      it('the decision and the query context share ONE source list (no second derivation)', async () => {
        const report = makeJoinedReport({ uniqueCountConfig: ['orders'] }, [ORDERS]);

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.uniqueCountSources).toBe(capturedContext()?.uniqueCountSources);
      });

      it('pulls a nested source ancestor into the chains and labels it with its OWN prefix', async () => {
        const report = makeJoinedReport({ uniqueCountConfig: ['orders.items'] }, [ORDERS, ITEMS]);

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.chains?.map(c => c.cteName)).toEqual(['orders', 'orders_items']);
        expect(result.uniqueCountSources).toEqual([
          {
            aliasPath: 'orders.items',
            cteName: 'orders_items',
            pkColumns: ['item_id'],
            outputLabel: 'orders_items__unique_count',
            displayLabel: 'Items Unique Count',
          },
        ]);
      });

      // `defaultAlias` is free-form and set per relationship, so two joined sources can carry the
      // same one and both headers then read `Orders Unique Count`. That is the convention, not a
      // defect: a uniqueness-driven label makes a column's header depend on which OTHER columns
      // happen to be selected. Every ordinary joined field of those two sources already collides
      // the same way. The SQL names — what a reader binds by — stay distinct.
      it('labels two sources sharing a display prefix alike, keeping the SQL names distinct', async () => {
        const LEGACY: JoinedSourceSpec = {
          aliasPath: 'legacy_orders',
          defaultAlias: 'Orders',
          relationshipId: 'rel-legacy',
          primaryKey: ['order_id'],
        };
        const report = makeJoinedReport({ uniqueCountConfig: ['orders', 'legacy_orders'] }, [
          ORDERS,
          LEGACY,
        ]);

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.uniqueCountSources?.map(s => s.displayLabel)).toEqual([
          'Orders Unique Count',
          'Orders Unique Count',
        ]);
        expect(result.uniqueCountSources?.map(s => s.outputLabel)).toEqual([
          'orders__unique_count',
          'legacy_orders__unique_count',
        ]);
      });

      // A relationship saved without a display alias would otherwise label the metric with the bare
      // `Unique Count` — the MAIN Data Mart's own header, which then collides with it in the
      // produced file. Falls back to the Data Mart's title, exactly as the picker's row does.
      it('falls back to the Data Mart title when the display alias is blank', async () => {
        // The fixture titles a source `<defaultAlias> DM`, so a blank alias leaves the bare `DM`.
        const report = makeJoinedReport({ uniqueCountConfig: ['orders'] }, [
          { ...ORDERS, defaultAlias: '   ' },
        ]);

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.uniqueCountSources?.[0].displayLabel).toBe('DM Unique Count');
      });

      // The metric is a joined field like any other, so its header follows the SAME per-destination
      // convention (`formatBlendedFieldDisplayName`): Google Sheets writes it into a narrow cell
      // and puts the Data Mart name last, everything else keeps it in front.
      it.each([
        {
          case: 'a Google Sheets destination',
          destinationType: DataDestinationType.GOOGLE_SHEETS,
          expected: 'Unique Count (Orders)',
        },
        {
          case: 'a Looker Studio destination',
          destinationType: DataDestinationType.LOOKER_STUDIO,
          expected: 'Orders Unique Count',
        },
        {
          case: 'no destination at all',
          destinationType: undefined,
          expected: 'Orders Unique Count',
        },
      ])(
        'labels the joined Unique Count header for $case',
        async ({ destinationType, expected }) => {
          const report = makeJoinedReport(
            {
              uniqueCountConfig: ['orders'],
              ...(destinationType ? { dataDestination: { type: destinationType } } : {}),
            } as Partial<Report>,
            [ORDERS]
          );

          const result = await service.resolveBlendingDecision(report, {
            userId: 'user-1',
            roles: ['admin'],
          });

          expect(result.uniqueCountSources?.[0].displayLabel).toBe(expected);
          // The SQL name never moves — readers bind result rows to headers by it.
          expect(result.uniqueCountSources?.[0].outputLabel).toBe('orders__unique_count');
        }
      );

      it('drops a source whose primary key is gone, keeping the others (F4 at source level)', async () => {
        const report = makeJoinedReport({ uniqueCountConfig: ['orders', 'orders.items'] }, [
          { ...ORDERS, primaryKey: [] },
          ITEMS,
        ]);

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.uniqueCountSources?.map(s => s.aliasPath)).toEqual(['orders.items']);
      });

      it('drops a source whose alias path no longer exists', async () => {
        const report = makeJoinedReport({ uniqueCountConfig: ['ghost'] }, [ORDERS]);

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.uniqueCountSources).toEqual([]);
      });

      it('rejects a Unique Count on a source the user cannot read', async () => {
        const report = makeJoinedReport({ uniqueCountConfig: ['orders'] }, [
          { ...ORDERS, accessible: false },
        ]);

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toThrow(/missing access to data marts/);
      });

      it('keeps the main Unique Count on its own route (no joined source, no sleeve list)', async () => {
        const report = makeJoinedReport({ uniqueCountConfig: ['', 'orders'] }, [ORDERS]);

        await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

        expect(capturedContext()?.uniqueCount).toBe(true);
        expect(capturedContext()?.primaryKeyColumns).toEqual(['user_id']);
        expect(capturedContext()?.uniqueCountSources?.map(s => s.aliasPath)).toEqual(['orders']);
      });

      it('keeps the free-form source title out of the SQL name (dots would break BigQuery)', () => {
        // `defaultAlias` is `sourceConfig?.alias ?? targetDataMart.title` — free-form, and
        // blendable-schema.service.ts states it "must never flow into SQL identifiers". A Data Mart
        // titled `GA4.Events` must still yield a legal output column.
        const report = makeJoinedReport({ uniqueCountConfig: ['orders'] }, [
          { ...ORDERS, defaultAlias: 'GA4.Events' },
        ]);

        return service
          .resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
          .then(result => {
            expect(result.uniqueCountSources?.[0].outputLabel).toBe('orders__unique_count');
            expect(result.uniqueCountSources?.[0].displayLabel).toBe('GA4.Events Unique Count');
          });
      });

      it('drops a source excluded from reporting', async () => {
        const report = makeJoinedReport({ uniqueCountConfig: ['orders', 'orders.items'] }, [
          { ...ORDERS, included: false },
          ITEMS,
        ]);

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.uniqueCountSources?.map(s => s.aliasPath)).toEqual(['orders.items']);
      });

      // `columnConfig: null` means "every native column", which the blended builder cannot express
      // — it needs an explicit list. The metric must not vanish without a word.
      it('fails loudly for a joined Unique Count with no explicit column selection', async () => {
        const report = makeJoinedReport({ columnConfig: null, uniqueCountConfig: ['orders'] }, [
          ORDERS,
        ]);

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toThrow(/require an explicit column selection/);
      });

      // A stale source used to buy a schema lookup and a quiet `needsBlending: false` here. That
      // leniency could never run: validateForReport is called unconditionally above and refuses a
      // null projection for ANY joined Unique Count source, live or stale
      // (JOINED_UNIQUE_COUNT_REQUIRES_COLUMN_CONFIG), so the decision is taken before this point.
      it('does not special-case a STALE source on a null projection', async () => {
        const report = makeJoinedReport({ columnConfig: null, uniqueCountConfig: ['ghost'] }, [
          ORDERS,
        ]);

        await expect(
          service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] })
        ).rejects.toThrow(/require an explicit column selection/);
        expect(outputControlsValidator.validateForReport).toHaveBeenCalledWith(
          expect.objectContaining({ columnConfig: null, uniqueCountConfig: ['ghost'] })
        );
      });

      // End to end for #6764's promise that Unique Count sorts "like any other column": the sort
      // rule survives the decision, reaches the builder, and renders against the outer SELECT
      // alias — the raw CTEs must never be asked for a column named after a synthetic metric.
      it('carries a sort on a joined Unique Count through to runnable SQL', async () => {
        const report = makeJoinedReport(
          {
            columnConfig: ['customer_email'],
            uniqueCountConfig: ['orders'],
            sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
          },
          [ORDERS]
        );

        await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

        expect(capturedContext()?.sort).toEqual([
          { column: 'orders__unique_count', direction: 'desc' },
        ]);
        const { sql } = new BigQueryBlendedQueryBuilder(
          new BigQueryClauseRenderer()
        ).buildBlendedQuery(capturedContext()!);

        expect(sql).toContain(
          'COALESCE(ANY_VALUE(sleeve_uc_orders.orders__unique_count), 0) AS orders__unique_count'
        );
        expect(sql).toContain('ORDER BY\n  `orders__unique_count` DESC');
        const mainCte = /main AS \(([\s\S]+?)\n {2}\)/m.exec(sql);
        expect(mainCte).not.toBeNull();
        expect(mainCte![1]).not.toContain('orders__unique_count');
      });

      // A scheduled run never reopens the editor that prunes the stale rule, so the sort has to
      // degrade with the metric it points at — otherwise ORDER BY names an alias the SELECT lost.
      it.each([
        ['its primary key is gone', { ...ORDERS, primaryKey: [] }],
        ['it is excluded from reporting', { ...ORDERS, included: false }],
      ])('drops a sort on a joined Unique Count when %s', async (_case, source) => {
        const report = makeJoinedReport(
          {
            columnConfig: ['customer_email'],
            uniqueCountConfig: ['orders'],
            sortConfig: [
              { column: 'orders__unique_count', direction: 'desc' },
              { column: 'customer_email', direction: 'asc' },
            ],
          },
          [source]
        );

        const result = await service.resolveBlendingDecision(report, {
          userId: 'user-1',
          roles: ['admin'],
        });

        expect(result.uniqueCountSources).toEqual([]);
        expect(capturedContext()?.sort).toEqual([{ column: 'customer_email', direction: 'asc' }]);
        const { sql } = new BigQueryBlendedQueryBuilder(
          new BigQueryClauseRenderer()
        ).buildBlendedQuery(capturedContext()!);
        expect(sql).not.toContain('orders__unique_count');
      });

      // The pseudo-metric's name can be owned by a REAL field (#6792) — then the rule sorts by that
      // field and survives the source being dropped.
      it('keeps the sort when a real joined field owns the Unique Count name', async () => {
        const report = makeJoinedReport(
          {
            columnConfig: ['orders__status'],
            uniqueCountConfig: ['orders'],
            sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
          },
          [{ ...ORDERS, primaryKey: [] }]
        );
        const schema = await blendableSchemaService.computeBlendableSchema(
          'dm-1',
          'project-1',
          {} as never
        );
        const realField = new BlendedFieldDto();
        Object.assign(realField, schema.blendedFields[0], { name: 'orders__unique_count' });
        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          ...schema,
          blendedFields: [...schema.blendedFields, realField],
        });

        await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

        expect(capturedContext()?.sort).toEqual([
          { column: 'orders__unique_count', direction: 'desc' },
        ]);
      });

      // A HIDDEN field is not projected and cannot be sorted by — the picker's repair excludes it
      // from the names it treats as owned, and keeping the rule here meant a scheduled run sorted
      // by it while merely opening the editor deleted the rule on the next save.
      it('drops the sort when the real field owning the name is hidden', async () => {
        const report = makeJoinedReport(
          {
            columnConfig: ['orders__status'],
            uniqueCountConfig: ['orders'],
            sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
          },
          [{ ...ORDERS, primaryKey: [] }]
        );
        const schema = await blendableSchemaService.computeBlendableSchema(
          'dm-1',
          'project-1',
          {} as never
        );
        const hiddenField = new BlendedFieldDto();
        Object.assign(hiddenField, schema.blendedFields[0], {
          name: 'orders__unique_count',
          isHidden: true,
        });
        blendableSchemaService.computeBlendableSchema.mockResolvedValue({
          ...schema,
          blendedFields: [...schema.blendedFields, hiddenField],
        });

        await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });

        expect(capturedContext()?.sort).toEqual([]);
      });

      // A source `resolveUniqueCountSources` dropped still had its CTE and LEFT JOIN emitted: a
      // paid warehouse scan feeding a column nobody reads.
      describe('a dropped source must not still be joined (F11)', () => {
        it.each([
          ['its primary key is gone', { ...ORDERS, primaryKey: [] }],
          ['it is excluded from reporting', { ...ORDERS, included: false }],
        ])(
          'drops the chain of a source seeded ONLY by a Unique Count, when %s',
          async (_case, source) => {
            const report = makeJoinedReport(
              { columnConfig: ['customer_email'], uniqueCountConfig: ['orders'] },
              [source]
            );

            const result = await service.resolveBlendingDecision(report, {
              userId: 'user-1',
              roles: ['admin'],
            });

            expect(result.uniqueCountSources).toEqual([]);
            expect(result.chains).toEqual([]);
            expect(capturedContext()?.chains).toEqual([]);
          }
        );

        // The narrowness that makes this safe: `buildRelationshipChains` is deliberately NOT
        // filtered by `isIncluded`, and an excluded source's fields stay selectable, filterable and
        // sortable — they resolve precisely BECAUSE the join is built unconditionally. Dropping a
        // dead Unique Count's chain must never take an ordinary reference down with it.
        it.each([
          ['sorted', { sortConfig: [{ column: 'orders__status', direction: 'asc' }] }],
          [
            'post-join filtered',
            {
              filterConfig: [
                { column: 'orders__status', operator: 'eq', value: 'x', placement: 'post-join' },
              ],
            },
          ],
          ['selected', { columnConfig: ['customer_email', 'orders__status'] }],
        ])(
          'keeps the chain when an ordinary field of that source is still %s',
          async (_case, overrides) => {
            const report = makeJoinedReport(
              {
                columnConfig: ['customer_email'],
                uniqueCountConfig: ['orders'],
                ...(overrides as Partial<Report>),
              },
              [{ ...ORDERS, included: false }]
            );

            const result = await service.resolveBlendingDecision(report, {
              userId: 'user-1',
              roles: ['admin'],
            });

            expect(result.uniqueCountSources).toEqual([]);
            expect(result.chains?.map(c => c.cteName)).toEqual(['orders']);
          }
        );

        // A surviving nested source still needs its ancestor joined, even though that ancestor's
        // OWN Unique Count was dropped and nothing else references it.
        it('keeps an ancestor a SURVIVING nested Unique Count still needs', async () => {
          const report = makeJoinedReport(
            { columnConfig: ['customer_email'], uniqueCountConfig: ['orders', 'orders.items'] },
            [{ ...ORDERS, primaryKey: [] }, ITEMS]
          );

          const result = await service.resolveBlendingDecision(report, {
            userId: 'user-1',
            roles: ['admin'],
          });

          expect(result.uniqueCountSources?.map(s => s.aliasPath)).toEqual(['orders.items']);
          expect(result.chains?.map(c => c.cteName)).toEqual(['orders', 'orders_items']);
        });

        it('leaves the chains untouched when every configured source survives', async () => {
          const report = makeJoinedReport(
            { columnConfig: ['customer_email'], uniqueCountConfig: ['orders', 'orders.items'] },
            [ORDERS, ITEMS]
          );

          const result = await service.resolveBlendingDecision(report, {
            userId: 'user-1',
            roles: ['admin'],
          });

          expect(result.chains?.map(c => c.cteName)).toEqual(['orders', 'orders_items']);
        });
      });

      it('emits byte-identical SQL for a legacy uniqueCountConfig: true report', async () => {
        const buildSql = async (uniqueCountConfig: Report['uniqueCountConfig']) => {
          blendedQueryBuilderFacade.buildBlendedQuery.mockClear();
          const report = makeJoinedReport(
            { columnConfig: ['customer_email', 'orders__status'], uniqueCountConfig },
            [ORDERS]
          );
          await service.resolveBlendingDecision(report, { userId: 'user-1', roles: ['admin'] });
          // The facade is mocked, so render the captured context through the REAL BigQuery
          // builder — the same pure function production runs.
          return new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer()).buildBlendedQuery(
            capturedContext()!
          );
        };

        const legacy = await buildSql(true);
        const listed = await buildSql(['']);

        expect(listed).toEqual(legacy);
        expect(JSON.stringify(listed)).toBe(JSON.stringify(legacy));
      });
    });
  });
});
