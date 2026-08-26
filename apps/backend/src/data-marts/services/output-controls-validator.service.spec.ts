import { BadRequestException } from '@nestjs/common';
import type { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { OutputControlsValidatorService } from './output-controls-validator.service';
import { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { AthenaFieldType } from '../data-storage-types/athena/enums/athena-field-type.enum';
import { RedshiftFieldType } from '../data-storage-types/redshift/enums/redshift-field-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { buildBlendedFieldIndex } from './blended-field-index';
import { MAIN_UNIQUE_COUNT_SOURCE } from '../dto/schemas/unique-count-sources';
import { JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES } from '../data-storage-types/data-mart-schema.utils';

// The real service answers this from the RAW schema, where a key column hidden for reporting is
// still counted. These fixtures carry no hidden fields, so the visible primary keys are the answer.
function mainKeyFieldsOf(fields: readonly { name: string; isPrimaryKey?: boolean }[]): string[] {
  return fields.filter(f => f.isPrimaryKey === true).map(f => f.name);
}

describe('OutputControlsValidatorService', () => {
  const svc = new OutputControlsValidatorService(undefined as never, undefined as never);

  const expectDisconnectedColumnsError = (
    caught: unknown,
    unknownColumns: string[],
    dataMartId = 'dm-1'
  ) => {
    expect(caught).toBeInstanceOf(BusinessViolationException);
    const error = caught as BusinessViolationException;
    expect(error.message).toContain('Cannot build report SQL. Disconnected columns:');
    expect(error.message).toContain('They are missing from the current Data Mart output schema.');
    for (const column of unknownColumns) {
      expect(error.message).toContain(`"${column}"`);
    }
    expect(error.errorDetails).toEqual({ unknownColumns, dataMartId });
  };

  describe('validateFilters (post-join)', () => {
    const fieldTypes = new Map<string, string>([
      ['name', BigQueryFieldType.STRING],
      ['amount', BigQueryFieldType.INTEGER],
      ['created_at', BigQueryFieldType.TIMESTAMP],
      ['flag', BigQueryFieldType.BOOLEAN],
      ['nested', BigQueryFieldType.RECORD],
    ]);

    it('accepts eq on STRING', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'eq', value: 'X', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('accepts in/not_in on STRING, INTEGER, and TIMESTAMP', () => {
      const errors = svc.validateFilters(
        [
          { column: 'name', operator: 'in', value: ['a', 'b'], placement: 'post-join' },
          { column: 'amount', operator: 'not_in', value: [1, 2], placement: 'post-join' },
          { column: 'created_at', operator: 'in', value: ['2026-01-01'], placement: 'post-join' },
        ],
        fieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('rejects in on BOOLEAN and RECORD', () => {
      const errors = svc.validateFilters(
        [
          { column: 'flag', operator: 'in', value: [true], placement: 'post-join' },
          { column: 'nested', operator: 'in', value: ['x'], placement: 'post-join' },
        ],
        fieldTypes
      );
      expect(errors.map(e => e.code)).toEqual([
        'INVALID_OPERATOR_FOR_TYPE',
        'INVALID_OPERATOR_FOR_TYPE',
      ]);
    });

    it('rejects regex on INTEGER', () => {
      const errors = svc.validateFilters(
        [{ column: 'amount', operator: 'regex', value: '^1', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([
        {
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: 'amount',
          type: BigQueryFieldType.INTEGER,
          operator: 'regex',
        },
      ]);
    });

    it('rejects between on STRING', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'name',
            operator: 'between',
            value: { from: 'a', to: 'z' },
            placement: 'post-join',
          },
        ],
        fieldTypes
      );
      expect(errors[0].code).toBe('INVALID_OPERATOR_FOR_TYPE');
    });

    it('rejects filter on RECORD column', () => {
      const errors = svc.validateFilters(
        [{ column: 'nested', operator: 'is_empty', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors[0].code).toBe('INVALID_OPERATOR_FOR_TYPE');
    });

    it('rejects filter on unknown column', () => {
      const errors = svc.validateFilters(
        [{ column: 'missing', operator: 'eq', value: 'X', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([{ code: 'FILTER_COLUMN_UNKNOWN', column: 'missing' }]);
    });

    it('accepts is_true on BOOLEAN', () => {
      const errors = svc.validateFilters(
        [{ column: 'flag', operator: 'is_true', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('accepts is_null / is_not_null on every supported type', () => {
      const filters = [
        { column: 'name', operator: 'is_null' as const, placement: 'post-join' as const },
        { column: 'name', operator: 'is_not_null' as const, placement: 'post-join' as const },
        { column: 'amount', operator: 'is_null' as const, placement: 'post-join' as const },
        { column: 'amount', operator: 'is_not_null' as const, placement: 'post-join' as const },
        { column: 'created_at', operator: 'is_null' as const, placement: 'post-join' as const },
        { column: 'created_at', operator: 'is_not_null' as const, placement: 'post-join' as const },
        { column: 'flag', operator: 'is_null' as const, placement: 'post-join' as const },
        { column: 'flag', operator: 'is_not_null' as const, placement: 'post-join' as const },
      ];
      expect(svc.validateFilters(filters, fieldTypes)).toEqual([]);
    });

    it('rejects is_empty / is_not_empty on non-STRING types (use is_null instead)', () => {
      const filters = [
        { column: 'amount', operator: 'is_empty' as const, placement: 'post-join' as const },
        {
          column: 'created_at',
          operator: 'is_not_empty' as const,
          placement: 'post-join' as const,
        },
        { column: 'flag', operator: 'is_empty' as const, placement: 'post-join' as const },
      ];
      const errors = svc.validateFilters(filters, fieldTypes);
      expect(errors).toHaveLength(3);
      expect(errors.every(e => e.code === 'INVALID_OPERATOR_FOR_TYPE')).toBe(true);
    });

    it('still accepts is_empty / is_not_empty on STRING (preserves "" + NULL semantics)', () => {
      const filters = [
        { column: 'name', operator: 'is_empty' as const, placement: 'post-join' as const },
        { column: 'name', operator: 'is_not_empty' as const, placement: 'post-join' as const },
      ];
      expect(svc.validateFilters(filters, fieldTypes)).toEqual([]);
    });

    it('accepts relative_date on TIMESTAMP', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'created_at',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: 7 },
            placement: 'post-join',
          },
        ],
        fieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('treats Databricks INT as a number type (comparison allowed, relative_date rejected)', () => {
      const types = new Map<string, string>([['n', 'INT']]);
      expect(
        svc.validateFilters(
          [{ column: 'n', operator: 'gte', value: 1, placement: 'post-join' }],
          types
        )
      ).toEqual([]);
      const bad = svc.validateFilters(
        [
          {
            column: 'n',
            operator: 'relative_date',
            value: { kind: 'today' },
            placement: 'post-join',
          },
        ],
        types
      );
      expect(bad).toHaveLength(1);
      expect(bad[0].code).toBe('INVALID_OPERATOR_FOR_TYPE');
    });

    it('treats Databricks TIMESTAMP_NTZ as a date type (relative_date allowed)', () => {
      const types = new Map<string, string>([['t', 'TIMESTAMP_NTZ']]);
      expect(
        svc.validateFilters(
          [
            {
              column: 't',
              operator: 'relative_date',
              value: { kind: 'today' },
              placement: 'post-join',
            },
          ],
          types
        )
      ).toEqual([]);
    });

    it('accepts gt on NUMERIC types (INTEGER/FLOAT/NUMERIC/BIGNUMERIC)', () => {
      const types = new Map<string, string>([
        ['i', BigQueryFieldType.INTEGER],
        ['f', BigQueryFieldType.FLOAT],
        ['n', BigQueryFieldType.NUMERIC],
        ['b', BigQueryFieldType.BIGNUMERIC],
      ]);
      const filters = [
        { column: 'i', operator: 'gt' as const, value: 1, placement: 'post-join' as const },
        { column: 'f', operator: 'gt' as const, value: 1, placement: 'post-join' as const },
        { column: 'n', operator: 'gt' as const, value: 1, placement: 'post-join' as const },
        { column: 'b', operator: 'gt' as const, value: 1, placement: 'post-join' as const },
      ];
      expect(svc.validateFilters(filters, types)).toEqual([]);
    });

    it('accepts a valid regex on STRING', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'regex', value: '^foo$', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('rejects unparseable regex on STRING with INVALID_REGEX_PATTERN', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'regex', value: '[unclosed', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([
        { code: 'INVALID_REGEX_PATTERN', column: 'name', pattern: '[unclosed' },
      ]);
    });

    it('rejects unparseable not_regex on STRING with INVALID_REGEX_PATTERN', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'not_regex', value: '*', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({ code: 'INVALID_REGEX_PATTERN', column: 'name' });
    });
  });

  describe('validateFilters (pre-join)', () => {
    const index = buildBlendedFieldIndex({
      blendedFields: [
        { name: 'users__role', aliasPath: 'users', originalFieldName: 'role', type: 'STRING' },
        { name: 'orders__total', aliasPath: 'orders', originalFieldName: 'total', type: 'NUMERIC' },
      ],
      availableSources: [
        { aliasPath: 'users', isIncluded: true },
        { aliasPath: 'orders', isIncluded: false },
      ],
    } as never);

    it('accepts a pre-join filter by unified name', () => {
      const errors = svc.validateFilters(
        [{ column: 'users__role', operator: 'eq', value: 'admin', placement: 'pre-join' }],
        new Map(),
        index
      );
      expect(errors).toEqual([]);
    });

    it('reports unknown pre-join column as FILTER_COLUMN_UNKNOWN', () => {
      const errors = svc.validateFilters(
        [{ column: 'users__missing', operator: 'eq', value: 'x', placement: 'pre-join' }],
        new Map(),
        index
      );
      expect(errors).toEqual([{ code: 'FILTER_COLUMN_UNKNOWN', column: 'users__missing' }]);
    });

    it('reports excluded source as FILTER_ALIAS_PATH_NOT_INCLUDED', () => {
      const errors = svc.validateFilters(
        [{ column: 'orders__total', operator: 'gt', value: 1, placement: 'pre-join' }],
        new Map(),
        index
      );
      expect(errors).toEqual([
        { code: 'FILTER_ALIAS_PATH_NOT_INCLUDED', aliasPath: 'orders', column: 'orders__total' },
      ]);
    });

    it('rejects a home/native field used as a slice (no __ name → unknown)', () => {
      const errors = svc.validateFilters(
        [{ column: 'native_field', operator: 'eq', value: 'x', placement: 'pre-join' }],
        new Map([['native_field', 'STRING']]),
        index
      );
      expect(errors).toEqual([{ code: 'FILTER_COLUMN_UNKNOWN', column: 'native_field' }]);
    });

    it('type-checks a pre-join slice by the RAW sourceFieldType, not the dedup effective type', () => {
      // A STRING `hitId` deduped COUNT_DISTINCT has effective type INTEGER but a RAW type of
      // STRING. The pre-join slice runs on the raw column BEFORE dedup, so a string operator
      // (`contains`) must be accepted against the raw STRING type — not rejected as an
      // INVALID_OPERATOR_FOR_TYPE against the effective INTEGER type (the regression).
      const indexCountDistinct = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__hitId',
            aliasPath: 'users',
            originalFieldName: 'hitId',
            type: BigQueryFieldType.INTEGER,
            sourceFieldType: BigQueryFieldType.STRING,
          },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      const errors = svc.validateFilters(
        [{ column: 'users__hitId', operator: 'contains', value: 'x', placement: 'pre-join' }],
        new Map(),
        indexCountDistinct
      );
      expect(errors).toEqual([]);
    });

    it('type-checks a pre-join slice by the RAW sourceFieldType in the RESTRICTIVE direction too (NUMERIC raw, STRING_AGG-effective STRING)', () => {
      // A NUMERIC `code` deduped STRING_AGG has an effective type of STRING but a RAW type of
      // NUMERIC. If the pre-join slice mistakenly type-checked against the effective STRING type,
      // a string operator (`contains`) would be wrongly ACCEPTED even though the raw column is
      // numeric before dedup. It must be rejected against the RAW NUMERIC type, while a numeric
      // operator (`gt`) is accepted.
      const indexStringAgg = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'orders__code',
            aliasPath: 'orders',
            originalFieldName: 'code',
            type: BigQueryFieldType.STRING,
            sourceFieldType: BigQueryFieldType.NUMERIC,
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      } as never);

      const stringOpErrors = svc.validateFilters(
        [{ column: 'orders__code', operator: 'contains', value: 'x', placement: 'pre-join' }],
        new Map(),
        indexStringAgg
      );
      expect(stringOpErrors[0]).toMatchObject({
        code: 'INVALID_OPERATOR_FOR_TYPE',
        column: 'orders__code',
        type: BigQueryFieldType.NUMERIC,
      });

      const numberOpErrors = svc.validateFilters(
        [{ column: 'orders__code', operator: 'gt', value: 1, placement: 'pre-join' }],
        new Map(),
        indexStringAgg
      );
      expect(numberOpErrors).toEqual([]);
    });

    it('rejects invalid operator for type on pre-join column', () => {
      const indexWithInt = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__amount',
            aliasPath: 'users',
            originalFieldName: 'amount',
            type: BigQueryFieldType.INTEGER,
          },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      const errors = svc.validateFilters(
        [{ column: 'users__amount', operator: 'regex', value: '^1', placement: 'pre-join' }],
        new Map(),
        indexWithInt
      );
      expect(errors[0]).toMatchObject({
        code: 'INVALID_OPERATOR_FOR_TYPE',
        column: 'users__amount',
        aliasPath: 'users',
      });
    });

    it('rejects malformed regex pattern inside pre-join filter (carries aliasPath)', () => {
      const errors = svc.validateFilters(
        [{ column: 'users__role', operator: 'regex', value: '[unclosed', placement: 'pre-join' }],
        new Map(),
        index
      );
      expect(errors).toEqual([
        {
          code: 'INVALID_REGEX_PATTERN',
          column: 'users__role',
          pattern: '[unclosed',
          aliasPath: 'users',
        },
      ]);
    });

    it('post-join rule without placement defaults to post-join lookup (does not need fieldIndex)', () => {
      const homeTypes = new Map<string, string>([['name', BigQueryFieldType.STRING]]);
      const errors = svc.validateFilters(
        // No placement field — Zod default would set 'post-join'; raw call here
        // simulates a rule that was passed through unparsed.
        [{ column: 'name', operator: 'eq', value: 'X' } as never],
        homeTypes,
        new Map()
      );
      expect(errors).toEqual([]);
    });
  });

  describe('validateSort', () => {
    it('rejects sort on non-selected column', () => {
      const errors = svc.validateSort(
        [{ column: 'country', direction: 'asc' }],
        new Set(['date', 'amount'])
      );
      expect(errors).toEqual([{ code: 'SORT_COLUMN_NOT_SELECTED', column: 'country' }]);
    });
    it('accepts sort on selected column', () => {
      const errors = svc.validateSort(
        [{ column: 'date', direction: 'desc' }],
        new Set(['date', 'amount'])
      );
      expect(errors).toEqual([]);
    });
    it('returns empty array for empty sort', () => {
      expect(svc.validateSort([], new Set())).toEqual([]);
    });
  });

  describe('validateForReport', () => {
    const supportedStorageType = DataStorageType.GOOGLE_BIGQUERY;
    const unsupportedStorageType = DataStorageType.AWS_ATHENA;

    const makeCapabilityService = (supported: boolean) => ({
      isSupported: jest.fn().mockReturnValue(supported),
    });

    type TestNativeField = {
      name: string;
      type: string;
      status?: string;
      isHiddenForReporting?: boolean;
      fields?: TestNativeField[];
    };

    const makeBlendableSchemaService = (
      nativeFields: TestNativeField[] = [],
      extras: {
        blendedFields?: {
          name?: string;
          aliasPath?: string;
          originalFieldName?: string;
          type: string;
          isHidden?: boolean;
          // The per-field aggregation menu a Data Mart can store; several tests set it, so the
          // helper has to carry it rather than make each call site an `as never`.
          postJoinAggregations?: ReportAggregateFunction[];
        }[];
        availableSources?: { aliasPath: string; isIncluded?: boolean }[];
      } = {}
    ) => ({
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields,
        blendedFields: extras.blendedFields ?? [],
        availableSources: extras.availableSources ?? [],
        mainUniqueCountKeyFields: mainKeyFieldsOf(nativeFields),
      }),
    });

    it('returns immediately when no output controls are set', async () => {
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService();
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: unsupportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();

      expect(capabilitySvc.isSupported).not.toHaveBeenCalled();
    });

    it('rejects a case-only duplicate in a projection that carries NO output control', async () => {
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService();
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: unsupportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['country', 'Country'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).rejects.toThrow(BadRequestException);

      // A non-empty columnConfig now checks capability up front too — deciding whether it MIGHT
      // carry a calculated field needs the same gate `compose()` applies before rendering one
      // (see `mayCarryCalculatedField`). The storage is unsupported, so that stays `false` and
      // the schema is still never fetched for a plain projection.
      expect(capabilitySvc.isSupported).toHaveBeenCalledWith(unsupportedStorageType);
      expect(schemaSvc.computeBlendableSchema).not.toHaveBeenCalled();
    });

    it('accepts a projection with no output control and no collision', async () => {
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService();
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: unsupportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['country', 'revenue'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('throws BadRequestException when storage type is not supported', async () => {
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService();
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: unsupportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: [{ column: 'name', operator: 'eq', value: 'X' }],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).rejects.toThrow(BadRequestException);

      expect(capabilitySvc.isSupported).toHaveBeenCalledWith(unsupportedStorageType);
      expect(schemaSvc.computeBlendableSchema).not.toHaveBeenCalled();
    });

    it('does not classify output controls as disconnected before schema actualization', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService();
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['not_yet_actualized'],
          filterConfig: [{ column: 'not_yet_actualized', operator: 'eq', value: 'x' }],
          sortConfig: [{ column: 'not_yet_actualized', direction: 'asc' }],
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('throws BadRequestException with OUTPUT_CONTROLS_NOT_SUPPORTED for unsupported storage', async () => {
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService();
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: unsupportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: [{ column: 'name', operator: 'eq', value: 'X' }],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors[0].code).toBe('OUTPUT_CONTROLS_NOT_SUPPORTED');
    });

    it('passes when only limitConfig is set (no schema fetch needed)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService();
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: 100,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();

      expect(schemaSvc.computeBlendableSchema).not.toHaveBeenCalled();
    });

    it('accepts filters and sorts on visible nested native paths', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        {
          name: 'user',
          type: 'RECORD',
          status: 'CONNECTED',
          fields: [{ name: 'email', type: 'STRING', status: 'CONNECTED' }],
        },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['user.email'],
          filterConfig: [{ column: 'user.email', operator: 'eq', value: 'a@example.com' }],
          sortConfig: [{ column: 'user.email', direction: 'asc' }],
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('lists DISCONNECTED native fields used by filters in the disconnected-columns error', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'date', type: 'DATE', status: 'CONNECTED' },
        { name: 'legacy', type: 'STRING', status: 'DISCONNECTED' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: unknown;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['date'],
          filterConfig: [{ column: 'legacy', operator: 'eq', value: 'x' }],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e;
      }

      expectDisconnectedColumnsError(caught, ['legacy']);
    });

    it('lists hidden blended fields used by post-join filters in the disconnected-columns error', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'date', type: 'DATE', status: 'CONNECTED' }],
        {
          blendedFields: [
            { name: 'b__visible', aliasPath: 'b', type: 'STRING' },
            { name: 'b__hidden', aliasPath: 'b', type: 'STRING', isHidden: true },
          ],
          availableSources: [{ aliasPath: 'b', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: unknown;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['date', 'b__visible'],
          filterConfig: [
            { column: 'b__hidden', operator: 'eq', value: 'x' },
            { column: 'b__visible', operator: 'eq', value: 'y' },
          ],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e;
      }

      expectDisconnectedColumnsError(caught, ['b__hidden']);
    });

    it('lists hidden blended fields used by pre-join slices as the unified column name', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'date', type: 'DATE', status: 'CONNECTED' }],
        {
          blendedFields: [
            { name: 'b__visible', aliasPath: 'b', originalFieldName: 'visible', type: 'STRING' },
            {
              name: 'b__hidden',
              aliasPath: 'b',
              originalFieldName: 'hidden',
              type: 'STRING',
              isHidden: true,
            },
          ],
          availableSources: [{ aliasPath: 'b', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: unknown;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['date', 'b__visible'],
          filterConfig: [
            { column: 'b__hidden', operator: 'eq', value: 'x', placement: 'pre-join' },
            { column: 'b__visible', operator: 'eq', value: 'y', placement: 'pre-join' },
          ],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e;
      }

      expectDisconnectedColumnsError(caught, ['b__hidden']);
    });

    it('lists a DISCONNECTED native field used by sort when columnConfig is null', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'date', type: 'DATE', status: 'CONNECTED' },
        { name: 'legacy', type: 'STRING', status: 'DISCONNECTED' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: unknown;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: [{ column: 'legacy', direction: 'asc' }],
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e;
      }

      expectDisconnectedColumnsError(caught, ['legacy']);
    });

    it('lists a DISCONNECTED sort field even when stale columnConfig still selects it', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'date', type: 'DATE', status: 'CONNECTED' },
        { name: 'legacy', type: 'STRING', status: 'DISCONNECTED' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: unknown;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['legacy'],
          filterConfig: null,
          sortConfig: [{ column: 'legacy', direction: 'asc' }],
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e;
      }

      expectDisconnectedColumnsError(caught, ['legacy']);
    });

    it('lists an unknown post-join filter column in the disconnected-columns error', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'amount', type: BigQueryFieldType.INTEGER },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: unknown;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: [{ column: 'missing', operator: 'eq', value: 'X' }],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e;
      }

      expectDisconnectedColumnsError(caught, ['missing']);
    });

    it('throws BadRequestException with INVALID_OPERATOR_FOR_TYPE for regex on INTEGER', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'amount', type: BigQueryFieldType.INTEGER },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: [{ column: 'amount', operator: 'regex', value: '^1' }],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors[0].code).toBe('INVALID_OPERATOR_FOR_TYPE');
    });

    it('throws BadRequestException with SORT_COLUMN_NOT_SELECTED for sort on non-selected column', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'date', type: BigQueryFieldType.DATE },
        { name: 'amount', type: BigQueryFieldType.INTEGER },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['date'],
          filterConfig: null,
          sortConfig: [{ column: 'amount', direction: 'asc' }],
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors[0].code).toBe('SORT_COLUMN_NOT_SELECTED');
    });

    it('falls back to NATIVE columns when columnConfig is null for sort validation', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'date', type: BigQueryFieldType.DATE },
        { name: 'amount', type: BigQueryFieldType.INTEGER },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: [{ column: 'amount', direction: 'asc' }],
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    // Regression: with columnConfig null the projection is SELECT * over NATIVE
    // fields only — blended aliases are not projected, and the blended run path
    // rejects output controls without an explicit column selection. Save-time
    // validation must reject a sort on a blended column here, not pass and then
    // blow up at run time.
    it('rejects sort on a BLENDED column when columnConfig is null', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'amount', type: BigQueryFieldType.INTEGER }],
        {
          blendedFields: [
            {
              name: 'partner_revenue',
              aliasPath: 'partner',
              originalFieldName: 'revenue',
              type: BigQueryFieldType.INTEGER,
            },
          ],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: [{ column: 'partner_revenue', direction: 'asc' }],
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as {
        details: { errors: { code: string; column: string }[] };
      };
      expect(response.details.errors[0]).toMatchObject({
        code: 'SORT_COLUMN_NOT_SELECTED',
        column: 'partner_revenue',
      });
    });

    it('rejects payload with mismatched filter shape via Zod (defence-in-depth)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'amount', type: BigQueryFieldType.INTEGER },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['amount'],
          filterConfig: [{ column: 'amount', operator: 'between', value: 5 }] as never,
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { message: string };
      expect(response.message).toContain('invalid shape');
      expect(schemaSvc.computeBlendableSchema).not.toHaveBeenCalled();
    });

    it('rejects sortConfig with invalid direction via Zod (defence-in-depth)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'amount', type: BigQueryFieldType.INTEGER },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['amount'],
          filterConfig: null,
          sortConfig: [{ column: 'amount', direction: 'sideways' }] as never,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects relative_date with n above bound via Zod', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'created_at', type: BigQueryFieldType.TIMESTAMP },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['created_at'],
          filterConfig: [
            {
              column: 'created_at',
              operator: 'relative_date',
              value: { kind: 'last_n_days', n: 10_000 },
            },
          ],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('passes happy path with valid filter and sort', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'name', type: BigQueryFieldType.STRING },
        { name: 'amount', type: BigQueryFieldType.INTEGER },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['name', 'amount'],
          filterConfig: [{ column: 'name', operator: 'eq', value: 'test' }],
          sortConfig: [{ column: 'amount', direction: 'desc' }],
          limitConfig: 50,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('lists a pre-join filter on an unknown unified column in the disconnected-columns error', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([], {
        blendedFields: [
          {
            name: 'users__userRole',
            aliasPath: 'users',
            originalFieldName: 'userRole',
            type: BigQueryFieldType.STRING,
          },
        ],
        availableSources: [{ aliasPath: 'users' }],
      });
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: unknown;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['some_col'],
          filterConfig: [{ column: 'orgs__x', operator: 'eq', value: 1, placement: 'pre-join' }],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e;
      }

      expectDisconnectedColumnsError(caught, ['orgs__x']);
    });

    it('rejects pre-join filter when columnConfig is null/empty (PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG)', async () => {
      // Without a columnConfig the report renders as a flat passthrough — no
      // blended SQL is generated, so the slice would silently no-op. Validator
      // catches this at save time with a structured code.
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([], {
        blendedFields: [
          {
            name: 'users__userRole',
            aliasPath: 'users',
            originalFieldName: 'userRole',
            type: BigQueryFieldType.STRING,
          },
        ],
        availableSources: [{ aliasPath: 'users' }],
      });
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: [
            {
              column: 'users__userRole',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
            },
          ],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(
        response.details.errors.some(e => e.code === 'PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG')
      ).toBe(true);
    });

    it('throws AGGREGATION_REQUIRES_COLUMN_CONFIG when aggregations are set without a column projection', async () => {
      // renderAggregatedSelect only emits a metric for a column listed in the projection;
      // a null columnConfig would silently drop SUM(revenue) and desync the headers.
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'revenue', type: 'INTEGER' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(
        response.details.errors.some(e => e.code === 'AGGREGATION_REQUIRES_COLUMN_CONFIG')
      ).toBe(true);
    });

    // A filter on an aggregate-level Calculated Field flips the query to the aggregated shape by
    // itself, and there only LISTED columns are projected — so a report that asked for the whole
    // native projection came out with an empty SELECT list: a syntax error on every dialect, and
    // the projection the analyst asked for silently discarded. AGGREGATION_REQUIRES_COLUMN_CONFIG
    // cannot see it, because this shape carries neither an aggregation nor a date trunc.
    it('throws CALCULATED_FIELD_FILTER_REQUIRES_COLUMN_CONFIG when a calculated-metric filter has no projection', async () => {
      const capabilitySvc = makeCapabilityService(true);
      // `ctr` has to be in the reporting schema too, or the disconnected-column check answers
      // first and this shape is never reached.
      const schemaSvc = makeBlendableSchemaService([
        { name: 'clicks', type: 'INTEGER' },
        { name: 'impressions', type: 'INTEGER' },
        { name: 'ctr', type: 'FLOAT' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5 }],
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: null,
          dataMartSchemaFields: [
            { name: 'clicks', type: 'INTEGER' },
            { name: 'impressions', type: 'INTEGER' },
            {
              name: 'ctr',
              type: 'FLOAT',
              calculated: {
                formula: 'SUM({{ref field="clicks"}}) / SUM({{ref field="impressions"}})',
                level: 'metric',
              },
            },
          ] as never,
          accessor: { userId: 'user-1', roles: ['admin'] },
        } as never);
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as {
        details: { errors: { code: string; column?: string }[] };
      };
      const error = response.details.errors.find(
        e => e.code === 'CALCULATED_FIELD_FILTER_REQUIRES_COLUMN_CONFIG'
      );
      expect(error).toBeDefined();
      // Naming the field is the whole point: without it the analyst meets this as a warehouse
      // syntax error that mentions no field at all.
      expect(error?.column).toBe('ctr');
    });

    it('does NOT require a column projection for a uniqueCount-only report', async () => {
      // Unique Count is a synthetic metric with no projected dimension, so it must never
      // trip the aggregation-projection guard (it may still fail for other reasons, e.g. no PK).
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'id', type: 'INTEGER' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: null,
          uniqueCountConfig: true,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      if (caught) {
        const response = caught.getResponse() as { details: { errors: { code: string }[] } };
        expect(
          response.details.errors.every(e => e.code !== 'AGGREGATION_REQUIRES_COLUMN_CONFIG')
        ).toBe(true);
      }
    });

    it('treats a pre-join filter on a NON-actualized schema as disconnected (400, not skipped)', async () => {
      // Schema not yet actualized (empty native + blended). The pre-join filter
      // would otherwise be skipped here, then blow up at run time with a 500 in
      // the builder. Surface it as a disconnected-columns error instead.
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([], {
        blendedFields: [],
        availableSources: [],
      });
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: unknown;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['some_col'],
          filterConfig: [
            { column: 'users__role', operator: 'eq', value: 'admin', placement: 'pre-join' },
          ],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e;
      }

      expectDisconnectedColumnsError(caught, ['users__role']);
    });

    it('resolves when pre-join filter unified column is valid', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([], {
        blendedFields: [
          {
            name: 'users__userRole',
            aliasPath: 'users',
            originalFieldName: 'userRole',
            type: BigQueryFieldType.STRING,
          },
        ],
        availableSources: [{ aliasPath: 'users' }],
      });
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['some_col'],
          filterConfig: [
            {
              column: 'users__userRole',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
            },
          ],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    // Post-join aggregation on a blended report is now supported: a type-allowed
    // function over a native column with a blended column also selected passes.
    it('accepts aggregationConfig with a blended column selected when the function is type-allowed', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'revenue', type: BigQueryFieldType.INTEGER }],
        {
          blendedFields: [
            {
              name: 'partner__cost',
              aliasPath: 'partner',
              originalFieldName: 'cost',
              type: BigQueryFieldType.INTEGER,
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['revenue', 'partner__cost'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('aggregates a blended metric column directly when the function is allowed for its type', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'channel', type: BigQueryFieldType.STRING }],
        {
          blendedFields: [
            {
              name: 'partner__cost',
              aliasPath: 'partner',
              originalFieldName: 'cost',
              type: BigQueryFieldType.INTEGER,
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['channel', 'partner__cost'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'partner__cost', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('rejects an aggregation function not allowed for a blended STRING field (AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'channel', type: BigQueryFieldType.STRING }],
        {
          blendedFields: [
            {
              name: 'partner__name',
              aliasPath: 'partner',
              originalFieldName: 'name',
              type: BigQueryFieldType.STRING,
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['channel', 'partner__name'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          // MIN is not in the STRING governance allowed-set, and is not a SUM/AVG
          // type-floor case, so it surfaces as a field-governance violation.
          aggregationConfig: [{ column: 'partner__name', function: 'MIN' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(
        response.details.errors.some(e => e.code === 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD')
      ).toBe(true);
    });

    it('rejects aggregation on an unselected blended column (AGGREGATION_COLUMN_NOT_SELECTED)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'channel', type: BigQueryFieldType.STRING }],
        {
          blendedFields: [
            {
              name: 'partner__cost',
              aliasPath: 'partner',
              originalFieldName: 'cost',
              type: BigQueryFieldType.INTEGER,
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          // partner__cost is NOT in columnConfig.
          columnConfig: ['channel'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'partner__cost', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors.some(e => e.code === 'AGGREGATION_COLUMN_NOT_SELECTED')).toBe(
        true
      );
    });

    it('does not reject aggregationConfig when columnConfig contains only native columns (no blended)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [
          { name: 'channel', type: BigQueryFieldType.STRING },
          { name: 'revenue', type: BigQueryFieldType.INTEGER },
        ],
        {
          blendedFields: [
            {
              name: 'partner__cost',
              aliasPath: 'partner',
              originalFieldName: 'cost',
              type: BigQueryFieldType.INTEGER,
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['channel', 'revenue'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('rejects a function outside postJoinAggregations for a blended STRING field (AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'channel', type: BigQueryFieldType.STRING }],
        {
          blendedFields: [
            {
              name: 'partner__name',
              aliasPath: 'partner',
              originalFieldName: 'name',
              type: BigQueryFieldType.STRING,
              postJoinAggregations: ['COUNT'],
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['channel', 'partner__name'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          // STRING_AGG is in the type-derived default for STRING but NOT in postJoinAggregations
          aggregationConfig: [{ column: 'partner__name', function: 'STRING_AGG' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(
        response.details.errors.some(e => e.code === 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD')
      ).toBe(true);
    });

    // A stored blended-field config could authorize a function the TYPE cannot run. The type
    // floor catches the obvious ones (SUM/AVG on a non-number, COUNT_DISTINCT/STRING_AGG on a
    // non-scalar) but NOT percentiles — so `P50` on a text field used to pass save-time
    // validation and fail only at the warehouse. The menu is now clamped to the supported set.
    it('clamps postJoinAggregations to the type-supported set (percentile on a STRING)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'channel', type: BigQueryFieldType.STRING }],
        {
          blendedFields: [
            {
              name: 'partner__name',
              aliasPath: 'partner',
              originalFieldName: 'name',
              type: BigQueryFieldType.STRING,
              // P50 is not supported for a STRING field — the override must not authorize it,
              // and no type-floor rule covers percentiles.
              postJoinAggregations: ['COUNT', 'P50'],
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['channel', 'partner__name'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'partner__name', function: 'P50' as const }],
          dateTruncConfig: null,
          uniqueCountConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(
        response.details.errors.some(e => e.code === 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD')
      ).toBe(true);
    });

    it('accepts a function within postJoinAggregations for a blended STRING field', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'channel', type: BigQueryFieldType.STRING }],
        {
          blendedFields: [
            {
              name: 'partner__name',
              aliasPath: 'partner',
              originalFieldName: 'name',
              type: BigQueryFieldType.STRING,
              postJoinAggregations: ['COUNT'],
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['channel', 'partner__name'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'partner__name', function: 'COUNT' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    // The offered menu drops COUNT beside a joined COUNT_DISTINCT, but COUNT alone answers a
    // different question rather than a distorted one — a report that saved it must keep running.
    it('accepts a COUNT on a joined field — only the pair with COUNT_DISTINCT is contradictory', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'channel', type: BigQueryFieldType.STRING }],
        {
          blendedFields: [
            {
              name: 'partner__name',
              aliasPath: 'partner',
              originalFieldName: 'name',
              type: BigQueryFieldType.STRING,
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['channel', 'partner__name'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'partner__name', function: 'COUNT' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('still enforces an explicit per-field menu that excludes COUNT', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'channel', type: BigQueryFieldType.STRING }],
        {
          blendedFields: [
            {
              name: 'partner__name',
              aliasPath: 'partner',
              originalFieldName: 'name',
              type: BigQueryFieldType.STRING,
              postJoinAggregations: ['COUNT_DISTINCT'],
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['channel', 'partner__name'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'partner__name', function: 'COUNT' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('keeps both COUNT and COUNT_DISTINCT on a NATIVE string field', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'channel', type: BigQueryFieldType.STRING }],
        {
          blendedFields: [
            {
              name: 'partner__name',
              aliasPath: 'partner',
              originalFieldName: 'name',
              type: BigQueryFieldType.STRING,
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['channel'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [
            { column: 'channel', function: 'COUNT' },
            { column: 'channel', function: 'COUNT_DISTINCT' },
          ],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('validateFilters — Athena column types (regression: VARCHAR/INTEGER/BOOLEAN/TIMESTAMP)', () => {
    const athenaFieldTypes = new Map<string, string>([
      ['name', AthenaFieldType.VARCHAR],
      ['id', AthenaFieldType.INTEGER],
      ['active', AthenaFieldType.BOOLEAN],
      ['created_at', AthenaFieldType.TIMESTAMP],
    ]);

    it('accepts eq on VARCHAR', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'eq', value: 'alpha', placement: 'post-join' }],
        athenaFieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('accepts contains on VARCHAR', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'contains', value: 'alph', placement: 'post-join' }],
        athenaFieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('accepts between on INTEGER', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'id',
            operator: 'between',
            value: { from: 2, to: 3 },
            placement: 'post-join',
          },
        ],
        athenaFieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('accepts gt on INTEGER', () => {
      const errors = svc.validateFilters(
        [{ column: 'id', operator: 'gt', value: 1, placement: 'post-join' }],
        athenaFieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('accepts is_true on BOOLEAN', () => {
      const errors = svc.validateFilters(
        [{ column: 'active', operator: 'is_true', placement: 'post-join' }],
        athenaFieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('accepts relative_date on TIMESTAMP', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'created_at',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: 7 },
            placement: 'post-join',
          },
        ],
        athenaFieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('rejects a numeric-only operator (between) on VARCHAR (type mismatch)', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'name',
            operator: 'between',
            value: { from: 'a', to: 'z' },
            placement: 'post-join',
          },
        ],
        athenaFieldTypes
      );
      expect(errors[0]).toMatchObject({ code: 'INVALID_OPERATOR_FOR_TYPE', column: 'name' });
    });
  });

  // ─── Athena type matrix — extended coverage ────────────────────────────────
  // The basic block above checks a few happy/sad paths. These blocks fill the
  // gap: every Athena type has at least one clearly-invalid op rejected with
  // INVALID_OPERATOR_FOR_TYPE, additional valid ops are confirmed, and the
  // INVALID_REGEX_PATTERN code is tested with Athena VARCHAR specifically.

  describe('validateFilters — Athena VARCHAR extended', () => {
    const fieldTypes = new Map<string, string>([['name', AthenaFieldType.VARCHAR]]);

    it('accepts regex on VARCHAR with valid pattern', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'regex', value: '^foo.*bar$', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('rejects regex on VARCHAR with invalid pattern → INVALID_REGEX_PATTERN', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'regex', value: '[unclosed', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([
        { code: 'INVALID_REGEX_PATTERN', column: 'name', pattern: '[unclosed' },
      ]);
    });

    it('rejects not_regex on VARCHAR with invalid pattern → INVALID_REGEX_PATTERN', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'not_regex', value: '*bad', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({ code: 'INVALID_REGEX_PATTERN', column: 'name' });
    });

    it('accepts starts_with on VARCHAR', () => {
      expect(
        svc.validateFilters(
          [{ column: 'name', operator: 'starts_with', value: 'foo', placement: 'post-join' }],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('accepts ends_with on VARCHAR', () => {
      expect(
        svc.validateFilters(
          [{ column: 'name', operator: 'ends_with', value: 'bar', placement: 'post-join' }],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('accepts is_empty / is_not_empty on VARCHAR', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'name', operator: 'is_empty', placement: 'post-join' },
            { column: 'name', operator: 'is_not_empty', placement: 'post-join' },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('rejects gt on VARCHAR → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'gt', value: 5, placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([
        expect.objectContaining({
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: 'name',
          type: AthenaFieldType.VARCHAR,
          operator: 'gt',
        }),
      ]);
    });

    it('rejects relative_date on VARCHAR → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'name',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: 7 },
            placement: 'post-join',
          },
        ],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({
        code: 'INVALID_OPERATOR_FOR_TYPE',
        column: 'name',
        operator: 'relative_date',
      });
    });

    it('rejects is_true on VARCHAR → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'is_true', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({ code: 'INVALID_OPERATOR_FOR_TYPE', column: 'name' });
    });
  });

  describe('validateFilters — Athena numeric types (INTEGER / DOUBLE / DECIMAL)', () => {
    const fieldTypes = new Map<string, string>([
      ['count', AthenaFieldType.INTEGER],
      ['price', AthenaFieldType.DOUBLE],
      ['amount', AthenaFieldType.DECIMAL],
    ]);

    it('accepts eq / neq on INTEGER', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'count', operator: 'eq', value: 0, placement: 'post-join' },
            { column: 'count', operator: 'neq', value: 0, placement: 'post-join' },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('accepts gt / lt / gte / lte on DOUBLE', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'price', operator: 'gt', value: 1.5, placement: 'post-join' },
            { column: 'price', operator: 'lt', value: 100, placement: 'post-join' },
            { column: 'price', operator: 'gte', value: 0, placement: 'post-join' },
            { column: 'price', operator: 'lte', value: 99, placement: 'post-join' },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('accepts between on DECIMAL', () => {
      expect(
        svc.validateFilters(
          [
            {
              column: 'amount',
              operator: 'between',
              value: { from: 10, to: 50 },
              placement: 'post-join',
            },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('accepts is_null / is_not_null on every numeric Athena type', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'count', operator: 'is_null', placement: 'post-join' },
            { column: 'price', operator: 'is_not_null', placement: 'post-join' },
            { column: 'amount', operator: 'is_null', placement: 'post-join' },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('rejects contains on INTEGER → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [{ column: 'count', operator: 'contains', value: '1', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([
        expect.objectContaining({
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: 'count',
          type: AthenaFieldType.INTEGER,
          operator: 'contains',
        }),
      ]);
    });

    it('rejects regex on DOUBLE → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [{ column: 'price', operator: 'regex', value: '^1', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({
        code: 'INVALID_OPERATOR_FOR_TYPE',
        column: 'price',
        type: AthenaFieldType.DOUBLE,
        operator: 'regex',
      });
    });

    it('rejects relative_date on DECIMAL → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'amount',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: 7 },
            placement: 'post-join',
          },
        ],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({
        code: 'INVALID_OPERATOR_FOR_TYPE',
        column: 'amount',
        operator: 'relative_date',
      });
    });
  });

  describe('validateFilters — Athena BOOLEAN', () => {
    const fieldTypes = new Map<string, string>([['active', AthenaFieldType.BOOLEAN]]);

    it('accepts is_true / is_false on BOOLEAN', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'active', operator: 'is_true', placement: 'post-join' },
            { column: 'active', operator: 'is_false', placement: 'post-join' },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('accepts is_null / is_not_null on BOOLEAN', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'active', operator: 'is_null', placement: 'post-join' },
            { column: 'active', operator: 'is_not_null', placement: 'post-join' },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('rejects eq on BOOLEAN → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [{ column: 'active', operator: 'eq', value: true, placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([
        expect.objectContaining({
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: 'active',
          type: AthenaFieldType.BOOLEAN,
          operator: 'eq',
        }),
      ]);
    });

    it('rejects contains on BOOLEAN → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [{ column: 'active', operator: 'contains', value: 'true', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({ code: 'INVALID_OPERATOR_FOR_TYPE', column: 'active' });
    });

    it('rejects between on BOOLEAN → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'active',
            operator: 'between',
            value: { from: 0, to: 1 },
            placement: 'post-join',
          },
        ],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({ code: 'INVALID_OPERATOR_FOR_TYPE', column: 'active' });
    });
  });

  describe('validateFilters — Athena TIMESTAMP / DATE', () => {
    const fieldTypes = new Map<string, string>([
      ['created_at', AthenaFieldType.TIMESTAMP],
      ['event_date', AthenaFieldType.DATE],
    ]);

    it('accepts eq / neq on TIMESTAMP', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'created_at', operator: 'eq', value: '2024-01-01', placement: 'post-join' },
            { column: 'created_at', operator: 'neq', value: '2024-01-01', placement: 'post-join' },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('accepts gt / lt / gte / lte on TIMESTAMP', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'created_at', operator: 'gt', value: '2024-01-01', placement: 'post-join' },
            { column: 'created_at', operator: 'lte', value: '2024-12-31', placement: 'post-join' },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('accepts between on TIMESTAMP', () => {
      expect(
        svc.validateFilters(
          [
            {
              column: 'created_at',
              operator: 'between',
              value: { from: '2024-01-01', to: '2024-12-31' },
              placement: 'post-join',
            },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('accepts gt / between / relative_date on DATE', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'event_date', operator: 'gt', value: '2024-01-01', placement: 'post-join' },
            {
              column: 'event_date',
              operator: 'between',
              value: { from: '2024-01-01', to: '2024-12-31' },
              placement: 'post-join',
            },
            {
              column: 'event_date',
              operator: 'relative_date',
              value: { kind: 'last_n_days', n: 30 },
              placement: 'post-join',
            },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('accepts is_null / is_not_null on TIMESTAMP and DATE', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'created_at', operator: 'is_null', placement: 'post-join' },
            { column: 'event_date', operator: 'is_not_null', placement: 'post-join' },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('rejects contains on TIMESTAMP → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [{ column: 'created_at', operator: 'contains', value: '2024', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toEqual([
        expect.objectContaining({
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: 'created_at',
          type: AthenaFieldType.TIMESTAMP,
          operator: 'contains',
        }),
      ]);
    });

    it('rejects regex on DATE → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [{ column: 'event_date', operator: 'regex', value: '2024', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({
        code: 'INVALID_OPERATOR_FOR_TYPE',
        column: 'event_date',
        type: AthenaFieldType.DATE,
        operator: 'regex',
      });
    });

    it('rejects is_true on DATE → INVALID_OPERATOR_FOR_TYPE', () => {
      const errors = svc.validateFilters(
        [{ column: 'event_date', operator: 'is_true', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({ code: 'INVALID_OPERATOR_FOR_TYPE', column: 'event_date' });
    });
  });

  describe('validateSort — Athena column not in selected set', () => {
    it('rejects sort on Athena column not present in selected columns', () => {
      const errors = svc.validateSort(
        [{ column: 'created_at', direction: 'desc' }],
        new Set<string>(['name', 'id'])
      );
      expect(errors).toEqual([{ code: 'SORT_COLUMN_NOT_SELECTED', column: 'created_at' }]);
    });

    it('accepts sort on Athena column that IS in selected columns', () => {
      const errors = svc.validateSort(
        [{ column: 'created_at', direction: 'asc' }],
        new Set<string>(['name', 'created_at'])
      );
      expect(errors).toEqual([]);
    });
  });

  describe('field index via validateForReport', () => {
    const supportedStorageType = DataStorageType.GOOGLE_BIGQUERY;

    it('lists a pre-join filter on an excluded source as the unified column', async () => {
      const capabilitySvc = { isSupported: jest.fn().mockReturnValue(true) };
      const schemaSvc = {
        computeBlendableSchema: jest.fn().mockResolvedValue({
          nativeFields: [],
          blendedFields: [
            {
              name: 'users__userRole',
              aliasPath: 'users',
              originalFieldName: 'userRole',
              type: BigQueryFieldType.STRING,
            },
          ],
          availableSources: [{ aliasPath: 'users', isIncluded: false }],
        }),
      };
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: unknown;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['some_col'],
          filterConfig: [
            {
              column: 'users__userRole',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
            },
          ],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e;
      }

      expectDisconnectedColumnsError(caught, ['users__userRole']);
    });

    it('included sources still accept pre-join filters on their columns (no false positive)', async () => {
      const capabilitySvc = { isSupported: jest.fn().mockReturnValue(true) };
      const schemaSvc = {
        computeBlendableSchema: jest.fn().mockResolvedValue({
          nativeFields: [],
          blendedFields: [
            {
              name: 'users__userRole',
              aliasPath: 'users',
              originalFieldName: 'userRole',
              type: BigQueryFieldType.STRING,
            },
          ],
          availableSources: [{ aliasPath: 'users', isIncluded: true }],
        }),
      };
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['some_col'],
          filterConfig: [
            {
              column: 'users__userRole',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
            },
          ],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('type completeness (zoned timestamps + type-agnostic is_null)', () => {
    const fieldTypes = new Map<string, string>([
      ['tz_ts', AthenaFieldType.TIMESTAMP_WITH_TIME_ZONE],
      ['tz_time', AthenaFieldType.TIME_WITH_TIME_ZONE],
      ['bin', AthenaFieldType.VARBINARY],
      ['j', BigQueryFieldType.JSON],
    ]);

    it('allows date operators on TIMESTAMP/TIME WITH TIME ZONE', () => {
      expect(
        svc.validateFilters(
          [
            {
              column: 'tz_ts',
              operator: 'between',
              value: { from: '2024-01-01', to: '2024-12-31' },
              placement: 'post-join',
            },
          ],
          fieldTypes
        )
      ).toEqual([]);
      expect(
        svc.validateFilters(
          [
            {
              column: 'tz_ts',
              operator: 'relative_date',
              value: { kind: 'last_n_days', n: 7 },
              placement: 'post-join',
            },
          ],
          fieldTypes
        )
      ).toEqual([]);
      expect(
        svc.validateFilters(
          [{ column: 'tz_time', operator: 'gt', value: '00:00:00', placement: 'post-join' }],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('allows comparison/between ops on time-only columns', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'tz_time', operator: 'eq', value: '08:00:00', placement: 'post-join' },
            {
              column: 'tz_time',
              operator: 'between',
              value: { from: '08:00:00', to: '17:00:00' },
              placement: 'post-join',
            },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    // Regression: relative_date emits current_date / date_add(..., current_date),
    // which is invalid for a time-of-day column — time-only types must not offer it.
    it('rejects relative_date on TIME / TIME WITH TIME ZONE', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'tz_time',
            operator: 'relative_date',
            value: { kind: 'last_n_days', n: 7 },
            placement: 'post-join',
          },
        ],
        fieldTypes
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({
        code: 'INVALID_OPERATOR_FOR_TYPE',
        column: 'tz_time',
        operator: 'relative_date',
      });
    });

    it('rejects a type-inappropriate operator on a zoned timestamp', () => {
      const errors = svc.validateFilters(
        [{ column: 'tz_ts', operator: 'contains', value: 'x', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_OPERATOR_FOR_TYPE');
    });

    it('allows is_null / is_not_null on any known column regardless of type (binary, json)', () => {
      expect(
        svc.validateFilters(
          [
            { column: 'bin', operator: 'is_null', placement: 'post-join' },
            { column: 'bin', operator: 'is_not_null', placement: 'post-join' },
            { column: 'j', operator: 'is_null', placement: 'post-join' },
          ],
          fieldTypes
        )
      ).toEqual([]);
    });

    it('still rejects non-null operators on uncategorized types', () => {
      const errors = svc.validateFilters(
        [{ column: 'bin', operator: 'eq', value: 'x', placement: 'post-join' }],
        fieldTypes
      );
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_OPERATOR_FOR_TYPE');
    });
  });

  describe('validateFilters — Redshift type names', () => {
    const ok = (type: string, operator: string, value?: unknown) =>
      svc.validateFilters([{ column: 'c', operator, value } as never], new Map([['c', type]]));

    it('treats Redshift TEXT/BPCHAR as string types (contains allowed)', () => {
      expect(ok(RedshiftFieldType.TEXT, 'contains', 'x')).toEqual([]);
      expect(ok(RedshiftFieldType.BPCHAR, 'contains', 'x')).toEqual([]);
    });

    it('treats DOUBLE PRECISION as a number type (between allowed)', () => {
      expect(ok(RedshiftFieldType.DOUBLE_PRECISION, 'between', { from: 1, to: 2 })).toEqual([]);
    });

    it('treats TIMESTAMPTZ as a date type (relative_date allowed)', () => {
      expect(ok(RedshiftFieldType.TIMESTAMPTZ, 'relative_date', { kind: 'today' })).toEqual([]);
    });

    it('treats TIMETZ as a time type (relative_date withheld)', () => {
      expect(ok(RedshiftFieldType.TIMETZ, 'between', { from: '01:00', to: '02:00' })).toEqual([]);
      expect(ok(RedshiftFieldType.TIMETZ, 'relative_date', { kind: 'today' })[0]?.code).toBe(
        'INVALID_OPERATOR_FOR_TYPE'
      );
    });
  });

  describe('validateAggregations', () => {
    const numericCol = 'amount';
    const stringCol = 'name';
    const selectedColumns = new Set([numericCol, stringCol, 'date']);
    const fieldTypes = new Map<string, string>([
      [numericCol, 'INTEGER'],
      [stringCol, 'STRING'],
      ['date', 'DATE'],
    ]);
    const resolveType = (col: string) => fieldTypes.get(col);

    it('accepts valid aggregation on a numeric column (SUM)', () => {
      const errors = svc.validateAggregations(
        [{ column: numericCol, function: 'SUM' }],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([]);
    });

    it('rejects SUM on a string column → AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE', () => {
      const errors = svc.validateAggregations(
        [{ column: stringCol, function: 'SUM' }],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([
        {
          code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
          column: stringCol,
          function: 'SUM',
          type: 'STRING',
        },
      ]);
    });

    it('rejects AVG on a string column → AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE', () => {
      const errors = svc.validateAggregations(
        [{ column: stringCol, function: 'AVG' }],
        selectedColumns,
        resolveType
      );
      expect(errors[0]).toMatchObject({ code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE' });
    });

    it('rejects aggregation on an unselected column → AGGREGATION_COLUMN_NOT_SELECTED', () => {
      const errors = svc.validateAggregations(
        [{ column: 'missing_col', function: 'SUM' }],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([{ code: 'AGGREGATION_COLUMN_NOT_SELECTED', column: 'missing_col' }]);
    });

    it('allows COUNT on a string column (type-agnostic function)', () => {
      const errors = svc.validateAggregations(
        [{ column: stringCol, function: 'COUNT' }],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([]);
    });

    it('allows MIN on a string column (type-agnostic function)', () => {
      const errors = svc.validateAggregations(
        [{ column: stringCol, function: 'MIN' }],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([]);
    });

    it('allows COUNT_DISTINCT on a string column', () => {
      const errors = svc.validateAggregations(
        [{ column: stringCol, function: 'COUNT_DISTINCT' }],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([]);
    });

    it('allows ANY_VALUE on a string column', () => {
      const errors = svc.validateAggregations(
        [{ column: stringCol, function: 'ANY_VALUE' }],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([]);
    });

    // `other`-category types (JSON, GEOGRAPHY, ARRAY, STRUCT, SUPER, VARIANT) are neither
    // groupable nor reliably text-castable → COUNT_DISTINCT / STRING_AGG 500 at run time.
    it('rejects COUNT_DISTINCT on an `other`-category column (JSON) via the type floor', () => {
      const errors = svc.validateAggregations(
        [{ column: 'payload', function: 'COUNT_DISTINCT' }],
        new Set(['payload']),
        () => 'JSON'
      );
      expect(errors).toEqual([
        {
          code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
          column: 'payload',
          function: 'COUNT_DISTINCT',
          type: 'JSON',
        },
      ]);
    });

    it('rejects STRING_AGG on an `other`-category column (GEOGRAPHY) via the type floor', () => {
      const errors = svc.validateAggregations(
        [{ column: 'geo', function: 'STRING_AGG' }],
        new Set(['geo']),
        () => 'GEOGRAPHY'
      );
      expect(errors[0]).toMatchObject({
        code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
        function: 'STRING_AGG',
      });
    });

    it('still allows COUNT and ANY_VALUE on an `other`-category column', () => {
      const errors = svc.validateAggregations(
        [
          { column: 'payload', function: 'COUNT' },
          { column: 'payload', function: 'ANY_VALUE' },
        ],
        new Set(['payload']),
        () => 'JSON'
      );
      expect(errors).toEqual([]);
    });

    it('allows STRING_AGG on a string column', () => {
      const errors = svc.validateAggregations(
        [{ column: stringCol, function: 'STRING_AGG' }],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([]);
    });

    it('accepts two DIFFERENT functions on one column (each becomes its own output column)', () => {
      const errors = svc.validateAggregations(
        [
          { column: numericCol, function: 'SUM' },
          { column: numericCol, function: 'AVG' },
        ],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([]);
    });

    it('rejects a repeated (column, function) pair → DUPLICATE_AGGREGATION (alias collision)', () => {
      const errors = svc.validateAggregations(
        [
          { column: numericCol, function: 'SUM' },
          { column: numericCol, function: 'SUM' },
        ],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([
        { code: 'DUPLICATE_AGGREGATION', column: numericCol, function: 'SUM' },
      ]);
    });
  });

  describe('validateAggregations — field governance (allowed functions per field)', () => {
    const metricCol = 'amount';
    const rateCol = 'conversion_rate';
    const labelCol = 'name';
    const selectedColumns = new Set([metricCol, rateCol, labelCol]);
    const types = new Map<string, string>([
      [metricCol, 'INTEGER'],
      [rateCol, 'FLOAT'],
      [labelCol, 'STRING'],
    ]);
    const resolveType = (col: string) => types.get(col);
    // A numeric metric whose allowed set was overridden to drop SUM (e.g. a % rate),
    // and a metric whose allowed set is empty (no aggregation permitted at all).
    const allowed = new Map<string, string[]>([
      [metricCol, ['SUM', 'AVG', 'MIN', 'MAX', 'COUNT', 'COUNT_DISTINCT']],
      [rateCol, ['AVG']],
      [labelCol, ['COUNT', 'COUNT_DISTINCT', 'STRING_AGG']],
    ]);
    const resolveAllowed = (col: string) => allowed.get(col);

    it('rejects a function not in the field allowed set → AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD', () => {
      const errors = svc.validateAggregations(
        [{ column: rateCol, function: 'SUM' }],
        selectedColumns,
        resolveType,
        resolveAllowed
      );
      expect(errors).toEqual([
        {
          code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD',
          column: rateCol,
          function: 'SUM',
        },
      ]);
    });

    it('rejects ANY aggregation when the field allowed set is empty', () => {
      const emptyAllowed = (col: string) => (col === metricCol ? [] : allowed.get(col));
      const errors = svc.validateAggregations(
        [{ column: metricCol, function: 'SUM' }],
        selectedColumns,
        resolveType,
        emptyAllowed
      );
      expect(errors).toEqual([
        {
          code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD',
          column: metricCol,
          function: 'SUM',
        },
      ]);
    });

    it('accepts an allowed function on a numeric metric', () => {
      const errors = svc.validateAggregations(
        [{ column: metricCol, function: 'AVG' }],
        selectedColumns,
        resolveType,
        resolveAllowed
      );
      expect(errors).toEqual([]);
    });

    it('still rejects SUM on a string via the type floor even if an override (wrongly) allows it', () => {
      const overAllowed = (col: string) =>
        col === labelCol ? ['SUM', 'COUNT', 'COUNT_DISTINCT', 'STRING_AGG'] : allowed.get(col);
      const errors = svc.validateAggregations(
        [{ column: labelCol, function: 'SUM' }],
        selectedColumns,
        resolveType,
        overAllowed
      );
      expect(errors).toEqual([
        {
          code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
          column: labelCol,
          function: 'SUM',
          type: 'STRING',
        },
      ]);
    });

    it('without a resolveAllowed callback, only the type floor applies (governance skipped)', () => {
      const errors = svc.validateAggregations(
        [{ column: rateCol, function: 'SUM' }],
        selectedColumns,
        resolveType
      );
      expect(errors).toEqual([]);
    });
  });

  describe('validateDateTruncs', () => {
    const selectedColumns = new Set(['date', 'ts', 'name', 'amount']);
    const fieldTypes = new Map<string, string>([
      ['date', 'DATE'],
      ['ts', 'TIMESTAMP'],
      ['name', 'STRING'],
      ['amount', 'INTEGER'],
    ]);
    const resolveType = (col: string) => fieldTypes.get(col);

    it('accepts a date-trunc on a selected DATE dimension', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'date', unit: 'MONTH' }],
        selectedColumns,
        resolveType,
        new Set()
      );
      expect(errors).toEqual([]);
    });

    it('accepts a date-trunc on a TIMESTAMP dimension', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'ts', unit: 'WEEK' }],
        selectedColumns,
        resolveType,
        new Set()
      );
      expect(errors).toEqual([]);
    });

    it('rejects a column not in the selected set → DATE_TRUNC_COLUMN_NOT_SELECTED', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'missing', unit: 'MONTH' }],
        selectedColumns,
        resolveType,
        new Set()
      );
      expect(errors).toEqual([{ code: 'DATE_TRUNC_COLUMN_NOT_SELECTED', column: 'missing' }]);
    });

    it('rejects a non-date column → DATE_TRUNC_REQUIRES_DATE_COLUMN with column + type', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'name', unit: 'MONTH' }],
        selectedColumns,
        resolveType,
        new Set()
      );
      expect(errors).toEqual([
        { code: 'DATE_TRUNC_REQUIRES_DATE_COLUMN', column: 'name', type: 'STRING' },
      ]);
    });

    it('rejects a column that also has a metric aggregation → DATE_TRUNC_COLUMN_IS_AGGREGATED', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'date', unit: 'MONTH' }],
        selectedColumns,
        resolveType,
        new Set(['date'])
      );
      expect(errors).toEqual([{ code: 'DATE_TRUNC_COLUMN_IS_AGGREGATED', column: 'date' }]);
    });

    it('accepts a valid IANA timeZone on a TIMESTAMP column', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'ts', unit: 'MONTH', timeZone: 'America/New_York' }],
        selectedColumns,
        resolveType,
        new Set()
      );
      expect(errors).toEqual([]);
    });

    // The tz is inlined into SQL — a malformed value must surface a column-scoped error.
    it('rejects a SQL-injection timeZone → DATE_TRUNC_INVALID_TIMEZONE', () => {
      const timeZone = "Foo'; DROP TABLE reports; --";
      const errors = svc.validateDateTruncs(
        [{ column: 'ts', unit: 'MONTH', timeZone }],
        selectedColumns,
        resolveType,
        new Set()
      );
      expect(errors).toEqual([{ code: 'DATE_TRUNC_INVALID_TIMEZONE', column: 'ts', timeZone }]);
    });

    it('rejects a valid IANA timeZone on a pure DATE column → DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'date', unit: 'MONTH', timeZone: 'America/New_York' }],
        selectedColumns,
        resolveType,
        new Set()
      );
      expect(errors).toEqual([
        {
          code: 'DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP',
          column: 'date',
          type: 'DATE',
        },
      ]);
    });

    it('accepts a valid IANA timeZone on a TIMESTAMP column (has sub-day component)', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'ts', unit: 'MONTH', timeZone: 'America/New_York' }],
        selectedColumns,
        resolveType,
        new Set()
      );
      expect(errors).toEqual([]);
    });

    it('accepts date-trunc on a pure DATE column with no timeZone (bucketing without tz is fine)', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'date', unit: 'MONTH' }],
        selectedColumns,
        resolveType,
        new Set()
      );
      expect(errors).toEqual([]);
    });

    // Measured on Snowflake 2026-08-24: a TIMESTAMP-declared row-level formula over
    // the string '05/08/2026', bucketed by MONTH in America/New_York, returned
    // `2026-05-01T04:00:00Z` — the 8th of May where the formula means the 5th of August. One row,
    // no error, no NULL. `CONVERT_TIMEZONE` is the coercion that parses the string, and it parses
    // it MDY; without a zone Snowflake refuses the same shape outright. Refused on all five
    // storages rather than per dialect.
    it('rejects a time zone on a bucketed calculated field → DATE_TRUNC_TIMEZONE_ON_CALCULATED_FIELD', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'ts', unit: 'MONTH', timeZone: 'America/New_York' }],
        selectedColumns,
        resolveType,
        new Set(),
        new Set(['ts'])
      );
      expect(errors).toEqual([
        {
          code: 'DATE_TRUNC_TIMEZONE_ON_CALCULATED_FIELD',
          column: 'ts',
          timeZone: 'America/New_York',
        },
      ]);
    });

    // The scope of the refusal, from the inside: only the time-zone leg goes. A bucket on the same
    // calculated field is the feature this branch shipped and must survive the new arm.
    it('accepts a bucket with no time zone on the same calculated field', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'ts', unit: 'MONTH' }],
        selectedColumns,
        resolveType,
        new Set(),
        new Set(['ts'])
      );
      expect(errors).toEqual([]);
    });

    // The other half of the scope: the calculated SET is what the refusal keys on, not the presence
    // of a time zone. An ordinary warehouse column keeps the zone it has always had.
    it('accepts the same time zone on an ordinary TIMESTAMP column beside a calculated one', () => {
      const errors = svc.validateDateTruncs(
        [{ column: 'ts', unit: 'MONTH', timeZone: 'America/New_York' }],
        selectedColumns,
        resolveType,
        new Set(),
        new Set(['other_formula'])
      );
      expect(errors).toEqual([]);
    });

    // L3: an unconfirmable column type can't be guaranteed to be a date/timestamp, so a
    // date-trunc on it would otherwise fail loudly at run time (Trino/Athena varchar↔date
    // coercion). Reject at save time with the date-scoped code instead.
    it('rejects a date-trunc on a column whose type cannot be confirmed → DATE_TRUNC_REQUIRES_DATE_COLUMN', () => {
      const resolveUnknown = (_col: string) => undefined;
      const errors = svc.validateDateTruncs(
        [{ column: 'date', unit: 'MONTH' }],
        selectedColumns,
        resolveUnknown,
        new Set()
      );
      expect(errors).toEqual([
        { code: 'DATE_TRUNC_REQUIRES_DATE_COLUMN', column: 'date', type: 'unknown' },
      ]);
    });
  });

  // L2: the projected output column names (dimensions + aggregated labels +
  // Unique Count) must be unique — a collision means a duplicate alias on BigQuery or a
  // silent clobber on name-keyed readers.
  describe('validateOutputColumnNames', () => {
    it('accepts a real column named "Row Count" in an aggregated report (no synthetic Row Count)', () => {
      // Row Count is no longer auto-appended to aggregated reports, so the name is not
      // reserved on the report-save path.
      const errors = svc.validateOutputColumnNames(
        ['Row Count', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        false
      );
      expect(errors).toEqual([]);
    });

    it('rejects a column whose name equals an aggregated label "<x> | SUM"', () => {
      const errors = svc.validateOutputColumnNames(
        ['revenue | SUM', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        false
      );
      expect(errors).toEqual([{ code: 'OUTPUT_COLUMN_NAME_COLLISION', label: 'revenue | SUM' }]);
    });

    it('rejects a real column aliased exactly "Unique Count" when uniqueCount is on', () => {
      const errors = svc.validateOutputColumnNames(['Unique Count', 'channel'], [], true);
      expect(errors).toEqual([{ code: 'OUTPUT_COLUMN_NAME_COLLISION', label: 'Unique Count' }]);
    });

    // Only Snowflake quotes every identifier; the other dialects leave a safe one unquoted and
    // the engine folds it (Athena, Redshift) or resolves it case-insensitively (Spark). Two
    // output names differing only in case are then ONE column: the metric sleeve's join back on
    // them is ambiguous, and a reader binding by name cannot tell them apart.
    it('rejects two selected columns that differ only in letter case', () => {
      const errors = svc.validateOutputColumnNames(['Country', 'country'], [], false);

      expect(errors).toEqual([{ code: 'OUTPUT_COLUMN_NAME_COLLISION', label: 'country' }]);
    });

    it('rejects a case-only collision between a column and a synthetic label', () => {
      const errors = svc.validateOutputColumnNames(['unique count'], [], true);

      expect(errors).toEqual([{ code: 'OUTPUT_COLUMN_NAME_COLLISION', label: 'Unique Count' }]);
    });

    it('rejects a case-only collision between two aggregated labels', () => {
      const errors = svc.validateOutputColumnNames(
        ['Revenue', 'revenue'],
        [
          { column: 'Revenue', function: 'SUM' },
          { column: 'revenue', function: 'SUM' },
        ],
        false
      );

      expect(errors).toEqual([{ code: 'OUTPUT_COLUMN_NAME_COLLISION', label: 'revenue | SUM' }]);
    });

    it('passes a normal aggregated report with no collisions', () => {
      const errors = svc.validateOutputColumnNames(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        false
      );
      expect(errors).toEqual([]);
    });

    it('passes a plain (non-aggregated) report with distinct dimension names', () => {
      const errors = svc.validateOutputColumnNames(['channel', 'revenue'], [], false);
      expect(errors).toEqual([]);
    });

    // A joined Unique Count name is built from the alias path and is NOT cut to the identifier
    // limit when it is built. Redshift's max_identifier_length is 127 BYTES and it TRUNCATES an
    // over-long alias instead of rejecting it, so two deep paths would come back as one result
    // column — this comparison is what stops that pair ever reaching a warehouse.
    it('rejects two joined Unique Count names that collide once cut to the identifier limit', () => {
      const deep = 'a'.repeat(130);

      const errors = svc.validateOutputColumnNames(['channel'], [], false, [
        `${deep}1__unique_count`,
        `${deep}2__unique_count`,
      ]);

      expect(errors).toEqual([
        { code: 'OUTPUT_COLUMN_NAME_COLLISION', label: `${deep}2__unique_count` },
      ]);
    });

    it('accepts joined Unique Count names that stay distinct within that limit', () => {
      const errors = svc.validateOutputColumnNames(['channel'], [], false, [
        'orders__unique_count',
        'products__unique_count',
      ]);

      expect(errors).toEqual([]);
    });
  });

  describe('validateForReport — aggregationConfig', () => {
    const supportedStorageType = DataStorageType.GOOGLE_BIGQUERY;

    const makeCapabilityService = (supported: boolean) => ({
      isSupported: jest.fn().mockReturnValue(supported),
    });

    const makeBlendableSchemaService = (nativeFields: { name: string; type: string }[] = []) => ({
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields,
        blendedFields: [],
        availableSources: [],
        mainUniqueCountKeyFields: mainKeyFieldsOf(nativeFields),
      }),
    });

    it('throws BadRequestException with OUTPUT_CONTROLS_NOT_SUPPORTED when aggregationConfig has rules on unsupported storage', async () => {
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService();
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: DataStorageType.AWS_ATHENA,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'amount', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors[0].code).toBe('OUTPUT_CONTROLS_NOT_SUPPORTED');
      expect(capabilitySvc.isSupported).toHaveBeenCalledWith(DataStorageType.AWS_ATHENA);
    });

    it('triggers capability check when aggregationConfig has rules', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'amount', type: 'INTEGER' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['amount'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'amount', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();

      expect(capabilitySvc.isSupported).toHaveBeenCalledWith(supportedStorageType);
    });

    // Row Count is no longer auto-appended to aggregated reports, so a real dimension column
    // named "Row Count" projects cleanly — the name is not reserved on the report-save path.
    it('accepts a dimension column named "Row Count" in an aggregated report', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'Row Count', type: 'STRING' },
        { name: 'amount', type: 'INTEGER' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['Row Count', 'amount'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'amount', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('throws BadRequestException with invalid aggregation shape (Zod)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'amount', type: 'INTEGER' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['amount'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'amount', function: 'INVALID_FN' }] as never,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException with AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE for SUM on string', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'name', type: 'STRING' },
        { name: 'amount', type: 'INTEGER' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['name', 'amount'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'name', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors[0].code).toBe('AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE');
    });

    it('throws BadRequestException with AGGREGATION_COLUMN_NOT_SELECTED when column not in schema', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'amount', type: 'INTEGER' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['amount'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'missing', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors[0].code).toBe('AGGREGATION_COLUMN_NOT_SELECTED');
    });

    it('passes with valid aggregation on a numeric column', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'name', type: 'STRING' },
        { name: 'amount', type: 'INTEGER' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['name', 'amount'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'amount', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('validateForReport — dateTruncConfig', () => {
    const supportedStorageType = DataStorageType.GOOGLE_BIGQUERY;

    const makeCapabilityService = (supported: boolean) => ({
      isSupported: jest.fn().mockReturnValue(supported),
    });

    const makeBlendableSchemaService = (nativeFields: { name: string; type: string }[] = []) => ({
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields,
        blendedFields: [],
        availableSources: [],
        mainUniqueCountKeyFields: mainKeyFieldsOf(nativeFields),
      }),
    });

    it('triggers capability check when only dateTruncConfig has rules', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'date', type: 'DATE' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['date'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: null,
          dateTruncConfig: [{ column: 'date', unit: 'MONTH' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();

      expect(capabilitySvc.isSupported).toHaveBeenCalledWith(supportedStorageType);
    });

    it('throws BadRequestException with invalid date-trunc shape (Zod)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'date', type: 'DATE' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['date'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: null,
          dateTruncConfig: [{ column: 'date', unit: 'HOUR' }] as never,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('throws DATE_TRUNC_REQUIRES_DATE_COLUMN for a string column', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'name', type: 'STRING' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['name'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: null,
          dateTruncConfig: [{ column: 'name', unit: 'MONTH' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors[0].code).toBe('DATE_TRUNC_REQUIRES_DATE_COLUMN');
    });

    it('throws DATE_TRUNC_COLUMN_IS_AGGREGATED when a column is both truncated and aggregated', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'date', type: 'DATE' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['date'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'date', function: 'MAX' }],
          dateTruncConfig: [{ column: 'date', unit: 'MONTH' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors.some(e => e.code === 'DATE_TRUNC_COLUMN_IS_AGGREGATED')).toBe(
        true
      );
    });

    it('accepts dateTruncConfig on a native DATE dimension with a blended column also selected', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = {
        computeBlendableSchema: jest.fn().mockResolvedValue({
          nativeFields: [{ name: 'date', type: BigQueryFieldType.DATE }],
          blendedFields: [
            {
              name: 'partner__cost',
              aliasPath: 'partner',
              originalFieldName: 'cost',
              type: BigQueryFieldType.INTEGER,
              isHidden: false,
            },
          ],
          availableSources: [{ aliasPath: 'partner', isIncluded: true }],
        }),
      };
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['date', 'partner__cost'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: null,
          dateTruncConfig: [{ column: 'date', unit: 'MONTH' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('passes with a valid date-trunc on a selected DATE dimension', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'date', type: 'DATE' },
        { name: 'revenue', type: 'INTEGER' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['date', 'revenue'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
          dateTruncConfig: [{ column: 'date', unit: 'MONTH' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('validateForReport — uniqueCountConfig', () => {
    const supportedStorageType = DataStorageType.GOOGLE_BIGQUERY;

    const makeCapabilityService = (supported: boolean) => ({
      isSupported: jest.fn().mockReturnValue(supported),
    });

    const makeBlendableSchemaService = (
      nativeFields: { name: string; type: string; isPrimaryKey?: boolean }[] = [],
      availableSources: { aliasPath: string }[] = []
    ) => ({
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields,
        blendedFields: [],
        availableSources,
        mainUniqueCountKeyFields: mainKeyFieldsOf(nativeFields),
      }),
    });

    it('is treated as having output controls when uniqueCountConfig is true (capability check runs)', async () => {
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: true,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).rejects.toThrow(BadRequestException);

      expect(capabilitySvc.isSupported).toHaveBeenCalled();
    });

    it('does not treat uniqueCountConfig: false as having output controls', async () => {
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService();
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: false,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();

      expect(capabilitySvc.isSupported).not.toHaveBeenCalled();
    });

    it('does not treat uniqueCountConfig: null as having output controls', async () => {
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService();
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();

      expect(capabilitySvc.isSupported).not.toHaveBeenCalled();
    });

    it('accepts uniqueCountConfig: true when the data mart has a single primary-key field', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'name', type: 'STRING' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: true,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('accepts uniqueCountConfig: true when the data mart has a composite primary key', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'user_id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'session_id', type: 'STRING', isPrimaryKey: true },
        { name: 'name', type: 'STRING' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: true,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    // The key column is hidden for reporting, so it is absent from `nativeFields` entirely — the
    // metric is still counted by it, and re-deriving the gate from that list would refuse a report
    // whose SQL is perfectly valid.
    it('accepts uniqueCountConfig: true on a key the reporting view does not carry', async () => {
      const validator = new OutputControlsValidatorService(
        { isSupported: jest.fn().mockReturnValue(true) } as never,
        {
          computeBlendableSchema: jest.fn().mockResolvedValue({
            nativeFields: [{ name: 'name', type: 'STRING' }],
            blendedFields: [],
            availableSources: [],
            mainUniqueCountKeyFields: ['id'],
          }),
        } as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: true,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('rejects uniqueCountConfig: true when the data mart has NO primary-key fields → UNIQUE_COUNT_REQUIRES_PRIMARY_KEY', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'name', type: 'STRING' },
        { name: 'amount', type: 'INTEGER' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: true,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(
        response.details.errors.some(e => e.code === 'UNIQUE_COUNT_REQUIRES_PRIMARY_KEY')
      ).toBe(true);
    });

    it('does not emit UNIQUE_COUNT_REQUIRES_PRIMARY_KEY when uniqueCountConfig is false and no PK', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'name', type: 'STRING' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: false,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('does not emit UNIQUE_COUNT_REQUIRES_PRIMARY_KEY when uniqueCountConfig is null and no PK', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'name', type: 'STRING' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('accepts sorting by "Unique Count" when uniqueCountConfig is true', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'name', type: 'STRING' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
          limitConfig: null,
          uniqueCountConfig: true,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('rejects sorting by "Unique Count" when uniqueCountConfig is not enabled → SORT_COLUMN_NOT_SELECTED', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
        { name: 'name', type: 'STRING' },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
          limitConfig: null,
          uniqueCountConfig: false,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      // Assert the class before getResponse(): if a regression routes this to the
      // BusinessViolationException (disconnected-columns) path instead, that surfaces as a
      // readable assertion diff rather than `TypeError: caught.getResponse is not a function`.
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors.some(e => e.code === 'SORT_COLUMN_NOT_SELECTED')).toBe(true);
    });

    // Array-form config (#6792): a joined-only source still counts as an output control, but the
    // MAIN-only checks (PK requirement, sort/column-name gating) key off hasMainUniqueCount, not
    // the array's mere presence.
    it('is treated as having output controls when uniqueCountConfig is a joined-only array (capability check runs)', async () => {
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: ['orders'],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).rejects.toThrow(BadRequestException);

      expect(capabilitySvc.isSupported).toHaveBeenCalled();
    });

    it('does not emit UNIQUE_COUNT_REQUIRES_PRIMARY_KEY for a joined-only array (main not requested)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'name', type: 'STRING' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          // Explicit: a joined Unique Count requires one (see the columnConfig block below).
          columnConfig: ['name'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: ['orders'],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('rejects a joined Unique Count with NO column projection (would fail every run)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          // The default state of a brand-new report: "all native columns".
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: ['orders'],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(
        response.details.errors.some(e => e.code === 'JOINED_UNIQUE_COUNT_REQUIRES_COLUMN_CONFIG')
      ).toBe(true);
      // The MAIN metric was never requested, so its PK requirement must stay quiet.
      expect(
        response.details.errors.some(e => e.code === 'UNIQUE_COUNT_REQUIRES_PRIMARY_KEY')
      ).toBe(false);
    });

    it('accepts a joined Unique Count with an EXPLICIT EMPTY projection (metrics-only read)', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      // `[]` is not the same as null: the blended builder handles an explicitly empty projection,
      // which is what query_data_mart sends for a Unique-Count-only request.
      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: [],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: ['orders'],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('rejects a real field whose name collides with a joined source’s Unique Count column', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'id', type: 'INTEGER', isPrimaryKey: true },
      ]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          // A real flat field called `unique_count` on `orders` unifies to this exact name.
          columnConfig: ['id', 'orders__unique_count'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: ['orders'],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as {
        details: { errors: { code: string; label?: string }[] };
      };
      expect(
        response.details.errors.some(
          e => e.code === 'OUTPUT_COLUMN_NAME_COLLISION' && e.label === 'orders__unique_count'
        )
      ).toBe(true);
    });

    it('rejects the main source in an array config when the data mart has NO primary-key fields', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([{ name: 'name', type: 'STRING' }]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: null,
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          uniqueCountConfig: [MAIN_UNIQUE_COUNT_SOURCE, 'orders'],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(
        response.details.errors.some(e => e.code === 'UNIQUE_COUNT_REQUIRES_PRIMARY_KEY')
      ).toBe(true);
    });
  });

  // #6792 + #6764: a joined source's `<aliasPath>__unique_count` is sortable exactly like the main
  // `Unique Count` — a sort resolves to the outer SELECT alias. Filters and aggregations on it stay
  // rejected: a filter has no CTE column to bind to, and aggregating an aggregate is meaningless.
  describe('validateForReport — sorting by a joined Unique Count', () => {
    const supportedStorageType = DataStorageType.GOOGLE_BIGQUERY;

    type SourceOverride = {
      aliasPath: string;
      isIncluded?: boolean;
      uniqueCountAvailability?: string;
    };

    const makeValidator = (sources: SourceOverride[] = [{ aliasPath: 'orders' }]) =>
      new OutputControlsValidatorService(
        { isSupported: jest.fn().mockReturnValue(true) } as never,
        {
          computeBlendableSchema: jest.fn().mockResolvedValue({
            nativeFields: [{ name: 'id', type: 'INTEGER', isPrimaryKey: true }],
            blendedFields: [],
            mainUniqueCountKeyFields: ['id'],
            availableSources: sources.map(s => ({
              isIncluded: true,
              uniqueCountAvailability: 'available',
              title: 'Orders DM',
              defaultAlias: 'Orders',
              ...s,
            })),
          }),
        } as never
      );

    const validateWith = (
      validator: OutputControlsValidatorService,
      overrides: Partial<Parameters<OutputControlsValidatorService['validateForReport']>[0]>
    ) =>
      validator.validateForReport({
        storageType: supportedStorageType,
        dataMartId: 'dm-1',
        projectId: 'proj-1',
        columnConfig: ['id'],
        filterConfig: null,
        sortConfig: null,
        limitConfig: null,
        aggregationConfig: null,
        accessor: { userId: 'user-1', roles: ['admin'] },
        ...overrides,
      });

    const catchError = async (promise: Promise<void>): Promise<unknown> => {
      try {
        await promise;
      } catch (e) {
        return e;
      }
      return undefined;
    };

    it('accepts a sort on a joined source’s Unique Count when that source is enabled', async () => {
      await expect(
        validateWith(makeValidator(), {
          sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
          uniqueCountConfig: ['orders'],
        })
      ).resolves.toBeUndefined();
    });

    it('accepts a sort on a NESTED source’s Unique Count', async () => {
      await expect(
        validateWith(makeValidator([{ aliasPath: 'orders' }, { aliasPath: 'orders.items' }]), {
          sortConfig: [{ column: 'orders_items__unique_count', direction: 'asc' }],
          uniqueCountConfig: ['orders.items'],
        })
      ).resolves.toBeUndefined();
    });

    // The defect this closes: unticking a source used to route the leftover sort rule to the
    // "contact your analyst to restore the schema" message, which names the wrong cause.
    it('classifies a stale sort left after unticking the source as SORT_COLUMN_NOT_SELECTED', async () => {
      const caught = await catchError(
        validateWith(makeValidator(), {
          sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
          uniqueCountConfig: null,
        })
      );

      expect(caught).toBeInstanceOf(BadRequestException);
      const response = (caught as BadRequestException).getResponse() as {
        details: { errors: { code: string; column?: string }[] };
      };
      expect(
        response.details.errors.some(
          e => e.code === 'SORT_COLUMN_NOT_SELECTED' && e.column === 'orders__unique_count'
        )
      ).toBe(true);
    });

    // The run path DROPS a source that lost its key or its reporting inclusion, and the stale sort
    // rule with it (BlendedReportDataService) — so holding the rule against the report here would
    // 400 every scheduled run of a report no editor is ever opened on. Sortability is decided by
    // the configured sources, exactly as the main metric's is decided by its own toggle.
    it.each([
      [
        'its primary key is gone',
        { aliasPath: 'orders', uniqueCountAvailability: 'no-primary-key' },
      ],
      ['it is excluded from reporting', { aliasPath: 'orders', isIncluded: false }],
    ])('does not fail the SORT rule of a joined Unique Count when %s', async (_case, source) => {
      const caught = await catchError(
        validateWith(makeValidator([source]), {
          sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
          uniqueCountConfig: ['orders'],
        })
      );

      const errors =
        caught instanceof BadRequestException
          ? ((caught.getResponse() as { details?: { errors?: { code: string }[] } }).details
              ?.errors ?? [])
          : [];
      expect(errors.some(e => e.code === 'SORT_COLUMN_NOT_SELECTED')).toBe(false);
    });

    it('classifies a sort on a source that is NOT in the schema at all as disconnected', async () => {
      const caught = await catchError(
        validateWith(makeValidator(), {
          sortConfig: [{ column: 'ghosts__unique_count', direction: 'desc' }],
          uniqueCountConfig: ['orders'],
        })
      );

      expectDisconnectedColumnsError(caught, ['ghosts__unique_count']);
    });

    // Rejecting is right; blaming the schema was not. The rule used to fall through as an unknown
    // filter column and land on "restore the disconnected link", telling the user to repair
    // something that is not broken — the metric exists, it just cannot carry a predicate.
    it.each([
      ['a joined source', 'orders__unique_count', ['orders'] as string[] | boolean],
      ['the main Data Mart', 'Unique Count', true],
    ])(
      'names the real reason a FILTER on %s Unique Count is refused',
      async (_case, column, uniqueCountConfig) => {
        const caught = await catchError(
          validateWith(makeValidator(), {
            filterConfig: [{ column, operator: 'eq', value: 5 }],
            uniqueCountConfig,
          })
        );

        expect(caught).toBeInstanceOf(BadRequestException);
        const errors = (
          (caught as BadRequestException).getResponse() as {
            details: { errors: { code: string; column?: string; message?: string }[] };
          }
        ).details.errors;
        const refusal = errors.find(e => e.code === 'UNIQUE_COUNT_FILTER_UNSUPPORTED');
        expect(refusal).toMatchObject({ column });
        expect(refusal?.message).toContain('selected and sorted by, but not filtered');
        expect(errors.some(e => e.code === 'FILTER_COLUMN_UNKNOWN')).toBe(false);
      }
    );

    it('refuses a pre-join SLICE on a joined Unique Count the same way', async () => {
      const caught = await catchError(
        validateWith(makeValidator(), {
          filterConfig: [
            {
              column: 'orders__unique_count',
              operator: 'eq',
              value: 5,
              placement: 'pre-join',
            },
          ],
          uniqueCountConfig: ['orders'],
        })
      );

      const errors = (
        (caught as BadRequestException).getResponse() as {
          details: { errors: { code: string; column?: string }[] };
        }
      ).details.errors;
      expect(
        errors.some(
          e => e.code === 'UNIQUE_COUNT_FILTER_UNSUPPORTED' && e.column === 'orders__unique_count'
        )
      ).toBe(true);
    });

    // A REAL field may legitimately be called `orders__unique_count`; the name clash is the
    // OUTPUT_COLUMN_NAME_COLLISION check's business, not a reason to refuse a filter on a column
    // that genuinely exists.
    it('leaves a filter on a real field of the same name alone', async () => {
      const validator = new OutputControlsValidatorService(
        { isSupported: jest.fn().mockReturnValue(true) } as never,
        {
          computeBlendableSchema: jest.fn().mockResolvedValue({
            nativeFields: [{ name: 'orders__unique_count', type: 'INTEGER' }],
            blendedFields: [],
            availableSources: [
              {
                aliasPath: 'orders',
                isIncluded: true,
                uniqueCountAvailability: 'available',
                title: 'Orders DM',
                defaultAlias: 'Orders',
              },
            ],
          }),
        } as never
      );

      await expect(
        validateWith(validator, {
          columnConfig: ['orders__unique_count'],
          filterConfig: [{ column: 'orders__unique_count', operator: 'eq', value: 5 }],
          uniqueCountConfig: null,
        })
      ).resolves.toBeUndefined();
    });

    // A real field that went HIDDEN is a broken schema link, not a metric. Calling it a Unique
    // Count is simply false — the report may have no Unique Count enabled at all — and it hides
    // the one diagnosis that names the field and says how to repair it.
    it('routes a filter on a since-hidden real field to the disconnected diagnosis', async () => {
      const validator = new OutputControlsValidatorService(
        { isSupported: jest.fn().mockReturnValue(true) } as never,
        {
          computeBlendableSchema: jest.fn().mockResolvedValue({
            nativeFields: [{ name: 'channel', type: 'STRING' }],
            blendedFields: [
              {
                name: 'orders__unique_count',
                type: 'INTEGER',
                aliasPath: 'orders',
                isHidden: true,
              },
            ],
            availableSources: [
              {
                aliasPath: 'orders',
                isIncluded: true,
                uniqueCountAvailability: 'available',
                title: 'Orders DM',
                defaultAlias: 'Orders',
              },
            ],
          }),
        } as never
      );

      const caught = await catchError(
        validateWith(validator, {
          columnConfig: ['channel'],
          filterConfig: [{ column: 'orders__unique_count', operator: 'eq', value: 5 }],
          uniqueCountConfig: null,
        })
      );

      expectDisconnectedColumnsError(caught, ['orders__unique_count']);
    });

    // Same honesty as the filter refusal above: these used to fall through to the `type ===
    // undefined` branches and come back as a TYPE problem on a schema that is perfectly fine.
    it.each([
      [
        'AGGREGATION',
        { aggregationConfig: [{ column: 'orders__unique_count', function: 'SUM' as const }] },
        'UNIQUE_COUNT_AGGREGATION_UNSUPPORTED',
        'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
      ],
      [
        'DATE BUCKET',
        { dateTruncConfig: [{ column: 'orders__unique_count', unit: 'DAY' as const }] },
        'UNIQUE_COUNT_DATE_TRUNC_UNSUPPORTED',
        'DATE_TRUNC_REQUIRES_DATE_COLUMN',
      ],
    ])(
      'names the real reason an %s on a joined Unique Count is refused',
      async (_case, config, expectedCode, misleadingCode) => {
        const caught = await catchError(
          validateWith(makeValidator(), {
            ...config,
            columnConfig: ['channel'],
            uniqueCountConfig: ['orders'],
          })
        );

        expect(caught).toBeInstanceOf(BadRequestException);
        const errors = (
          (caught as BadRequestException).getResponse() as {
            details: { errors: { code: string; column?: string; message?: string }[] };
          }
        ).details.errors;
        expect(errors.find(e => e.code === expectedCode)).toMatchObject({
          column: 'orders__unique_count',
        });
        expect(errors.some(e => e.code === misleadingCode)).toBe(false);
      }
    );

    // The metric is emitted from uniqueCountConfig, never projected. MCP's add_report copies
    // `fields` straight into columnConfig, so this used to save clean and fail every run — after
    // the Google Sheet already existed.
    it('refuses a Unique Count column named in the PROJECTION, with no other output control', async () => {
      const caught = await catchError(
        validateWith(makeValidator(), {
          columnConfig: ['channel', 'orders__unique_count'],
          uniqueCountConfig: null,
        })
      );

      expect(caught).toBeInstanceOf(BadRequestException);
      const errors = (
        (caught as BadRequestException).getResponse() as {
          details: { errors: { code: string; column?: string; message?: string }[] };
        }
      ).details.errors;
      expect(errors.find(e => e.code === 'UNIQUE_COUNT_COLUMN_NOT_PROJECTABLE')).toMatchObject({
        column: 'orders__unique_count',
      });
    });

    // Legacy `true` is the MAIN metric only — it must not start selecting joined names.
    it('leaves the legacy uniqueCountConfig: true report untouched', async () => {
      const validator = makeValidator();

      await expect(
        validateWith(validator, {
          sortConfig: [{ column: 'Unique Count', direction: 'desc' }],
          uniqueCountConfig: true,
        })
      ).resolves.toBeUndefined();

      const caught = await catchError(
        validateWith(makeValidator(), {
          sortConfig: [{ column: 'orders__unique_count', direction: 'desc' }],
          uniqueCountConfig: true,
        })
      );
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = (caught as BadRequestException).getResponse() as {
        details: { errors: { code: string }[] };
      };
      expect(response.details.errors.some(e => e.code === 'SORT_COLUMN_NOT_SELECTED')).toBe(true);
    });

    // #6792 F8: a source that can never emit its column is silence today — accepted at save and
    // dropped at run. Only the SAVE paths reject it: the run path is where the drop is by design.
    describe('rejectUnavailableUniqueCountSources (save paths)', () => {
      const errorsOf = (caught: unknown) =>
        caught instanceof BadRequestException
          ? ((
              caught.getResponse() as {
                details?: { errors?: { code: string; message?: string }[] };
              }
            ).details?.errors ?? [])
          : [];

      it.each([
        [
          'its primary key is gone',
          { aliasPath: 'orders', uniqueCountAvailability: 'no-primary-key' },
        ],
        [
          'its primary key is disconnected',
          { aliasPath: 'orders', uniqueCountAvailability: 'disconnected-primary-key' },
        ],
        [
          'its primary key is nested',
          { aliasPath: 'orders', uniqueCountAvailability: 'nested-primary-key' },
        ],
        [
          'its primary key is nested AND disconnected',
          {
            aliasPath: 'orders',
            uniqueCountAvailability: 'nested-and-disconnected-primary-key',
          },
        ],
      ])(
        'rejects a save whose joined Unique Count source cannot emit — %s',
        async (_case, source) => {
          const caught = await catchError(
            validateWith(makeValidator([source]), {
              uniqueCountConfig: ['orders'],
              rejectUnavailableUniqueCountSources: true,
            })
          );

          const errors = errorsOf(caught);
          const error = errors.find(e => e.code === 'JOINED_UNIQUE_COUNT_SOURCE_UNAVAILABLE');
          expect(error).toBeDefined();
          expect(error!.message).toContain('Orders');
        }
      );

      // The table above is hand-maintained; this reads the vocabulary itself, so a verdict added
      // later without a reason string fails here instead of silently permitting the save.
      it('has a stated reason for EVERY non-available verdict', async () => {
        const unavailable = JOINED_UNIQUE_COUNT_AVAILABILITY_VALUES.filter(v => v !== 'available');
        expect(unavailable.length).toBeGreaterThan(0);

        for (const uniqueCountAvailability of unavailable) {
          const caught = await catchError(
            validateWith(makeValidator([{ aliasPath: 'orders', uniqueCountAvailability }]), {
              uniqueCountConfig: ['orders'],
              rejectUnavailableUniqueCountSources: true,
            })
          );

          const error = errorsOf(caught).find(
            e => e.code === 'JOINED_UNIQUE_COUNT_SOURCE_UNAVAILABLE'
          );
          expect(`${uniqueCountAvailability}: ${error?.message ?? 'NOT REJECTED'}`).toContain(
            'cannot supply its Unique Count:'
          );
        }
      });

      it('rejects a save whose joined Unique Count source is not in the schema at all', async () => {
        const caught = await catchError(
          validateWith(makeValidator(), {
            uniqueCountConfig: ['ghosts'],
            rejectUnavailableUniqueCountSources: true,
          })
        );

        const error = errorsOf(caught).find(
          e => e.code === 'JOINED_UNIQUE_COUNT_SOURCE_UNAVAILABLE'
        );
        expect(error).toBeDefined();
        expect(error!.message).toContain('ghosts');
      });

      // The main mart's marker is not an alias path — it has its own PK gate and must never be
      // looked up among the joined sources, or every main-only save would break.
      it.each([
        ['the legacy boolean', true],
        ['the marker entry', ['']],
      ])('leaves a MAIN-only Unique Count alone — %s', async (_case, uniqueCountConfig) => {
        await expect(
          validateWith(makeValidator([{ aliasPath: 'orders', isIncluded: false }]), {
            uniqueCountConfig: uniqueCountConfig as never,
            rejectUnavailableUniqueCountSources: true,
          })
        ).resolves.toBeUndefined();
      });

      // The picker KEEPS an excluded source's entry so the user can clear it, and renders the row
      // as not generated. Blocking the save would trap every other edit to the report.
      it('accepts a save whose joined Unique Count source is only EXCLUDED from reporting', async () => {
        await expect(
          validateWith(makeValidator([{ aliasPath: 'orders', isIncluded: false }]), {
            uniqueCountConfig: ['orders'],
            rejectUnavailableUniqueCountSources: true,
          })
        ).resolves.toBeUndefined();
      });

      // The run path re-validates the STORED config on every read; rejecting there would turn a
      // documented degradation into a 400 on every schedule.
      it('leaves the run path alone (no flag → no rejection)', async () => {
        await expect(
          validateWith(
            makeValidator([{ aliasPath: 'orders', uniqueCountAvailability: 'no-primary-key' }]),
            { uniqueCountConfig: ['orders'] }
          )
        ).resolves.toBeUndefined();
      });

      it('accepts an available source', async () => {
        await expect(
          validateWith(makeValidator(), {
            uniqueCountConfig: ['orders'],
            rejectUnavailableUniqueCountSources: true,
          })
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('validateForReport — HAVING on a blended sleeve metric ( sleeve gate, wiring)', () => {
    const supportedStorageType = DataStorageType.GOOGLE_BIGQUERY;

    const makeCapabilityService = (supported: boolean) => ({
      isSupported: jest.fn().mockReturnValue(supported),
    });

    const makeBlendableSchemaService = (
      nativeFields: { name: string; type: string }[],
      blendedFields: {
        name: string;
        type: string;
        aliasPath?: string;
        originalFieldName?: string;
        isHidden?: boolean;
      }[]
    ) => ({
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields,
        blendedFields,
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
        mainUniqueCountKeyFields: mainKeyFieldsOf(nativeFields),
      }),
    });

    const orderIdBlendedField = {
      name: 'orders__orderId',
      type: 'STRING',
      aliasPath: 'orders',
      originalFieldName: 'orderId',
    };

    const orderAmountBlendedField = {
      name: 'orders__amount',
      type: 'INTEGER',
      aliasPath: 'orders',
      originalFieldName: 'amount',
    };

    it('end-to-end: rejects a stored HAVING COUNT_DISTINCT rule on a joined (blended) column', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([], [orderIdBlendedField]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['orders__orderId'],
          filterConfig: [
            { column: 'orders__orderId', function: 'COUNT_DISTINCT', operator: 'gt', value: 5 },
          ],
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'orders__orderId', function: 'COUNT_DISTINCT' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as {
        details: { errors: { code: string; column?: string }[] };
      };
      expect(
        response.details.errors.some(
          e =>
            e.code === 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED' &&
            e.column === 'orders__orderId'
        )
      ).toBe(true);
    });

    it('end-to-end: rejects a stored HAVING SUM rule on a joined (blended) column', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([], [orderAmountBlendedField]);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      let caught: BadRequestException | undefined;
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['orders__amount'],
          filterConfig: [{ column: 'orders__amount', function: 'SUM', operator: 'gt', value: 100 }],
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'orders__amount', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      expect(caught).toBeInstanceOf(BadRequestException);
      const response = caught!.getResponse() as {
        details: { errors: { code: string; column?: string; function?: string }[] };
      };
      expect(
        response.details.errors.some(
          e =>
            e.code === 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED' &&
            e.column === 'orders__amount' &&
            e.function === 'SUM'
        )
      ).toBe(true);
    });

    it('end-to-end: allows a stored HAVING SUM rule on a MAIN (native) column', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'revenue', type: 'INTEGER' }],
        [orderAmountBlendedField]
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['revenue'],
          filterConfig: [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 100 }],
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });

    it('end-to-end: allows a stored HAVING COUNT_DISTINCT rule on a MAIN (native) column', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService(
        [{ name: 'name', type: 'STRING' }],
        [orderIdBlendedField]
      );
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          columnConfig: ['name'],
          filterConfig: [{ column: 'name', function: 'COUNT_DISTINCT', operator: 'gt', value: 5 }],
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: [{ column: 'name', function: 'COUNT_DISTINCT' }],
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('validateHavingFilters (post-aggregation)', () => {
    const aggregations = [
      { column: 'amount', function: 'SUM' as const },
      { column: 'name', function: 'COUNT' as const },
    ];
    const resolveType = (c: string): string | undefined =>
      ({ amount: 'INTEGER', name: 'STRING' })[c];

    it('accepts a HAVING rule whose (column, function) matches a configured aggregation', () => {
      const errors = svc.validateHavingFilters(
        [{ column: 'amount', function: 'SUM', operator: 'gt', value: 1000 }],
        aggregations,
        resolveType,
        DataStorageType.GOOGLE_BIGQUERY,
        new Map()
      );
      expect(errors).toEqual([]);
    });

    it('rejects a HAVING rule whose (column, function) is not a configured aggregation', () => {
      const errors = svc.validateHavingFilters(
        [{ column: 'amount', function: 'AVG', operator: 'gt', value: 1 }],
        aggregations,
        resolveType,
        DataStorageType.GOOGLE_BIGQUERY,
        new Map()
      );
      expect(errors).toEqual([
        { code: 'HAVING_FILTER_NOT_AGGREGATED', column: 'amount', function: 'AVG' },
      ]);
    });

    it('validates the operator against the aggregate EFFECTIVE type (COUNT(string) > n is OK)', () => {
      const errors = svc.validateHavingFilters(
        [{ column: 'name', function: 'COUNT', operator: 'gt', value: 5 }],
        aggregations,
        resolveType,
        DataStorageType.GOOGLE_BIGQUERY,
        new Map()
      );
      // COUNT(name) is INTEGER, so a numeric comparison is valid even though `name` is STRING.
      expect(errors).toEqual([]);
    });

    it('rejects an operator that is invalid for the aggregate EFFECTIVE type (contains on SUM→INTEGER)', () => {
      const errors = svc.validateHavingFilters(
        [{ column: 'amount', function: 'SUM', operator: 'contains', value: 'x' }],
        aggregations,
        resolveType,
        DataStorageType.GOOGLE_BIGQUERY,
        new Map()
      );
      // SUM(amount) keeps the raw INTEGER type; `contains` is a string-only operator,
      // so it is invalid for the aggregate's effective numeric type.
      expect(errors).toEqual([
        {
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: 'amount',
          type: 'INTEGER',
          operator: 'contains',
        },
      ]);
    });

    it('ignores rules without a function (those are WHERE rules)', () => {
      const errors = svc.validateHavingFilters(
        [{ column: 'amount', operator: 'gt', value: 1 }],
        aggregations,
        resolveType,
        DataStorageType.GOOGLE_BIGQUERY,
        new Map()
      );
      expect(errors).toEqual([]);
    });

    it('rejects a HAVING rule pushed pre-join (function + placement:pre-join)', () => {
      const errors = svc.validateHavingFilters(
        [
          {
            column: 'amount',
            function: 'SUM',
            operator: 'gt',
            value: 1000,
            placement: 'pre-join',
          },
        ],
        aggregations,
        resolveType,
        DataStorageType.GOOGLE_BIGQUERY,
        new Map()
      );
      expect(errors).toEqual([
        { code: 'HAVING_FILTER_INVALID_PLACEMENT', column: 'amount', function: 'SUM' },
      ]);
    });

    // sleeve gate: a joined COUNT_DISTINCT/SUM/AVG (SLEEVE_ROUTED_FUNCTIONS) is
    // rendered in SELECT via a "sleeve" CTE (computed at the report's dimension grain) to
    // avoid join-fanout over/under-counting, but HAVING is not yet routed through that
    // sleeve — it would silently filter on the OLD, wrong dedup-CTE value. Block the
    // combination until sleeve-routed HAVING lands. MIN/MAX/COUNT are NOT sleeve-routed
    // (no fan-out correction needed) and stay unaffected even on a blended column.
    describe('HAVING sleeve-routed metric (COUNT_DISTINCT/SUM/AVG) on a BLENDED column ( sleeve gate)', () => {
      const blendedEntry = {
        aliasPath: 'orders',
        cteName: 'orders',
        originalFieldName: 'orderId',
        type: 'STRING',
        sourceFieldType: 'STRING',
        isIncluded: true,
      };
      const blendedAmountEntry = {
        aliasPath: 'orders',
        cteName: 'orders',
        originalFieldName: 'amount',
        type: 'INTEGER',
        sourceFieldType: 'INTEGER',
        isIncluded: true,
      };
      const blendedFieldIndex = new Map([
        ['orders__orderId', blendedEntry],
        ['orders__amount', blendedAmountEntry],
      ]);
      const blendedAggregations = [
        { column: 'orders__orderId', function: 'COUNT_DISTINCT' as const },
      ];
      const blendedResolveType = () => 'STRING';

      // The gate is only ever armed because `blendedFieldIndex` is a REQUIRED parameter: giving
      // it a `= new Map()` default would disable the gate for every existing caller while still
      // compiling and still passing every test below. `Function.length` stops counting at the
      // first parameter with a default, so this pins the arity — and therefore the absence of
      // that default.
      it('keeps blendedFieldIndex a required parameter (no default that would disable the gate)', () => {
        expect(svc.validateHavingFilters.length).toBe(5);
      });

      it('rejects a HAVING COUNT_DISTINCT rule whose column is BLENDED (joined)', () => {
        const errors = svc.validateHavingFilters(
          [{ column: 'orders__orderId', function: 'COUNT_DISTINCT', operator: 'gt', value: 5 }],
          blendedAggregations,
          blendedResolveType,
          DataStorageType.GOOGLE_BIGQUERY,
          blendedFieldIndex
        );
        expect(errors).toEqual([
          {
            code: 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED',
            column: 'orders__orderId',
            function: 'COUNT_DISTINCT',
            message: expect.stringContaining('orders__orderId'),
          },
        ]);
      });

      it('rejects a HAVING SUM rule whose column is BLENDED (joined)', () => {
        const errors = svc.validateHavingFilters(
          [{ column: 'orders__amount', function: 'SUM', operator: 'gt', value: 100 }],
          [{ column: 'orders__amount', function: 'SUM' }],
          () => 'INTEGER',
          DataStorageType.GOOGLE_BIGQUERY,
          blendedFieldIndex
        );
        expect(errors).toEqual([
          {
            code: 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED',
            column: 'orders__amount',
            function: 'SUM',
            message: expect.stringContaining('orders__amount'),
          },
        ]);
      });

      it('rejects a HAVING AVG rule whose column is BLENDED (joined)', () => {
        const errors = svc.validateHavingFilters(
          [{ column: 'orders__amount', function: 'AVG', operator: 'gt', value: 10 }],
          [{ column: 'orders__amount', function: 'AVG' }],
          () => 'INTEGER',
          DataStorageType.GOOGLE_BIGQUERY,
          blendedFieldIndex
        );
        expect(errors).toEqual([
          {
            code: 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED',
            column: 'orders__amount',
            function: 'AVG',
            message: expect.stringContaining('orders__amount'),
          },
        ]);
      });

      it('rejects a HAVING percentile rule whose column is BLENDED (joined)', () => {
        const errors = svc.validateHavingFilters(
          [{ column: 'orders__amount', function: 'P95', operator: 'gt', value: 10 }],
          [{ column: 'orders__amount', function: 'P95' }],
          () => 'INTEGER',
          DataStorageType.GOOGLE_BIGQUERY,
          blendedFieldIndex
        );
        expect(errors).toEqual([
          {
            code: 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED',
            column: 'orders__amount',
            function: 'P95',
            message: expect.stringContaining('orders__amount'),
          },
        ]);
      });

      it('allows a HAVING percentile rule whose column is MAIN (no sleeve involved)', () => {
        const errors = svc.validateHavingFilters(
          [{ column: 'revenue', function: 'P95', operator: 'gt', value: 10 }],
          [{ column: 'revenue', function: 'P95' }],
          () => 'INTEGER',
          DataStorageType.GOOGLE_BIGQUERY,
          blendedFieldIndex // 'revenue' is not a key in this index
        );
        expect(errors).toEqual([]);
      });

      it('allows a HAVING COUNT_DISTINCT rule whose column is MAIN (native, not in the blended index)', () => {
        const errors = svc.validateHavingFilters(
          [{ column: 'name', function: 'COUNT_DISTINCT', operator: 'gt', value: 5 }],
          [{ column: 'name', function: 'COUNT_DISTINCT' }],
          () => 'STRING',
          DataStorageType.GOOGLE_BIGQUERY,
          blendedFieldIndex // 'name' is not a key in this index
        );
        expect(errors).toEqual([]);
      });

      it('allows a HAVING SUM rule whose column is MAIN (native, not in the blended index)', () => {
        const errors = svc.validateHavingFilters(
          [{ column: 'revenue', function: 'SUM', operator: 'gt', value: 100 }],
          [{ column: 'revenue', function: 'SUM' }],
          () => 'INTEGER',
          DataStorageType.GOOGLE_BIGQUERY,
          blendedFieldIndex // 'revenue' is not a key in this index
        );
        expect(errors).toEqual([]);
      });

      it('allows a HAVING AVG rule whose column is MAIN (native, not in the blended index)', () => {
        const errors = svc.validateHavingFilters(
          [{ column: 'revenue', function: 'AVG', operator: 'gt', value: 10 }],
          [{ column: 'revenue', function: 'AVG' }],
          () => 'INTEGER',
          DataStorageType.GOOGLE_BIGQUERY,
          blendedFieldIndex // 'revenue' is not a key in this index
        );
        expect(errors).toEqual([]);
      });

      it('does not block a HAVING COUNT rule on a BLENDED column (not sleeve-routed)', () => {
        const errors = svc.validateHavingFilters(
          [{ column: 'orders__amount', function: 'COUNT', operator: 'gt', value: 1 }],
          [{ column: 'orders__amount', function: 'COUNT' }],
          () => 'INTEGER',
          DataStorageType.GOOGLE_BIGQUERY,
          blendedFieldIndex
        );
        expect(errors).toEqual([]);
      });

      it.each(['MIN', 'MAX'] as const)(
        'blocks a HAVING %s rule on a BLENDED column, which is sleeve-routed too',
        function_ => {
          const errors = svc.validateHavingFilters(
            [{ column: 'orders__amount', function: function_, operator: 'gt', value: 1 }],
            [{ column: 'orders__amount', function: function_ }],
            () => 'INTEGER',
            DataStorageType.GOOGLE_BIGQUERY,
            blendedFieldIndex
          );
          expect(errors).toEqual([
            {
              code: 'HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED',
              column: 'orders__amount',
              function: function_,
              message: expect.stringContaining('orders__amount'),
            },
          ]);
        }
      );

      it('an explicit empty blended index blocks nothing ( Mediums: blendedFieldIndex is a REQUIRED param — no silently-disabling default)', () => {
        const errors = svc.validateHavingFilters(
          [{ column: 'orders__orderId', function: 'COUNT_DISTINCT', operator: 'gt', value: 5 }],
          blendedAggregations,
          blendedResolveType,
          DataStorageType.GOOGLE_BIGQUERY,
          new Map()
        );
        expect(errors).toEqual([]);
      });
    });
  });

  describe('validateForReport — calculated fields', () => {
    const supportedStorageType = DataStorageType.GOOGLE_BIGQUERY;
    const CTR_FORMULA = 'SUM({{ref field="clicks"}}) / NULLIF(SUM({{ref field="impressions"}}), 0)';

    const makeCapabilityService = (supported: boolean) => ({
      isSupported: jest.fn().mockReturnValue(supported),
    });

    // Reproduces the production shape: `BlendableSchemaService.computeBlendableSchema` builds
    // `nativeFields` by FILTERING OUT `isHiddenForReporting`. A mock that echoes the raw list
    // back hides every bug that depends on the difference — the metric guards resolve formula
    // references, and a hidden field is legal inside a formula.
    const makeBlendableSchemaService = (
      nativeFields: Record<string, unknown>[],
      extras: {
        blendedFields?: Record<string, unknown>[];
        availableSources?: { aliasPath: string; isIncluded?: boolean }[];
      } = {}
    ) => ({
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields: nativeFields.filter(f => f.isHiddenForReporting !== true),
        blendedFields: extras.blendedFields ?? [],
        availableSources: extras.availableSources ?? [],
        mainUniqueCountKeyFields: [],
      }),
    });

    // clicks, impressions, country, and a calculated `ctr` whose references both resolve.
    const dataMartWithCtr = [
      { name: 'clicks', type: 'INTEGER' },
      { name: 'impressions', type: 'INTEGER' },
      { name: 'country', type: 'STRING' },
      { name: 'ctr', type: 'FLOAT', calculated: { formula: CTR_FORMULA, level: 'metric' } },
    ];

    // Same `ctr` formula, but `impressions` is gone from the schema — a broken reference.
    const dataMartWithBrokenCtr = [
      { name: 'clicks', type: 'INTEGER' },
      { name: 'country', type: 'STRING' },
      { name: 'ctr', type: 'FLOAT', calculated: { formula: CTR_FORMULA, level: 'metric' } },
    ];

    type CalculatedFieldOverrides = {
      columnConfig?: string[] | null;
      filterConfig?:
        | {
            column: string;
            operator: string;
            value?: unknown;
            function?: string;
            placement?: string;
          }[]
        | null;
      sortConfig?: { column: string; direction: string }[] | null;
      aggregationConfig?: { column: string; function: string }[] | null;
      dateTruncConfig?: { column: string; unit: string; timeZone?: string }[] | null;
      uniqueCountConfig?: string[] | null;
      blendedFields?: {
        name: string;
        type: string;
        aliasPath?: string;
        originalFieldName?: string;
        isHidden?: boolean;
        isCalculated?: boolean;
        sourceDataMartTitle?: string;
      }[];
      availableSources?: { aliasPath: string; isIncluded?: boolean }[];
    };

    // Most problems are ACCUMULATED into a BadRequestException's `details.errors`, but a structural
    // refusal (disconnected columns, a row-level field on a report that spans a join) throws a
    // BusinessViolationException instead — which has no `getResponse`. Both readings share one
    // construction site so they cannot drift into testing different wirings.
    async function validateCatching(
      nativeFields: Record<string, unknown>[],
      overrides: CalculatedFieldOverrides
    ): Promise<unknown> {
      const validator = new OutputControlsValidatorService(
        makeCapabilityService(true) as never,
        makeBlendableSchemaService(nativeFields, {
          blendedFields: overrides.blendedFields,
          availableSources: overrides.availableSources,
        }) as never
      );
      try {
        await validator.validateForReport({
          storageType: supportedStorageType,
          dataMartId: 'dm-ctr',
          projectId: 'proj-ctr',
          columnConfig: overrides.columnConfig ?? null,
          filterConfig: overrides.filterConfig ?? null,
          sortConfig: overrides.sortConfig ?? null,
          limitConfig: null,
          aggregationConfig: overrides.aggregationConfig ?? null,
          dateTruncConfig: overrides.dateTruncConfig ?? null,
          uniqueCountConfig: overrides.uniqueCountConfig ?? null,
          // The RAW schema, exactly as a caller holds it — hidden fields included.
          dataMartSchemaFields: nativeFields as never,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        return e;
      }
      return undefined;
    }

    async function validate(
      nativeFields: Record<string, unknown>[],
      overrides: CalculatedFieldOverrides
    ): Promise<{ code: string; message?: string; column?: string; level?: string }[]> {
      const caught = (await validateCatching(nativeFields, overrides)) as
        | BadRequestException
        | undefined;
      if (!caught) return [];
      const response = caught.getResponse() as { details: { errors: { code: string }[] } };
      return response.details.errors as { code: string; message?: string }[];
    }

    it('rejects an aggregation applied to a calculated field', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['ctr'],
        aggregationConfig: [{ column: 'ctr', function: 'SUM' }],
      });

      expect(errors[0]).toMatchObject({
        code: 'AGGREGATION_ON_CALCULATED_FIELD',
        message: expect.stringContaining('ctr'),
      });
    });

    // A calculated field is NEVER a group-by key by omission: `excludeCalculatedFieldNames`
    // keeps it out of the plain `columns` list `compose()` hands to the query builder, regardless
    // of what else in the report is aggregated — so it must validate cleanly here,
    // with or without a genuine dimension alongside it.
    it('accepts a calculated field selected alongside a real aggregation on another column, with no other dimension', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['ctr', 'clicks'],
        aggregationConfig: [{ column: 'clicks', function: 'SUM' }],
      });

      expect(errors).toEqual([]);
    });

    it('accepts a calculated field selected alongside a real aggregation AND a genuine dimension (breakdown-with-a-ratio shape)', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country', 'clicks', 'ctr'],
        aggregationConfig: [{ column: 'clicks', function: 'SUM' }],
      });

      expect(errors).toEqual([]);
    });

    it('rejects a dateTrunc rule naming a calculated field — the one shape that explicitly asks to group BY it', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['clicks'],
        dateTruncConfig: [{ column: 'ctr', unit: 'MONTH' }],
      });

      expect(errors[0]).toMatchObject({
        code: 'CALCULATED_FIELD_AS_DIMENSION',
        message: expect.stringContaining('ctr'),
      });
    });

    it('still validates a plain columnConfig-only report when it carries a calculated field', async () => {
      // Today this shape takes the validator's early-return branch and is checked for nothing at
      // all — no filter/sort/aggregation/dateTrunc/uniqueCount is set, so a bare projection used
      // to skip schema-aware validation entirely.
      const errors = await validate(dataMartWithBrokenCtr, {
        columnConfig: ['clicks', 'ctr'],
      });

      expect(errors[0].code).toBe('CALCULATED_FIELD_BROKEN_REFERENCES');
    });

    // A joined reference that no longer resolves is worse than an own one — nothing routes
    // it to a sleeve, so the joined mart's column name is qualified against `main` instead: an
    // unrecognised name at best, a plausible wrong number when main owns a column of that name.
    describe('a joined reference inside a formula', () => {
      const JOINED_METRIC = [
        { name: 'cost', type: 'FLOAT' },
        {
          name: 'roi',
          type: 'FLOAT',
          calculated: {
            formula: 'SUM({{ref path="orders" field="amount"}})',
            level: 'metric',
          },
        },
      ];
      const ordersTree = {
        blendedFields: [
          {
            name: 'orders__amount',
            type: 'FLOAT',
            aliasPath: 'orders',
            originalFieldName: 'amount',
            isHidden: false,
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      };

      it('accepts a metric whose joined reference resolves', async () => {
        const errors = await validate(JOINED_METRIC, { columnConfig: ['roi'], ...ordersTree });

        expect(errors).toEqual([]);
      });

      it('rejects a metric whose joined source is gone from the tree', async () => {
        const errors = await validate(JOINED_METRIC, { columnConfig: ['roi'] });

        expect(errors[0]).toMatchObject({
          code: 'CALCULATED_FIELD_BROKEN_REFERENCES',
          column: 'roi',
          message: expect.stringContaining('orders.amount'),
        });
      });

      it('rejects a metric whose joined field has been hidden from reporting', async () => {
        const errors = await validate(JOINED_METRIC, {
          columnConfig: ['roi'],
          ...ordersTree,
          blendedFields: [{ ...ordersTree.blendedFields[0], isHidden: true }],
        });

        expect(errors[0]).toMatchObject({
          code: 'CALCULATED_FIELD_BROKEN_REFERENCES',
          message: expect.stringContaining('orders.amount'),
        });
      });

      // An unrelated broken metric elsewhere in the schema is not this report's problem — the same
      // `usedNames` gate the own-reference half has.
      it('ignores a broken joined reference on a metric this report does not use', async () => {
        const errors = await validate(JOINED_METRIC, { columnConfig: ['cost'] });

        expect(errors).toEqual([]);
      });

      // The aggregate is lifted into a metric sleeve — recomputed at the report's grain from
      // the raw pre-dedup path — while a HAVING would re-derive it from the dedup CTE, i.e. a
      // different, wrong value than the SELECT prints. Its ordinary-metric twin
      // (HAVING_ON_BLENDED_SLEEVE_METRIC_NOT_SUPPORTED) already ships that refusal, and this must
      // read as the same rule rather than as a second one.
      describe('a filter on it', () => {
        it('refuses a filter on an aggregate-level formula that reads a joined source', async () => {
          const errors = await validate(JOINED_METRIC, {
            columnConfig: ['cost', 'roi'],
            filterConfig: [{ column: 'roi', operator: 'gt', value: 1 }],
            ...ordersTree,
          });

          expect(errors).toEqual([
            expect.objectContaining({
              code: 'HAVING_ON_BLENDED_SLEEVE_CALCULATED_FIELD_NOT_SUPPORTED',
              column: 'roi',
              message: expect.stringContaining('roi'),
            }),
          ]);
        });

        // Its twin's own words, so an analyst who meets both meets one explanation. Asserted as
        // the shared tail rather than as the whole sentence: the subject differs (a calculated
        // field, not a joined COUNT DISTINCT / SUM / AVG), the reason does not.
        it('gives the reason its ordinary-metric twin gives, verbatim', async () => {
          const errors = await validate(JOINED_METRIC, {
            columnConfig: ['cost', 'roi'],
            filterConfig: [{ column: 'roi', operator: 'gt', value: 1 }],
            ...ordersTree,
          });

          expect(errors[0].message).toContain(
            'the post-join filter cannot be routed through the same dedup-safe computation used ' +
              'for the SELECT value, so it would filter on a different, incorrect value'
          );
        });

        // The gap found while fixing the HAVING cast defect: every calculated-field guard sits
        // inside `if (hasActualizedSchema)`, so a Data Mart whose schema has not been actualized
        // skips all of them. This refusal must not inherit that placement — it reads the mart's
        // OWN schema fields and needs no blendable schema at all.
        it('refuses it on a Data Mart whose schema is not actualized', async () => {
          const errors = await validate(
            JOINED_METRIC.map(f => ({ ...f, isHiddenForReporting: true })),
            {
              columnConfig: ['cost', 'roi'],
              filterConfig: [{ column: 'roi', operator: 'gt', value: 1 }],
            }
          );

          expect(errors).toEqual([
            expect.objectContaining({
              code: 'HAVING_ON_BLENDED_SLEEVE_CALCULATED_FIELD_NOT_SUPPORTED',
              column: 'roi',
            }),
          ]);
        });

        // The scope: only the joined-aggregate shape goes. Selecting and sorting by the same
        // field are untouched, and so is a filter on a formula that reads main alone.
        it('leaves selecting and sorting by it alone', async () => {
          const errors = await validate(JOINED_METRIC, {
            columnConfig: ['cost', 'roi'],
            sortConfig: [{ column: 'roi', direction: 'desc' }],
            ...ordersTree,
          });

          expect(errors).toEqual([]);
        });
      });
    });

    // Every refusal above keys off the MAIN Data Mart's own fields, so a JOINED
    // Data Mart's calculated field — a formula whose text never crosses the blendable-schema wire
    // — reached none of them and was validated as an ordinary joined column. The blended
    // path then projects its `originalFieldName` from the joined mart's physical table: an
    // unrecognised name, or a silently wrong number where that table still has such a column.
    describe('a joined Data Mart calculated field', () => {
      const MAIN_FIELDS = [
        { name: 'clicks', type: 'INTEGER' },
        { name: 'country', type: 'STRING' },
      ];

      // Explicitly typed, and it has to stay that way: the fixture is SPREAD into each overrides
      // object, which turns excess-property checking off — so a typo'd `isCalculated` would leave
      // every negative leak-guard below green for the wrong reason (the flag never set at all)
      // rather than because the refusal held.
      const ordersTree: Pick<CalculatedFieldOverrides, 'blendedFields' | 'availableSources'> = {
        blendedFields: [
          {
            name: 'orders__ctr',
            type: 'FLOAT',
            aliasPath: 'orders',
            originalFieldName: 'ctr',
            isHidden: false,
            isCalculated: true,
            sourceDataMartTitle: 'Orders',
          },
          {
            name: 'orders__first_seen',
            type: 'DATE',
            aliasPath: 'orders',
            originalFieldName: 'first_seen',
            isHidden: false,
            isCalculated: true,
            sourceDataMartTitle: 'Orders',
          },
          {
            name: 'orders__amount',
            type: 'FLOAT',
            aliasPath: 'orders',
            originalFieldName: 'amount',
            isHidden: false,
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      };

      // At base the rule type-checked cleanly against the field's declared type and passed.
      it('refuses a filter on one, naming it and the Data Mart it belongs to', async () => {
        const errors = await validate(MAIN_FIELDS, {
          columnConfig: ['country'],
          filterConfig: [{ column: 'orders__ctr', operator: 'gt', value: 0.5 }],
          ...ordersTree,
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'JOINED_CALCULATED_FIELD_UNSUPPORTED',
            column: 'orders__ctr',
            message: expect.stringContaining('Orders'),
          }),
        ]);
      });

      // The projection is checked here only because this report already carries an output control
      // — the validator resolves a blendable schema for nothing else. A projection-only report is
      // refused by `BlendedReportDataService` instead, which always holds the schema.
      it('refuses selecting one', async () => {
        const errors = await validate(MAIN_FIELDS, {
          columnConfig: ['country', 'orders__ctr'],
          sortConfig: [{ column: 'country', direction: 'asc' }],
          ...ordersTree,
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'JOINED_CALCULATED_FIELD_UNSUPPORTED',
            column: 'orders__ctr',
          }),
        ]);
      });

      // A DATE declaration is exactly what carries a field past `validateDateTruncs`, so this is
      // the shape that produced SQL rather than a verdict at base.
      it('refuses a date bucket on a DATE-declared one', async () => {
        const errors = await validate(MAIN_FIELDS, {
          columnConfig: ['country', 'orders__first_seen'],
          dateTruncConfig: [{ column: 'orders__first_seen', unit: 'MONTH' }],
          ...ordersTree,
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'JOINED_CALCULATED_FIELD_UNSUPPORTED',
            column: 'orders__first_seen',
          }),
        ]);
      });

      it('refuses an aggregation on one', async () => {
        const errors = await validate(MAIN_FIELDS, {
          columnConfig: ['country', 'orders__ctr'],
          aggregationConfig: [{ column: 'orders__ctr', function: 'SUM' }],
          ...ordersTree,
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'JOINED_CALCULATED_FIELD_UNSUPPORTED',
            column: 'orders__ctr',
          }),
        ]);
      });

      // One honest verdict per field. The rules are dropped from the ordinary per-rule checks the
      // way a Unique Count column's are: a second complaint about the operator or the governance
      // menu would send the caller after a repair that fixes nothing. Both rules here are ones
      // those checks WOULD reject — `contains` is invalid for FLOAT and COUNT_DISTINCT is outside
      // the numeric menu — so this fails if either rule is left in its list.
      it('reports one refusal per field, not one per surface', async () => {
        const errors = await validate(MAIN_FIELDS, {
          columnConfig: ['country', 'orders__ctr'],
          filterConfig: [{ column: 'orders__ctr', operator: 'contains', value: 'x' }],
          sortConfig: [{ column: 'orders__ctr', direction: 'asc' }],
          aggregationConfig: [{ column: 'orders__ctr', function: 'COUNT_DISTINCT' }],
          ...ordersTree,
        });

        expect(errors.map(e => e.code)).toEqual(['JOINED_CALCULATED_FIELD_UNSUPPORTED']);
      });

      // The same, for the bucket list: a FLOAT-declared one would otherwise also collect
      // DATE_TRUNC_REQUIRES_DATE_COLUMN, which reads as a fixable type problem.
      it('reports only the refusal for a bucket on a non-DATE one', async () => {
        const errors = await validate(MAIN_FIELDS, {
          columnConfig: ['country', 'orders__ctr'],
          dateTruncConfig: [{ column: 'orders__ctr', unit: 'MONTH' }],
          ...ordersTree,
        });

        expect(errors.map(e => e.code)).toEqual(['JOINED_CALCULATED_FIELD_UNSUPPORTED']);
      });

      // A sort rule alone names the field with the real reason instead of the stale
      // SORT_COLUMN_NOT_SELECTED it would otherwise collect.
      it('refuses sorting by one that is not even selected', async () => {
        const errors = await validate(MAIN_FIELDS, {
          columnConfig: ['country'],
          sortConfig: [{ column: 'orders__ctr', direction: 'asc' }],
          ...ordersTree,
        });

        expect(errors.map(e => e.code)).toEqual(['JOINED_CALCULATED_FIELD_UNSUPPORTED']);
      });

      it('leaves an ordinary joined column alone on every surface', async () => {
        const errors = await validate(MAIN_FIELDS, {
          columnConfig: ['country', 'orders__amount'],
          filterConfig: [{ column: 'orders__amount', operator: 'gt', value: 1 }],
          sortConfig: [{ column: 'orders__amount', direction: 'asc' }],
          aggregationConfig: [{ column: 'orders__amount', function: 'SUM' }],
          ...ordersTree,
        });

        expect(errors).toEqual([]);
      });

      // The refusal must not leak onto the own-mart path: a ROW-LEVEL formula of the MAIN Data
      // Mart is still a dimension it may bucket, joined tree or no joined tree.
      it("leaves the main Data Mart's own row-level formula bucketable", async () => {
        const errors = await validate(
          [
            { name: 'visit_ts', type: 'TIMESTAMP' },
            { name: 'country', type: 'STRING' },
            {
              name: 'visit_day',
              type: 'DATE',
              calculated: { formula: 'DATE({{ref field="visit_ts"}})', level: 'column' },
            },
          ],
          {
            columnConfig: ['country', 'visit_day'],
            dateTruncConfig: [{ column: 'visit_day', unit: 'MONTH' }],
            ...ordersTree,
          }
        );

        expect(errors).toEqual([]);
      });

      // A native column may own the name a unified blended name folds to. The report reads the
      // native column there, so refusing it would take a column the report is entitled to.
      it('does not refuse a MAIN column that happens to share a blended name', async () => {
        const errors = await validate([...MAIN_FIELDS, { name: 'orders__ctr', type: 'FLOAT' }], {
          columnConfig: ['country', 'orders__ctr'],
          sortConfig: [{ column: 'orders__ctr', direction: 'asc' }],
          ...ordersTree,
        });

        expect(errors).toEqual([]);
      });
    });

    it('rejects selecting, filtering, or sorting by a broken metric', async () => {
      const configs: Parameters<typeof validate>[1][] = [
        { columnConfig: ['ctr'] },
        {
          columnConfig: ['clicks'],
          filterConfig: [{ column: 'ctr', operator: 'gt', value: 1 }],
        },
        { columnConfig: ['clicks'], sortConfig: [{ column: 'ctr', direction: 'asc' }] },
      ];

      for (const config of configs) {
        const errors = await validate(dataMartWithBrokenCtr, config);
        expect(errors[0]).toMatchObject({
          code: 'CALCULATED_FIELD_BROKEN_REFERENCES',
          // Not "gone from the Data Mart": `brokenReferencesOf` is transitive, so what
          // it names can be a calculated field that is right there in the schema and merely
          // uncomputable — and telling an analyst to restore a field they can see is a wrong repair.
          message: expect.stringContaining('missing from the Data Mart, or broken'),
        });
      }
    });

    // `isHiddenForReporting` takes a column off the reporting MENU; it does not remove it
    // from the source, and computing is not projecting. `brokenReferencesOf` resolves through a
    // traversal that deliberately keeps hidden fields — but it only ever saw the blendable
    // schema's `nativeFields`, which production builds by filtering exactly those out. A metric
    // over a hidden column therefore saved fine and then failed EVERY report save, run, HTTP Data
    // call and MCP query with "…is gone from the Data Mart" — about a column that is right there.
    it('does not call a metric broken when it references a HIDDEN field', async () => {
      const errors = await validate(
        [
          { name: 'clicks', type: 'INTEGER', isHiddenForReporting: true },
          { name: 'impressions', type: 'INTEGER', isHiddenForReporting: true },
          { name: 'country', type: 'STRING' },
          { name: 'ctr', type: 'FLOAT', calculated: { formula: CTR_FORMULA, level: 'metric' } },
        ],
        { columnConfig: ['country', 'ctr'] }
      );

      expect(errors).toEqual([]);
    });

    // The refusal's published reason — the formula becomes an output alias no
    // warehouse resolves — described an ALIAS, and a predicate's left-hand side here is already an
    // opaque SQL string: `renderHaving` emits `SUM("amount")` precisely because several dialects
    // forbid the alias. The probe measured `HAVING (<expr>) > <value>` compiling and returning the
    // correct group on all five storages, identically, so the obstacle was plumbing only.
    it('accepts a filter on an aggregate-level calculated field', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country', 'ctr'],
        filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5 }],
      });

      expect(errors).toEqual([]);
    });

    // The field need not be projected to be filtered on — an analyst narrowing by a ratio they do
    // not want a column for. The predicate channel is what carries the plan for it.
    it('accepts a filter on a calculated field the report does not select', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country'],
        filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5 }],
      });

      expect(errors).toEqual([]);
    });

    // The trap review named: swapping `validateHavingFilters`' skip for the clause seat
    // and stopping there drops this rule through to `aggregatedPairs.has('ctr␟undefined')`, which
    // answers "add the matching aggregation" — the very aggregation
    // AGGREGATION_ON_CALCULATED_FIELD forbids. The level has to be read BEFORE that check.
    it('does not ask for an aggregation an aggregate-level field can never carry', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country', 'ctr'],
        filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5 }],
      });

      expect(errors.map(e => e.code)).not.toContain('HAVING_FILTER_NOT_AGGREGATED');
    });

    // A function-carrying rule on an aggregate-level field asks to aggregate an aggregate, so it
    // gets that verdict rather than HAVING_FILTER_NOT_AGGREGATED's "re-add the aggregation" —
    // which is the one repair this field forbids.
    it('rejects a function-carrying filter on an aggregate-level field as a second aggregation', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country', 'ctr'],
        filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5, function: 'SUM' }],
      });

      expect(errors).toEqual([
        expect.objectContaining({
          code: 'AGGREGATION_ON_CALCULATED_FIELD',
          column: 'ctr',
          level: 'metric',
        }),
      ]);
    });

    // Now that the rule reaches the type check, the DECLARED type is what answers — a
    // FLOAT-declared formula is refused a string operator in the same words a FLOAT column is.
    // `validateHavingFilters` skipping the rule turns this guard dark along with two others.
    it('type-checks an aggregate-level filter against the declared type', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country', 'ctr'],
        filterConfig: [{ column: 'ctr', operator: 'contains', value: 'x' }],
      });

      expect(errors).toEqual([
        expect.objectContaining({
          code: 'INVALID_OPERATOR_FOR_TYPE',
          column: 'ctr',
          type: 'FLOAT',
          operator: 'contains',
        }),
      ]);
    });

    // The second dark guard, and the sharpest: a pre-join placement left unvalidated reaches
    // `partitionBlendedFilters`, which throws a raw `Error` — a 500 where the analyst is owed a
    // 400 naming the rule.
    it('refuses a pre-join placement on an aggregate-level field with a 400, not a 500', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country', 'ctr'],
        filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5, placement: 'pre-join' }],
      });

      expect(errors).toEqual([
        expect.objectContaining({ code: 'HAVING_FILTER_INVALID_PLACEMENT', column: 'ctr' }),
      ]);
    });

    it('leaves a filter on an ordinary column alone', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country', 'ctr'],
        filterConfig: [{ column: 'country', operator: 'eq', value: 'PL' }],
      });

      expect(errors).toEqual([]);
    });

    // Sorting BY a metric is supported — but only where the metric is actually PROJECTED. A null
    // `columnConfig` means `SELECT *` over the home mart's native columns, and named-selection-only keeps a
    // calculated field out of that: it has no warehouse column, so it is composed only when asked
    // for by name. `connectedNativeNames` is built from `collectSchemaFieldPathTypes`, whose
    // `isConnected` answers TRUE for a calculated field — so the metric counted as selected, the
    // report saved silently, and every run emitted `SELECT * … ORDER BY src.ctr` for a name the
    // warehouse has never had. Aggregations and filters each close this hole with a refusal of
    // their own; sort had neither.
    describe('a sort on a calculated field under an implicit-all projection', () => {
      it('refuses it — the metric is not projected by SELECT *', async () => {
        const errors = await validate(dataMartWithCtr, {
          columnConfig: null,
          sortConfig: [{ column: 'ctr', direction: 'desc' }],
        });

        expect(errors).toEqual([
          expect.objectContaining({ code: 'SORT_COLUMN_NOT_SELECTED', column: 'ctr' }),
        ]);
      });

      it('still accepts the sort once the metric is named explicitly', async () => {
        const errors = await validate(dataMartWithCtr, {
          columnConfig: ['country', 'ctr'],
          sortConfig: [{ column: 'ctr', direction: 'desc' }],
        });

        expect(errors).toEqual([]);
      });

      it('leaves an implicit-all sort on an ordinary column alone', async () => {
        const errors = await validate(dataMartWithCtr, {
          columnConfig: null,
          sortConfig: [{ column: 'country', direction: 'asc' }],
        });

        expect(errors).toEqual([]);
      });
    });

    // A row-level formula is a DIMENSION, and a report may now AGGREGATE one:
    // `COUNT_DISTINCT(session_key)` validates, and the field stops being a grouping key. The other
    // two refusals stay, each for its own reason — date-bucketing has its own and
    // filtering is true at BOTH levels — and an aggregate-level field keeps every
    // refusal it had, with its wording unchanged: it already IS an aggregate.
    describe('a row-level calculated field the report aggregates', () => {
      const SESSION_KEY_FORMULA = 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})';
      const dataMartWithSessionKey = [
        { name: 'session_id', type: 'STRING' },
        { name: 'user_id', type: 'STRING' },
        { name: 'country', type: 'STRING' },
        {
          name: 'session_key',
          type: 'STRING',
          calculated: { formula: SESSION_KEY_FORMULA, level: 'column' },
        },
        {
          name: 'visit_key',
          type: 'STRING',
          calculated: { formula: SESSION_KEY_FORMULA, level: 'column' },
        },
      ];

      it('accepts a COUNT_DISTINCT on it', async () => {
        const errors = await validate(dataMartWithSessionKey, {
          columnConfig: ['country', 'session_key'],
          aggregationConfig: [{ column: 'session_key', function: 'COUNT_DISTINCT' }],
        });

        expect(errors).toEqual([]);
      });

      // The claim the diff cannot show, because it arrives by NOTHING happening: lifting the arm
      // adds no governance path for a calculated field, it stops shadowing the one that was always
      // there. The field IS a schema field, so `homeFieldTypes` holds its declared type and
      // `buildAggregationGovernance` resolves an entry from it — a STRING-declared formula
      // therefore gets exactly STRING's default menu, for free.
      it('gets the STRING default menu for free', async () => {
        for (const fn of ['COUNT', 'COUNT_DISTINCT', 'STRING_AGG', 'ANY_VALUE'] as const) {
          const errors = await validate(dataMartWithSessionKey, {
            columnConfig: ['country', 'session_key'],
            aggregationConfig: [{ column: 'session_key', function: fn }],
          });

          expect(errors).toEqual([]);
        }
      });

      // …and nothing beyond it. MIN is in STRING's SUPPORTED set but not its DEFAULT one, so only
      // a governance entry can refuse it: this fails if a calculated field is skipped by
      // `buildAggregationGovernance` (whose map would then return `undefined` and allow anything).
      it('is refused a function outside its governance menu, exactly like a real column', async () => {
        const errors = await validate(dataMartWithSessionKey, {
          columnConfig: ['country', 'session_key'],
          aggregationConfig: [{ column: 'session_key', function: 'MIN' }],
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_FIELD',
            column: 'session_key',
            function: 'MIN',
          }),
        ]);
      });

      // The other half of "for free": the type floor reads the DECLARED type, which for a formula
      // is the analyst's own free choice and is never checked against the formula body.
      it('is refused SUM on its declared type, not on its level', async () => {
        const errors = await validate(dataMartWithSessionKey, {
          columnConfig: ['country', 'session_key'],
          aggregationConfig: [{ column: 'session_key', function: 'SUM' }],
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'AGGREGATION_FUNCTION_NOT_ALLOWED_FOR_TYPE',
            column: 'session_key',
            function: 'SUM',
            type: 'STRING',
          }),
        ]);
      });

      // The ordinary rule reaches it too: an aggregated field must be selected. Before this slice
      // the calculated arm answered first and this shape never got here.
      it('must still be selected to be aggregated', async () => {
        const errors = await validate(dataMartWithSessionKey, {
          columnConfig: ['country'],
          aggregationConfig: [{ column: 'session_key', function: 'COUNT_DISTINCT' }],
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'AGGREGATION_COLUMN_NOT_SELECTED',
            column: 'session_key',
          }),
        ]);
      });

      // This shape was pinned reporting BOTH codes, the calculated one first, with the prediction
      // that a later change would delete half of it. That is what happened: the row-level
      // arm is gone, so the only verdict left is the generic type check — which is the RIGHT one,
      // because `visit_key` is declared STRING and a STRING column is refused a bucket in exactly
      // these words. `errors[0]` is what every caller reads, so the count is asserted, not just
      // membership. The original claim survives unchanged: the aggregation on the OTHER field is
      // still accepted, so neither arm has taken its neighbour with it.
      it('leaves only the generic type check on the field it did not lift', async () => {
        const errors = await validate(dataMartWithSessionKey, {
          columnConfig: ['country', 'session_key', 'visit_key'],
          aggregationConfig: [{ column: 'session_key', function: 'COUNT_DISTINCT' }],
          dateTruncConfig: [{ column: 'visit_key', unit: 'MONTH' }],
        });

        expect(errors.map(e => e.code)).toEqual(['DATE_TRUNC_REQUIRES_DATE_COLUMN']);
        expect(errors[0]).toMatchObject({ column: 'visit_key' });
        expect(errors.some(e => e.column === 'session_key')).toBe(false);
      });

      // The falsifying contrast, and the regression a fork catching BOTH levels would be: an
      // aggregate-level field is still refused, with its wording untouched.
      it('keeps the "already aggregated" refusal for an aggregate-level field', async () => {
        const errors = await validate(dataMartWithCtr, {
          columnConfig: ['ctr'],
          aggregationConfig: [{ column: 'ctr', function: 'SUM' }],
        });

        expect(errors[0]).toMatchObject({
          code: 'AGGREGATION_ON_CALCULATED_FIELD',
          level: 'metric',
          message: '`ctr` is a calculated field and is already aggregated.',
        });
      });

      // The refusal is no longer about the field being calculated — it is about the
      // declared type, and a STRING-declared formula is refused a bucket in the SAME words a STRING
      // column is. Asserted as byte-equality against the column's own verdict modulo the name, so a
      // future fork that gives the calculated one its own wording is a visible change.
      it('refuses a STRING-declared bucket in the generic words a STRING column gets', async () => {
        const calculated = await validate(dataMartWithSessionKey, {
          columnConfig: ['session_key'],
          dateTruncConfig: [{ column: 'session_key', unit: 'MONTH' }],
        });
        const column = await validate(dataMartWithSessionKey, {
          columnConfig: ['country'],
          dateTruncConfig: [{ column: 'country', unit: 'MONTH' }],
        });

        expect(calculated).toEqual([
          expect.objectContaining({
            code: 'DATE_TRUNC_REQUIRES_DATE_COLUMN',
            column: 'session_key',
            type: 'STRING',
          }),
        ]);
        expect(calculated.map(e => ({ ...e, column: 'FIELD' }))).toEqual(
          column.map(e => ({ ...e, column: 'FIELD' }))
        );
      });

      it('keeps the "cannot be used as a dimension" reason for an aggregate-level field', async () => {
        const errors = await validate(dataMartWithCtr, {
          columnConfig: ['clicks'],
          dateTruncConfig: [{ column: 'ctr', unit: 'MONTH' }],
        });

        expect(errors[0]).toMatchObject({
          code: 'CALCULATED_FIELD_AS_DIMENSION',
          level: 'metric',
          message: '`ctr` is a calculated field and cannot be used as a dimension.',
        });
      });

      // BOTH levels filter, and each in its own clause — a row-level formula is a
      // dimension, so its predicate is a WHERE; an aggregate-level one is already an aggregate, so
      // its predicate is a HAVING. Neither is refused any more, and the two must stay symmetrical:
      // a guard that read the level and refused one of them would leave this pair uneven.
      it('accepts a filter at both levels', async () => {
        const rowLevel = await validate(dataMartWithSessionKey, {
          columnConfig: ['country', 'session_key'],
          filterConfig: [{ column: 'session_key', operator: 'eq', value: 'x' }],
        });
        const aggregate = await validate(dataMartWithCtr, {
          columnConfig: ['country', 'ctr'],
          filterConfig: [{ column: 'ctr', operator: 'gt', value: 0.5 }],
        });

        expect(rowLevel).toEqual([]);
        expect(aggregate).toEqual([]);
      });

      // The row-level half of the type check: routed to WHERE, the rule is checked against the
      // DECLARED type by `validateFilters` — the seat an aggregate-level rule must NOT reach, and
      // the reason the two skips had to be converted together.
      it('type-checks a row-level filter against the declared type', async () => {
        const errors = await validate(dataMartWithSessionKey, {
          columnConfig: ['country', 'session_key'],
          filterConfig: [{ column: 'session_key', operator: 'gt', value: 3 }],
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'INVALID_OPERATOR_FOR_TYPE',
            column: 'session_key',
            type: 'STRING',
            operator: 'gt',
          }),
        ]);
      });

      // Spec §2's third row: a row-level field the REPORT aggregates keeps the ordinary HAVING
      // contract — its rule carries a function, so the matching aggregation must exist.
      it('keeps the missing-aggregation verdict for a function-carrying rule on a row-level field', async () => {
        const withRule = await validate(dataMartWithSessionKey, {
          columnConfig: ['country', 'session_key'],
          aggregationConfig: [{ column: 'session_key', function: 'COUNT' }],
          filterConfig: [{ column: 'session_key', operator: 'gt', value: 3, function: 'COUNT' }],
        });
        const withoutRule = await validate(dataMartWithSessionKey, {
          columnConfig: ['country', 'session_key'],
          filterConfig: [{ column: 'session_key', operator: 'gt', value: 3, function: 'COUNT' }],
        });

        expect(withRule).toEqual([]);
        expect(withoutRule).toEqual([
          expect.objectContaining({
            code: 'HAVING_FILTER_NOT_AGGREGATED',
            column: 'session_key',
            function: 'COUNT',
          }),
        ]);
      });

      it('leaves a row-level field selected with no controls at all alone', async () => {
        const errors = await validate(dataMartWithSessionKey, {
          columnConfig: ['country', 'session_key'],
        });

        expect(errors).toEqual([]);
      });

      // The case the previous test's old name claimed but did not exercise: an aggregation on
      // ANOTHER column must not drag the row-level field into a refusal. This is the shape a real
      // report takes — a grouping key, a calculated dimension, and a metric beside them.
      it('leaves a row-level field alone when a real aggregation sits beside it', async () => {
        const errors = await validate(dataMartWithSessionKey, {
          columnConfig: ['country', 'session_key'],
          aggregationConfig: [{ column: 'country', function: 'COUNT_DISTINCT' }],
        });

        expect(errors).toEqual([]);
      });
    });

    // A row-level formula IS a dimension, and a DATE/TIMESTAMP-declared
    // one may now be bucketed exactly as a warehouse column of that type is — the declaration is the
    // contract and the warehouse is the authority. Nothing here is level-blind: an
    // aggregate-level field is not a dimension at all, permanently, whatever type it declares.
    describe('date-bucketing a row-level calculated field', () => {
      const VISIT_DAY_FORMULA = 'DATE({{ref field="visit_ts"}})';
      const dataMartWithVisitDay = [
        { name: 'visit_ts', type: 'TIMESTAMP' },
        { name: 'visit_date', type: 'DATE' },
        { name: 'country', type: 'STRING' },
        {
          name: 'visit_day',
          type: 'DATE',
          calculated: { formula: VISIT_DAY_FORMULA, level: 'column' },
        },
        {
          name: 'visit_moment',
          type: 'TIMESTAMP',
          calculated: { formula: '{{ref field="visit_ts"}}', level: 'column' },
        },
        {
          name: 'visit_label',
          type: 'STRING',
          calculated: { formula: 'CAST({{ref field="visit_ts"}} AS STRING)', level: 'column' },
        },
        {
          name: 'last_visit',
          type: 'DATE',
          calculated: { formula: 'MAX({{ref field="visit_ts"}})', level: 'metric' },
        },
      ];

      it('accepts a MONTH bucket on a DATE-declared row-level field', async () => {
        const errors = await validate(dataMartWithVisitDay, {
          columnConfig: ['country', 'visit_day'],
          dateTruncConfig: [{ column: 'visit_day', unit: 'MONTH' }],
        });

        expect(errors).toEqual([]);
      });

      // The falsifying contrast for the arm that STAYS. A DATE declaration is what would carry an
      // aggregate-level field past the generic type check, so this is the shape that proves the
      // refusal is still there rather than merely unreached.
      it('still refuses an aggregate-level field a bucket, DATE-declared or not', async () => {
        const errors = await validate(dataMartWithVisitDay, {
          columnConfig: ['country', 'last_visit'],
          dateTruncConfig: [{ column: 'last_visit', unit: 'MONTH' }],
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'CALCULATED_FIELD_AS_DIMENSION',
            column: 'last_visit',
            level: 'metric',
            message: '`last_visit` is a calculated field and cannot be used as a dimension.',
          }),
        ]);
      });

      // Every ordinary rule in `validateDateTruncs` now reaches a calculated field, which is the
      // point of letting it through `dateTruncsToValidate` rather than answering separately. A
      // fork that special-cased the calculated case would have to re-implement each of these, and
      // would get one of them wrong.
      it('requires the bucketed field to be selected, as for a column', async () => {
        const errors = await validate(dataMartWithVisitDay, {
          columnConfig: ['country'],
          dateTruncConfig: [{ column: 'visit_day', unit: 'MONTH' }],
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'DATE_TRUNC_COLUMN_NOT_SELECTED',
            column: 'visit_day',
          }),
        ]);
      });

      it('refuses a field that is both bucketed and aggregated', async () => {
        const errors = await validate(dataMartWithVisitDay, {
          columnConfig: ['country', 'visit_day'],
          aggregationConfig: [{ column: 'visit_day', function: 'MAX' }],
          dateTruncConfig: [{ column: 'visit_day', unit: 'MONTH' }],
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'DATE_TRUNC_COLUMN_IS_AGGREGATED',
            column: 'visit_day',
          }),
        ]);
      });

      // §6.1, measured on Snowflake 2026-08-24: the TIMESTAMP declaration is exactly what carried
      // this shape onto a warehouse, where `CONVERT_TIMEZONE` coerced '05/08/2026' MDY and bucketed
      // the report into May. The zone is the door — without it Snowflake refuses — so the zone is
      // what goes, on all five storages.
      it('refuses a time zone on a bucketed calculated field, TIMESTAMP-declared or DATE-declared', async () => {
        const timestamp = await validate(dataMartWithVisitDay, {
          columnConfig: ['country', 'visit_moment'],
          dateTruncConfig: [{ column: 'visit_moment', unit: 'DAY', timeZone: 'America/New_York' }],
        });
        const date = await validate(dataMartWithVisitDay, {
          columnConfig: ['country', 'visit_day'],
          dateTruncConfig: [{ column: 'visit_day', unit: 'DAY', timeZone: 'America/New_York' }],
        });

        expect(timestamp).toEqual([
          expect.objectContaining({
            code: 'DATE_TRUNC_TIMEZONE_ON_CALCULATED_FIELD',
            column: 'visit_moment',
            timeZone: 'America/New_York',
          }),
        ]);
        // The SAME code for a DATE declaration, ahead of DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP:
        // that one's remedy is "declare a TIMESTAMP", which on a calculated field is now advice to
        // reach exactly the shape §6.1 refuses.
        expect(date).toEqual([
          expect.objectContaining({
            code: 'DATE_TRUNC_TIMEZONE_ON_CALCULATED_FIELD',
            column: 'visit_day',
            timeZone: 'America/New_York',
          }),
        ]);
      });

      // The pre-existing tz codes are not deleted with the leg — they still answer for an ordinary
      // column, which is the contrast that shows the new arm keys on the field and not on the zone.
      it('still refuses a time zone on an ordinary DATE column for its own reason', async () => {
        const errors = await validate(dataMartWithVisitDay, {
          columnConfig: ['country', 'visit_date'],
          dateTruncConfig: [{ column: 'visit_date', unit: 'DAY', timeZone: 'America/New_York' }],
        });

        expect(errors).toEqual([
          expect.objectContaining({
            code: 'DATE_TRUNC_TIMEZONE_REQUIRES_TIMESTAMP',
            column: 'visit_date',
            type: 'DATE',
          }),
        ]);
      });

      // The scope, from the report surface. Removing the time-zone leg must not remove the bucket
      // this branch shipped, nor the zone an ordinary warehouse column has always carried.
      it('keeps the bucket itself, and keeps a time zone on an ordinary TIMESTAMP column', async () => {
        const bucketOnly = await validate(dataMartWithVisitDay, {
          columnConfig: ['country', 'visit_moment'],
          dateTruncConfig: [{ column: 'visit_moment', unit: 'DAY' }],
        });
        const ordinaryColumn = await validate(dataMartWithVisitDay, {
          columnConfig: ['country', 'visit_ts'],
          dateTruncConfig: [{ column: 'visit_ts', unit: 'DAY', timeZone: 'America/New_York' }],
        });

        expect(bucketOnly).toEqual([]);
        expect(ordinaryColumn).toEqual([]);
      });

      // Date filtering is NOT disabled. A range on a DATE-declared formula ships on every
      // storage and the residual risk is accepted deliberately — refusing it would take date
      // ranges from every honest formula to protect the dishonest ones.
      it('filters the same field by date, bucket and all', async () => {
        const errors = await validate(dataMartWithVisitDay, {
          columnConfig: ['country', 'visit_day'],
          dateTruncConfig: [{ column: 'visit_day', unit: 'MONTH' }],
          filterConfig: [{ column: 'visit_day', operator: 'gte', value: '2026-08-01' }],
        });

        expect(errors).toEqual([]);
      });
    });

    // A row-level field on a report that spans a join used to be refused at save,
    // mirroring the compose-time refusal so the report could not persist clean and then 400 on
    // every subsequent run. Both are gone: the field is a dimension the sleeve grain now carries,
    // so every one of these shapes saves. Kept — rather than deleted with the refusal — because a
    // re-introduced refusal would break them, which is the whole point.
    describe('a row-level calculated field saves on a report that spans a join', () => {
      const SESSION_KEY_FORMULA = 'CONCAT({{ref field="session_id"}}, {{ref field="user_id"}})';
      const ROI_FORMULA = 'SUM({{ref path="orders" field="amount"}})';
      const martWithBothLevels = [
        { name: 'session_id', type: 'STRING' },
        { name: 'user_id', type: 'STRING' },
        { name: 'country', type: 'STRING' },
        { name: 'clicks', type: 'INTEGER' },
        { name: 'impressions', type: 'INTEGER' },
        {
          name: 'session_key',
          type: 'STRING',
          calculated: { formula: SESSION_KEY_FORMULA, level: 'column' },
        },
        {
          name: 'visit_key',
          type: 'STRING',
          calculated: { formula: SESSION_KEY_FORMULA, level: 'column' },
        },
        { name: 'ctr', type: 'FLOAT', calculated: { formula: CTR_FORMULA, level: 'metric' } },
        { name: 'roi', type: 'FLOAT', calculated: { formula: ROI_FORMULA, level: 'metric' } },
      ];
      const ordersTree = {
        blendedFields: [
          {
            name: 'orders__amount',
            type: 'INTEGER',
            aliasPath: 'orders',
            originalFieldName: 'amount',
            isHidden: false,
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      };

      // The straightforward shape: the report projects a joined column beside the row-level field.
      // The refusal was a THROW rather than a collected error, and `validate` unwraps a
      // `BadRequestException` — so a `BusinessViolationException` would break it outright rather
      // than come back as one more entry. Every `toEqual([])` below therefore says "nothing threw".
      it('saves a row-level field selected beside a joined column', async () => {
        const errors = await validate(martWithBothLevels, {
          columnConfig: ['country', 'session_key', 'orders__amount'],
          ...ordersTree,
        });

        expect(errors).toEqual([]);
      });

      it('saves several row-level fields on one joined report', async () => {
        const errors = await validate(martWithBothLevels, {
          columnConfig: ['session_key', 'visit_key', 'orders__amount'],
          ...ordersTree,
        });

        expect(errors).toEqual([]);
      });

      // The capability the previous slice shipped, and the regression a level-blind check would
      // be: the SAME joined report saves when the formula aggregates.
      it('still saves an AGGREGATE-level calculated field on that same joined report', async () => {
        const errors = await validate(martWithBothLevels, {
          columnConfig: ['country', 'ctr', 'orders__amount'],
          ...ordersTree,
        });

        expect(errors).toEqual([]);
      });

      it('saves a flat report when the mart merely HAS a joined field available', async () => {
        const errors = await validate(martWithBothLevels, {
          columnConfig: ['country', 'session_key'],
          ...ordersTree,
        });

        expect(errors).toEqual([]);
      });

      // The three joins that reach no column list. Each used to be a separate refusal, so each is
      // kept as its own case: they are the shapes a re-introduced predicate would catch first.
      it('saves when the only join is a joined Unique Count', async () => {
        const errors = await validate(martWithBothLevels, {
          columnConfig: ['country', 'session_key'],
          uniqueCountConfig: ['orders'],
          ...ordersTree,
        });

        expect(errors).toEqual([]);
      });

      it('saves when the only join is a pre-join slice', async () => {
        const errors = await validate(martWithBothLevels, {
          columnConfig: ['country', 'session_key'],
          filterConfig: [
            { column: 'orders__amount', operator: 'gt', value: 1, placement: 'pre-join' },
          ],
          ...ordersTree,
        });

        expect(errors).toEqual([]);
      });

      // A row-level formula can hold no joined reference of its own, so this join arrives only
      // through the aggregate-level field selected beside it — the two levels on one joined
      // report, which is what made the sleeve grain matter.
      it('saves when the only join is an aggregate-level sibling’s joined reference', async () => {
        const errors = await validate(martWithBothLevels, {
          columnConfig: ['country', 'session_key', 'roi'],
          ...ordersTree,
        });

        expect(errors).toEqual([]);
      });

      // The arm BELOW it is lifted too, and on this path as well: the blended builder keeps an
      // aggregated row-level field out of the sleeve grain and out of the kept-groups CTE, so the
      // joined report composes at the same grain the flat one does.
      it('accepts an AGGREGATION on the row-level field, joined report or not', async () => {
        const errors = await validate(martWithBothLevels, {
          columnConfig: ['country', 'session_key', 'orders__amount'],
          aggregationConfig: [{ column: 'session_key', function: 'COUNT_DISTINCT' }],
          ...ordersTree,
        });

        expect(errors).toEqual([]);
      });

      // …and the level fork survives the join: the aggregate-level sibling is still refused here.
      it('still refuses an AGGREGATION on an aggregate-level field on that same report', async () => {
        const errors = await validate(martWithBothLevels, {
          columnConfig: ['country', 'ctr', 'orders__amount'],
          aggregationConfig: [{ column: 'ctr', function: 'SUM' }],
          ...ordersTree,
        });

        expect(errors[0]).toMatchObject({
          code: 'AGGREGATION_ON_CALCULATED_FIELD',
          column: 'ctr',
          level: 'metric',
          message: '`ctr` is a calculated field and is already aggregated.',
        });
      });
    });

    // The blended builder renders a main-owner metric through its own formula-substitution
    // channel, at the same grain and the same site as the joined aggregates beside it — so this
    // combination saves like any other.
    it('accepts a calculated field selected alongside a joined field', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country', 'ctr', 'orders__amount'],
        blendedFields: [{ name: 'orders__amount', type: 'INTEGER' }],
      });

      expect(errors).toEqual([]);
    });

    it('accepts a calculated field on a report carrying a joined Unique Count', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country', 'ctr'],
        uniqueCountConfig: ['orders'],
      });

      expect(errors).toEqual([]);
    });

    // The mart HAS joined fields available; the report just doesn't touch them. That report runs
    // on the flat path, where the metric renders correctly — refusing it would be a false alarm.
    it('accepts a calculated field when no joined field is actually referenced', async () => {
      const errors = await validate(dataMartWithCtr, {
        columnConfig: ['country', 'ctr'],
        blendedFields: [{ name: 'orders__amount', type: 'INTEGER' }],
      });

      expect(errors).toEqual([]);
    });

    it('does not check a calculated field on a storage that does not support output controls', async () => {
      // A plain columnConfig-only report on an unsupported storage must keep taking the fast,
      // schema-free early-return path — `compose()` itself would reject a selected metric there
      // with OUTPUT_CONTROLS_NOT_SUPPORTED, so this validator does not need to look at the schema
      // to reach the same outcome, and a genuinely plain (non-metric) selection must not start
      // failing here either.
      const capabilitySvc = makeCapabilityService(false);
      const schemaSvc = makeBlendableSchemaService(dataMartWithBrokenCtr);
      const validator = new OutputControlsValidatorService(
        capabilitySvc as never,
        schemaSvc as never
      );

      await expect(
        validator.validateForReport({
          storageType: DataStorageType.AWS_ATHENA,
          dataMartId: 'dm-ctr',
          projectId: 'proj-ctr',
          columnConfig: ['clicks', 'ctr'],
          filterConfig: null,
          sortConfig: null,
          limitConfig: null,
          aggregationConfig: null,
          dataMartSchemaFields: dataMartWithBrokenCtr as never,
          accessor: { userId: 'user-1', roles: ['admin'] },
        })
      ).resolves.toBeUndefined();

      expect(schemaSvc.computeBlendableSchema).not.toHaveBeenCalled();
    });

    // "It projects something, so it MIGHT carry a metric" is true of every report with a column
    // list, on every supported storage — which is all six. That reading pulled a blendable-schema
    // resolution (a mart fetch + every relationship for the storage + a recursive joined-mart
    // walk) onto reports whose Data Mart has no formula anywhere in it: 0→1 on each save, 1→2 per
    // composition on the run path. The Data Mart's own schema fields answer the question for free.
    describe('the metric guard is selection-driven, not projection-driven', () => {
      const buildValidator = (nativeFields: Record<string, unknown>[]) => {
        const schemaSvc = makeBlendableSchemaService(nativeFields);
        return {
          schemaSvc,
          validator: new OutputControlsValidatorService(
            makeCapabilityService(true) as never,
            schemaSvc as never
          ),
        };
      };

      const plainProjection = (
        fields: Record<string, unknown>[] | undefined,
        columnConfig: string[] = ['clicks', 'country']
      ) => ({
        storageType: supportedStorageType,
        dataMartId: 'dm-ctr',
        projectId: 'proj-ctr',
        columnConfig,
        filterConfig: null,
        sortConfig: null,
        limitConfig: null,
        aggregationConfig: null,
        dataMartSchemaFields: fields as never,
        accessor: { userId: 'user-1', roles: ['admin'] },
      });

      it('does not resolve the blendable schema for a projection-only report on a mart with no calculated field', async () => {
        const noMetrics = [
          { name: 'clicks', type: 'INTEGER' },
          { name: 'country', type: 'STRING' },
        ];
        const { validator, schemaSvc } = buildValidator(noMetrics);

        await expect(
          validator.validateForReport(plainProjection(noMetrics))
        ).resolves.toBeUndefined();

        expect(schemaSvc.computeBlendableSchema).not.toHaveBeenCalled();
      });

      // Per-SELECTION, not per-mart. Every guard the heavy path adds for a bare projection keys
      // off a SELECTED metric; the ones keyed off a filter/sort/aggregation/date bucket already
      // force the heavy path on their own. Mart-wide, one formula anywhere cost a blendable-schema
      // resolution to every projecting report on that Data Mart, forever.
      it('does not resolve it when the mart carries a metric the report does not select', async () => {
        const { validator, schemaSvc } = buildValidator(dataMartWithCtr);

        await expect(
          validator.validateForReport(plainProjection(dataMartWithCtr))
        ).resolves.toBeUndefined();

        expect(schemaSvc.computeBlendableSchema).not.toHaveBeenCalled();
      });

      it('DOES resolve it once the report actually selects the metric', async () => {
        const { validator, schemaSvc } = buildValidator(dataMartWithCtr);

        await expect(
          validator.validateForReport(plainProjection(dataMartWithCtr, ['country', 'ctr']))
        ).resolves.toBeUndefined();

        expect(schemaSvc.computeBlendableSchema).toHaveBeenCalled();
      });

      // `dataMartSchemaFields` is a REQUIRED property whose value may be undefined, so undefined
      // means one thing only: this Data Mart has no schema yet. A mart with no schema owns no
      // calculated field, so the cheap path is the right answer rather than a conservative guess —
      // and the required property is what stops a caller dropping the argument and silently
      // flipping the metric guards over to the reporting-filtered `nativeFields`.
      it('takes the cheap path for a Data Mart that has no schema at all', async () => {
        const { validator, schemaSvc } = buildValidator(dataMartWithCtr);

        await expect(
          validator.validateForReport(plainProjection(undefined))
        ).resolves.toBeUndefined();

        expect(schemaSvc.computeBlendableSchema).not.toHaveBeenCalled();
      });

      // Output-name uniqueness needs no schema at all, and the projection-only early return has
      // always enforced it. Leaving that path (here: because the mart carries a metric) must not
      // drop the check — it used to, whenever the Data Mart's schema was not actualized yet, so
      // `['Revenue', 'revenue']` saved on this branch and was rejected on the other.
      it('still rejects a case-only output-name collision when the schema is not actualized', async () => {
        const schemaSvc = {
          computeBlendableSchema: jest.fn().mockResolvedValue({
            nativeFields: [],
            blendedFields: [],
            availableSources: [],
            mainUniqueCountKeyFields: [],
          }),
        };
        const validator = new OutputControlsValidatorService(
          makeCapabilityService(true) as never,
          schemaSvc as never
        );

        await expect(
          validator.validateForReport({
            storageType: supportedStorageType,
            dataMartId: 'dm-ctr',
            projectId: 'proj-ctr',
            columnConfig: ['Revenue', 'revenue'],
            filterConfig: null,
            sortConfig: null,
            limitConfig: null,
            aggregationConfig: null,
            dataMartSchemaFields: dataMartWithCtr as never,
            accessor: { userId: 'user-1', roles: ['admin'] },
          })
        ).rejects.toThrow(BadRequestException);
      });
    });
  });
});
