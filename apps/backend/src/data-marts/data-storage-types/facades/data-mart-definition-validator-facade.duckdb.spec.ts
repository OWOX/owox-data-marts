// data-mart-definition-validator-facade.duckdb.spec.ts
//
// Regression test for a facade-level gap found while wiring SP-B1's e2e (Task 5):
// `DataMartDefinitionValidatorFacade.validate` unconditionally required
// `dataMart.storage.credentialId`, which blocked `publish` for every DuckDB-backed
// CONNECTOR data mart (DuckDB is credential-less by design -- Task 3's
// `DataStorageCredentialsResolver` never stores a `DataStorageCredential` row for it).
import { DataMartDefinitionValidatorFacade } from './data-mart-definition-validator-facade.service';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMart } from '../../entities/data-mart.entity';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataMartValidator, ValidationResult } from '../interfaces/data-mart-validator.interface';
import { DataStorageCredentialsResolver } from '../data-storage-credentials-resolver.service';

describe('DataMartDefinitionValidatorFacade DuckDB', () => {
  let validatorResolver: jest.Mocked<
    Pick<TypeResolver<DataStorageType, DataMartValidator>, 'resolve'>
  >;
  let credentialsResolver: jest.Mocked<Pick<DataStorageCredentialsResolver, 'resolve'>>;
  let innerValidator: jest.Mocked<DataMartValidator>;
  let facade: DataMartDefinitionValidatorFacade;

  beforeEach(() => {
    innerValidator = {
      type: DataStorageType.DUCKDB,
      validate: jest.fn().mockResolvedValue(ValidationResult.success()),
    };
    validatorResolver = { resolve: jest.fn().mockResolvedValue(innerValidator) };
    credentialsResolver = { resolve: jest.fn().mockResolvedValue({}) };
    facade = new DataMartDefinitionValidatorFacade(
      validatorResolver as unknown as TypeResolver<DataStorageType, DataMartValidator>,
      credentialsResolver as unknown as DataStorageCredentialsResolver
    );
  });

  it('does not require a credentialId for a credential-less DuckDB storage', async () => {
    const dataMart = {
      definition: {
        connector: {
          source: { node: 'publicHolidays' },
          storage: { fullyQualifiedName: 'main.holidays' },
        },
      },
      storage: { type: DataStorageType.DUCKDB, config: {}, credentialId: null },
    } as unknown as DataMart;

    const result = await facade.validate(dataMart);

    expect(result.valid).toBe(true);
    expect(innerValidator.validate).toHaveBeenCalledWith(
      dataMart.definition,
      dataMart.storage.config,
      {}
    );
  });

  it('still requires a credentialId for non-DuckDB storages (regression guard)', async () => {
    const dataMart = {
      definition: { connector: {} },
      storage: { type: DataStorageType.GOOGLE_BIGQUERY, config: {}, credentialId: null },
    } as unknown as DataMart;

    const result = await facade.validate(dataMart);

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toBe('DataMart storage credentials not found');
    expect(innerValidator.validate).not.toHaveBeenCalled();
  });
});
