import { BadRequestException } from '@nestjs/common';
import { OutputControlsValidatorService } from './output-controls-validator.service';
import { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { AthenaFieldType } from '../data-storage-types/athena/enums/athena-field-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('OutputControlsValidatorService', () => {
  const svc = new OutputControlsValidatorService(undefined as never, undefined as never);

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
    const homeFieldTypes = new Map<string, string>();
    const knownPaths = new Map<string, ReadonlyMap<string, string>>([
      [
        'users',
        new Map([
          ['userRole', BigQueryFieldType.STRING],
          ['createdAt', BigQueryFieldType.TIMESTAMP],
        ]),
      ],
      ['users.profiles', new Map([['country', BigQueryFieldType.STRING]])],
    ]);

    it('accepts a known aliasPath + known column + valid operator', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
        homeFieldTypes,
        knownPaths
      );
      expect(errors).toEqual([]);
    });

    it('rejects unknown aliasPath', () => {
      const errors = svc.validateFilters(
        [{ column: 'x', operator: 'eq', value: 1, placement: 'pre-join', aliasPath: 'orgs' }],
        homeFieldTypes,
        knownPaths
      );
      expect(errors).toEqual([{ code: 'FILTER_ALIAS_PATH_UNKNOWN', aliasPath: 'orgs' }]);
    });

    it('rejects unknown column inside known aliasPath (includes aliasPath in payload)', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'missing',
            operator: 'eq',
            value: 1,
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
        homeFieldTypes,
        knownPaths
      );
      expect(errors).toEqual([
        { code: 'FILTER_COLUMN_UNKNOWN', column: 'missing', aliasPath: 'users' },
      ]);
    });

    it('rejects regex on INTEGER inside pre-join filter (carries aliasPath)', () => {
      const pathsWithInt = new Map<string, ReadonlyMap<string, string>>([
        ['users', new Map([['amount', BigQueryFieldType.INTEGER]])],
      ]);
      const errors = svc.validateFilters(
        [
          {
            column: 'amount',
            operator: 'regex',
            value: '^1',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
        homeFieldTypes,
        pathsWithInt
      );
      expect(errors[0]).toMatchObject({
        code: 'INVALID_OPERATOR_FOR_TYPE',
        column: 'amount',
        aliasPath: 'users',
      });
    });

    it('rejects malformed regex pattern inside pre-join filter (carries aliasPath)', () => {
      const errors = svc.validateFilters(
        [
          {
            column: 'userRole',
            operator: 'regex',
            value: '[unclosed',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
        homeFieldTypes,
        knownPaths
      );
      expect(errors).toEqual([
        {
          code: 'INVALID_REGEX_PATTERN',
          column: 'userRole',
          pattern: '[unclosed',
          aliasPath: 'users',
        },
      ]);
    });

    it('rejects pre-join filter on excluded source', () => {
      const excluded = new Set(['users']);
      const errors = svc.validateFilters(
        [
          {
            column: 'userRole',
            operator: 'eq',
            value: 'admin',
            placement: 'pre-join',
            aliasPath: 'users',
          },
        ],
        homeFieldTypes,
        new Map(),
        excluded
      );
      expect(errors).toEqual([{ code: 'FILTER_ALIAS_PATH_NOT_INCLUDED', aliasPath: 'users' }]);
    });

    it('post-join rule without placement defaults to post-join lookup (does not need knownPaths)', () => {
      const homeTypes = new Map<string, string>([['name', BigQueryFieldType.STRING]]);
      const errors = svc.validateFilters(
        // No placement field — Zod default would set 'post-join'; raw call here
        // simulates a rule that was passed through unparsed.
        [{ column: 'name', operator: 'eq', value: 'X' } as never],
        homeTypes
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

    const makeBlendableSchemaService = (
      nativeFields: { name: string; type: string }[] = [],
      extras: {
        blendedFields?: {
          name?: string;
          aliasPath?: string;
          originalFieldName?: string;
          type: string;
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

    it('throws BadRequestException with FILTER_COLUMN_UNKNOWN for unknown filter column', async () => {
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
          filterConfig: [{ column: 'missing', operator: 'eq', value: 'X' }],
          sortConfig: null,
          limitConfig: null,
          accessor: { userId: 'user-1', roles: ['admin'] },
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors[0].code).toBe('FILTER_COLUMN_UNKNOWN');
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

    it('throws FILTER_ALIAS_PATH_UNKNOWN when pre-join filter aliasPath is not in blendableSchema', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([], {
        blendedFields: [
          { aliasPath: 'users', originalFieldName: 'userRole', type: BigQueryFieldType.STRING },
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
          columnConfig: ['some_col'],
          filterConfig: [
            { column: 'x', operator: 'eq', value: 1, placement: 'pre-join', aliasPath: 'orgs' },
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
      expect(response.details.errors[0].code).toBe('FILTER_ALIAS_PATH_UNKNOWN');
    });

    it('rejects pre-join filter when columnConfig is null/empty (PRE_JOIN_FILTERS_REQUIRE_COLUMN_CONFIG)', async () => {
      // Without a columnConfig the report renders as a flat passthrough — no
      // blended SQL is generated, so the slice would silently no-op. Validator
      // catches this at save time with a structured code.
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([], {
        blendedFields: [
          { aliasPath: 'users', originalFieldName: 'userRole', type: BigQueryFieldType.STRING },
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
              column: 'userRole',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
              aliasPath: 'users',
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

    it('resolves when pre-join filter aliasPath and column are valid', async () => {
      const capabilitySvc = makeCapabilityService(true);
      const schemaSvc = makeBlendableSchemaService([], {
        blendedFields: [
          { aliasPath: 'users', originalFieldName: 'userRole', type: BigQueryFieldType.STRING },
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
              column: 'userRole',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
              aliasPath: 'users',
            },
          ],
          sortConfig: null,
          limitConfig: null,
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

  describe('buildKnownPaths via validateForReport', () => {
    const supportedStorageType = DataStorageType.GOOGLE_BIGQUERY;

    it('emits FILTER_ALIAS_PATH_NOT_INCLUDED when source.isIncluded === false', async () => {
      const capabilitySvc = { isSupported: jest.fn().mockReturnValue(true) };
      const schemaSvc = {
        computeBlendableSchema: jest.fn().mockResolvedValue({
          nativeFields: [],
          blendedFields: [
            { aliasPath: 'users', originalFieldName: 'userRole', type: BigQueryFieldType.STRING },
          ],
          availableSources: [{ aliasPath: 'users', isIncluded: false }],
        }),
      };
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
          columnConfig: ['some_col'],
          filterConfig: [
            {
              column: 'userRole',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
              aliasPath: 'users',
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
      expect(response.details.errors[0].code).toBe('FILTER_ALIAS_PATH_NOT_INCLUDED');
    });

    it('included sources still accept pre-join filters on their columns (no false positive)', async () => {
      const capabilitySvc = { isSupported: jest.fn().mockReturnValue(true) };
      const schemaSvc = {
        computeBlendableSchema: jest.fn().mockResolvedValue({
          nativeFields: [],
          blendedFields: [
            { aliasPath: 'users', originalFieldName: 'userRole', type: BigQueryFieldType.STRING },
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
              column: 'userRole',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
              aliasPath: 'users',
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
});
