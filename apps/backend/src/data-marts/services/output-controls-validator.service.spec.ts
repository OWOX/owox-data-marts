import { BadRequestException } from '@nestjs/common';
import { OutputControlsValidatorService } from './output-controls-validator.service';
import { BigQueryFieldType } from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('OutputControlsValidatorService', () => {
  const svc = new OutputControlsValidatorService(undefined as never, undefined as never);

  describe('validateFilters', () => {
    const fieldTypes = new Map<string, string>([
      ['name', BigQueryFieldType.STRING],
      ['amount', BigQueryFieldType.INTEGER],
      ['created_at', BigQueryFieldType.TIMESTAMP],
      ['flag', BigQueryFieldType.BOOLEAN],
      ['nested', BigQueryFieldType.RECORD],
    ]);

    it('accepts eq on STRING', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'eq', value: 'X' }],
        fieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('rejects regex on INTEGER', () => {
      const errors = svc.validateFilters(
        [{ column: 'amount', operator: 'regex', value: '^1' }],
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
        [{ column: 'name', operator: 'between', value: { from: 'a', to: 'z' } }],
        fieldTypes
      );
      expect(errors[0].code).toBe('INVALID_OPERATOR_FOR_TYPE');
    });

    it('rejects filter on RECORD column', () => {
      const errors = svc.validateFilters([{ column: 'nested', operator: 'is_empty' }], fieldTypes);
      expect(errors[0].code).toBe('INVALID_OPERATOR_FOR_TYPE');
    });

    it('rejects filter on unknown column', () => {
      const errors = svc.validateFilters(
        [{ column: 'missing', operator: 'eq', value: 'X' }],
        fieldTypes
      );
      expect(errors).toEqual([{ code: 'FILTER_COLUMN_UNKNOWN', column: 'missing' }]);
    });

    it('accepts is_true on BOOLEAN', () => {
      const errors = svc.validateFilters([{ column: 'flag', operator: 'is_true' }], fieldTypes);
      expect(errors).toEqual([]);
    });

    it('accepts relative_date on TIMESTAMP', () => {
      const errors = svc.validateFilters(
        [{ column: 'created_at', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } }],
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
        { column: 'i', operator: 'gt' as const, value: 1 },
        { column: 'f', operator: 'gt' as const, value: 1 },
        { column: 'n', operator: 'gt' as const, value: 1 },
        { column: 'b', operator: 'gt' as const, value: 1 },
      ];
      expect(svc.validateFilters(filters, types)).toEqual([]);
    });

    it('accepts a valid regex on STRING', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'regex', value: '^foo$' }],
        fieldTypes
      );
      expect(errors).toEqual([]);
    });

    it('rejects unparseable regex on STRING with INVALID_REGEX_PATTERN', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'regex', value: '[unclosed' }],
        fieldTypes
      );
      expect(errors).toEqual([
        { code: 'INVALID_REGEX_PATTERN', column: 'name', pattern: '[unclosed' },
      ]);
    });

    it('rejects unparseable not_regex on STRING with INVALID_REGEX_PATTERN', () => {
      const errors = svc.validateFilters(
        [{ column: 'name', operator: 'not_regex', value: '*' }],
        fieldTypes
      );
      expect(errors[0]).toMatchObject({ code: 'INVALID_REGEX_PATTERN', column: 'name' });
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

    const makeBlendableSchemaService = (fields: { name: string; type: string }[] = []) => ({
      computeBlendableSchema: jest.fn().mockResolvedValue({
        nativeFields: fields,
        blendedFields: [],
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
          columnConfig: ['date'], // only 'date' selected, not 'amount'
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
          columnConfig: null, // no explicit projection → all fields allowed
          filterConfig: null,
          sortConfig: [{ column: 'amount', direction: 'asc' }],
          limitConfig: null,
        })
      ).resolves.toBeUndefined();
    });

    it('rejects payload with mismatched filter shape via Zod (defence-in-depth)', async () => {
      // class-validator passes shapeless arrays; the validator must catch
      // discriminator violations (between operator with scalar value, etc.).
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
          // 'between' requires { from, to }; passing a scalar should be rejected.
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
          // n=10000 exceeds the 3650 cap (~10 years), preventing accidental
          // expensive scans like INTERVAL 9999999999 DAY.
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
  });
});
