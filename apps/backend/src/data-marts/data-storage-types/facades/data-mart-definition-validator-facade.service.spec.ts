import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataMartDefinitionValidatorFacade } from './data-mart-definition-validator-facade.service';
import {
  DataMartValidationCode,
  ValidationResult,
} from '../interfaces/data-mart-validator.interface';

describe('DataMartDefinitionValidatorFacade', () => {
  const createFacade = (validatorResult: ValidationResult) => {
    const resolver = {
      resolve: jest
        .fn()
        .mockResolvedValue({ validate: jest.fn().mockResolvedValue(validatorResult) }),
    };
    const credentialsResolver = { resolve: jest.fn().mockResolvedValue({}) };

    const facade = new DataMartDefinitionValidatorFacade(
      resolver as never,
      credentialsResolver as never
    );

    const dataMart = {
      id: 'dm-1',
      definition: { fullyQualifiedName: 'p.d.t' },
      storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY', config: {}, credentialId: 'cred-1' },
    };

    return { facade, dataMart };
  };

  const codeOf = async (result: ValidationResult): Promise<string | undefined> => {
    const { facade, dataMart } = createFacade(result);
    const error: unknown = await facade.checkIsValid(dataMart as never).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BusinessViolationException);
    return (error as BusinessViolationException).code;
  };

  // This propagation is what lets the publish path tell an authored validator
  // message from raw driver output; without it the message is genericized.
  it('propagates the code of an authored validation failure', async () => {
    const code = await codeOf(
      ValidationResult.authoredFailure(
        DataMartValidationCode.INVALID_IDENTIFIER_FORMAT,
        'Invalid identifier format. Expected: project.dataset.table'
      )
    );

    expect(code).toBe(DataMartValidationCode.INVALID_IDENTIFIER_FORMAT);
  });

  it('leaves an uncoded failure uncoded, so consumers replace its message', async () => {
    const code = await codeOf(
      ValidationResult.failure('Dry run failed: syntax error at [1:8] near `acme-prod-1234`')
    );

    expect(code).toBeUndefined();
  });

  it('codes its own missing-credentials failure', async () => {
    const { facade } = createFacade(ValidationResult.success());
    const dataMart = {
      id: 'dm-1',
      definition: { fullyQualifiedName: 'p.d.t' },
      storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY', config: {}, credentialId: undefined },
    };

    const error: unknown = await facade.checkIsValid(dataMart as never).catch((e: unknown) => e);

    expect((error as BusinessViolationException).code).toBe(
      DataMartValidationCode.STORAGE_CREDENTIALS_NOT_FOUND
    );
  });
});
