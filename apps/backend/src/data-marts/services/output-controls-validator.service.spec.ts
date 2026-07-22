import { BadRequestException } from '@nestjs/common';
import { OutputControlsValidatorService } from './output-controls-validator.service';
import { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { AthenaFieldType } from '../data-storage-types/athena/enums/athena-field-type.enum';
import { RedshiftFieldType } from '../data-storage-types/redshift/enums/redshift-field-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { buildBlendedFieldIndex } from './blended-field-index';

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
      // INVALID_OPERATOR_FOR_TYPE against the effective INTEGER type (the #6733 regression).
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
        }[];
        availableSources?: { aliasPath: string; isIncluded?: boolean }[];
      } = {}
    ) => ({
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields,
        blendedFields: extras.blendedFields ?? [],
        availableSources: extras.availableSources ?? [],
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

  // L2: the projected output column names (dimensions + aggregated labels + Row Count +
  // Unique Count) must be unique — a collision means a duplicate alias on BigQuery or a
  // silent clobber on name-keyed readers.
  describe('validateOutputColumnNames', () => {
    it('rejects a real column aliased exactly "Row Count" in an aggregated report', () => {
      const errors = svc.validateOutputColumnNames(
        ['Row Count', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        true,
        false
      );
      expect(errors).toEqual([{ code: 'OUTPUT_COLUMN_NAME_COLLISION', label: 'Row Count' }]);
    });

    it('rejects a column whose name equals an aggregated label "<x> | SUM"', () => {
      const errors = svc.validateOutputColumnNames(
        ['revenue | SUM', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        true,
        false
      );
      expect(errors).toEqual([{ code: 'OUTPUT_COLUMN_NAME_COLLISION', label: 'revenue | SUM' }]);
    });

    it('rejects a real column aliased exactly "Unique Count" when uniqueCount is on', () => {
      const errors = svc.validateOutputColumnNames(['Unique Count', 'channel'], [], false, true);
      expect(errors).toEqual([{ code: 'OUTPUT_COLUMN_NAME_COLLISION', label: 'Unique Count' }]);
    });

    it('passes a normal aggregated report with no collisions', () => {
      const errors = svc.validateOutputColumnNames(
        ['channel', 'revenue'],
        [{ column: 'revenue', function: 'SUM' }],
        true,
        false
      );
      expect(errors).toEqual([]);
    });

    it('passes a plain (non-aggregated) report with distinct dimension names', () => {
      const errors = svc.validateOutputColumnNames(['channel', 'revenue'], [], false, false);
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

    // L2: a real dimension column literally named "Row Count" collides with the synthetic
    // Row Count column the aggregated report appends → duplicate alias on BigQuery.
    it('throws OUTPUT_COLUMN_NAME_COLLISION when a dimension column is named "Row Count"', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([
        { name: 'Row Count', type: 'STRING' },
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
          columnConfig: ['Row Count', 'amount'],
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
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors.some(e => e.code === 'OUTPUT_COLUMN_NAME_COLLISION')).toBe(
        true
      );
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
      nativeFields: { name: string; type: string; isPrimaryKey?: boolean }[] = []
    ) => ({
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields,
        blendedFields: [],
        availableSources: [],
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
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(errors).toEqual([]);
    });

    it('rejects a HAVING rule whose (column, function) is not a configured aggregation', () => {
      const errors = svc.validateHavingFilters(
        [{ column: 'amount', function: 'AVG', operator: 'gt', value: 1 }],
        aggregations,
        resolveType,
        DataStorageType.GOOGLE_BIGQUERY
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
        DataStorageType.GOOGLE_BIGQUERY
      );
      // COUNT(name) is INTEGER, so a numeric comparison is valid even though `name` is STRING.
      expect(errors).toEqual([]);
    });

    it('rejects an operator that is invalid for the aggregate EFFECTIVE type (contains on SUM→INTEGER)', () => {
      const errors = svc.validateHavingFilters(
        [{ column: 'amount', function: 'SUM', operator: 'contains', value: 'x' }],
        aggregations,
        resolveType,
        DataStorageType.GOOGLE_BIGQUERY
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
        DataStorageType.GOOGLE_BIGQUERY
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
        DataStorageType.GOOGLE_BIGQUERY
      );
      expect(errors).toEqual([
        { code: 'HAVING_FILTER_INVALID_PLACEMENT', column: 'amount', function: 'SUM' },
      ]);
    });
  });
});
