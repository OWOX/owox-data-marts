import { BadRequestException } from '@nestjs/common';
import { OutputControlsValidatorService } from './output-controls-validator.service';
import { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
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

    it('rejects home aliasPath', () => {
      const errors = svc.validateFilters(
        [{ column: 'x', operator: 'eq', value: 1, placement: 'pre-join', aliasPath: 'main' }],
        homeFieldTypes,
        knownPaths
      );
      expect(errors).toEqual([
        { code: 'FILTER_ALIAS_PATH_NOT_ALLOWED_ON_HOME', aliasPath: 'main' },
      ]);
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

    it('home-rejection wins over excluded-rejection', () => {
      const excluded = new Set(['main']);
      const errors = svc.validateFilters(
        [{ column: 'x', operator: 'eq', value: 1, placement: 'pre-join', aliasPath: 'main' }],
        homeFieldTypes,
        new Map(),
        excluded
      );
      expect(errors).toEqual([
        { code: 'FILTER_ALIAS_PATH_NOT_ALLOWED_ON_HOME', aliasPath: 'main' },
      ]);
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

    it('rejects pre-join rule that is missing aliasPath (defense in depth past Zod)', () => {
      const errors = svc.validateFilters(
        [{ column: 'userRole', operator: 'eq', value: 'admin', placement: 'pre-join' } as never],
        homeFieldTypes,
        knownPaths
      );
      expect(errors).toEqual([{ code: 'FILTER_ALIAS_PATH_REQUIRED', column: 'userRole' }]);
    });

    it('rejects post-join rule that carries aliasPath (must mirror Zod contract)', () => {
      const homeTypes = new Map<string, string>([['name', BigQueryFieldType.STRING]]);
      const errors = svc.validateFilters(
        [
          {
            column: 'name',
            operator: 'eq',
            value: 'X',
            placement: 'post-join',
            aliasPath: 'users',
          } as never,
        ],
        homeTypes
      );
      expect(errors).toEqual([
        {
          code: 'FILTER_ALIAS_PATH_FORBIDDEN_ON_POST_JOIN',
          column: 'name',
          aliasPath: 'users',
        },
      ]);
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
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors[0].code).toBe('SORT_COLUMN_NOT_SELECTED');
    });

    it('falls back to all known columns when columnConfig is null for sort validation', async () => {
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
        })
      ).resolves.toBeUndefined();
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
          columnConfig: null,
          filterConfig: [
            { column: 'x', operator: 'eq', value: 1, placement: 'pre-join', aliasPath: 'orgs' },
          ],
          sortConfig: null,
          limitConfig: null,
        });
      } catch (e) {
        caught = e as BadRequestException;
      }

      expect(caught).toBeDefined();
      const response = caught!.getResponse() as { details: { errors: { code: string }[] } };
      expect(response.details.errors[0].code).toBe('FILTER_ALIAS_PATH_UNKNOWN');
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
        })
      ).resolves.toBeUndefined();
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
        })
      ).resolves.toBeUndefined();
    });
  });
});
