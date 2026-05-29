import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { BlendableSchemaService } from '../blendable-schema.service';
import { HttpDataColumnValidator } from './http-data-column-validator.service';

function fakeDataMart() {
  return { id: 'dm-main', projectId: 'proj-1' } as unknown as Parameters<
    HttpDataColumnValidator['validate']
  >[0];
}

describe('HttpDataColumnValidator', () => {
  let blendable: jest.Mocked<BlendableSchemaService>;
  let validator: HttpDataColumnValidator;

  beforeEach(() => {
    blendable = {
      computeBlendableSchema: jest.fn(),
    } as unknown as jest.Mocked<BlendableSchemaService>;

    validator = new HttpDataColumnValidator(blendable);
  });

  it('accepts native columns', async () => {
    blendable.computeBlendableSchema.mockResolvedValue({
      nativeFields: [{ name: 'date' }, { name: 'revenue' }] as never,
      blendedFields: [],
      availableSources: [],
    });

    await expect(
      validator.validate(fakeDataMart(), { selectedColumns: ['date', 'revenue'] })
    ).resolves.toBeUndefined();
  });

  it('accepts blended columns without checking access to their source Data Marts (authorized-view model)', async () => {
    blendable.computeBlendableSchema.mockResolvedValue({
      nativeFields: [{ name: 'date' }] as never,
      blendedFields: [
        { name: 'partner Revenue', sourceDataMartId: 'dm-partner' } as never,
        { name: 'shared Field', sourceDataMartId: 'dm-shared' } as never,
      ],
      availableSources: [],
    });

    await expect(
      validator.validate(fakeDataMart(), {
        selectedColumns: ['date', 'partner Revenue', 'shared Field'],
      })
    ).resolves.toBeUndefined();
  });

  it('rejects unknown selected columns with a business violation', async () => {
    blendable.computeBlendableSchema.mockResolvedValue({
      nativeFields: [{ name: 'date' }] as never,
      blendedFields: [],
      availableSources: [],
    });

    await expect(
      validator.validate(fakeDataMart(), { selectedColumns: ['date', 'ghost'] })
    ).rejects.toBeInstanceOf(BusinessViolationException);
  });

  it('validates post-join filter and sort columns for existence', async () => {
    blendable.computeBlendableSchema.mockResolvedValue({
      nativeFields: [{ name: 'date' }] as never,
      blendedFields: [],
      availableSources: [],
    });

    await expect(
      validator.validate(fakeDataMart(), {
        selectedColumns: ['date'],
        sort: [{ column: 'ghost', direction: 'asc' }],
      })
    ).rejects.toBeInstanceOf(BusinessViolationException);

    await expect(
      validator.validate(fakeDataMart(), {
        selectedColumns: ['date'],
        filter: [{ column: 'ghost', operator: 'gt', value: 1 }] as never,
      })
    ).rejects.toBeInstanceOf(BusinessViolationException);
  });

  it('ignores pre-join filter columns (resolved by aliasPath downstream, not by name here)', async () => {
    blendable.computeBlendableSchema.mockResolvedValue({
      nativeFields: [{ name: 'date' }] as never,
      blendedFields: [],
      availableSources: [{ aliasPath: 'employees', dataMartId: 'dm-employees' }] as never,
    });

    await expect(
      validator.validate(fakeDataMart(), {
        selectedColumns: ['date'],
        filter: [
          {
            column: 'employee_age',
            operator: 'gt',
            value: 18,
            placement: 'pre-join',
            aliasPath: 'employees',
          },
        ] as never,
      })
    ).resolves.toBeUndefined();
  });
});
