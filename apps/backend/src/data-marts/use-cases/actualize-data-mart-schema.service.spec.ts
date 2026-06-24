jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { ActualizeDataMartSchemaService } from './actualize-data-mart-schema.service';
import { ActualizeDataMartSchemaCommand } from '../dto/domain/actualize-data-mart-schema.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';

describe('ActualizeDataMartSchemaService', () => {
  const createService = (options: { isValid: boolean } = { isValid: true }) => {
    const dataMart = {
      id: 'dm-1',
      projectId: 'proj-1',
      definitionType: DataMartDefinitionType.TABLE,
      definition: { tableName: 'my_table' },
    };

    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      actualizeSchemaInEntity: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(dataMart),
    };

    const definitionValidatorFacade = {
      checkIsValid: jest.fn().mockImplementation(() => {
        if (!options.isValid) {
          throw new BusinessViolationException('Storage validation failed');
        }
        return Promise.resolve();
      }),
    };

    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1' }),
    };

    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };
    const searchIndexInvalidation = {
      scheduleDataMartSchemaChanged: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ActualizeDataMartSchemaService(
      dataMartService as any,
      definitionValidatorFacade as any,
      mapper as any,
      accessDecisionService as any,
      searchIndexInvalidation as any
    );

    return {
      service,
      dataMartService,
      definitionValidatorFacade,
      dataMart,
      searchIndexInvalidation,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should actualize schema successfully when storage validation succeeds', async () => {
    const {
      service,
      dataMartService,
      definitionValidatorFacade,
      dataMart,
      searchIndexInvalidation,
    } = createService({
      isValid: true,
    });
    const command = new ActualizeDataMartSchemaCommand('dm-1', 'proj-1', 'user-1', ['editor']);

    const result = await service.run(command);

    expect(definitionValidatorFacade.checkIsValid).toHaveBeenCalledWith(dataMart);
    expect(dataMartService.actualizeSchemaInEntity).toHaveBeenCalledWith(dataMart);
    expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
    expect(searchIndexInvalidation.scheduleDataMartSchemaChanged).toHaveBeenCalledWith(
      'dm-1',
      'proj-1'
    );
    expect(result).toEqual({ id: 'dm-1' });
  });

  it('should reject schema actualization when storage validation fails', async () => {
    const { service, dataMartService } = createService({
      isValid: false,
    });
    const command = new ActualizeDataMartSchemaCommand('dm-1', 'proj-1', 'user-1', ['editor']);

    await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
    expect(dataMartService.actualizeSchemaInEntity).not.toHaveBeenCalled();
    expect(dataMartService.save).not.toHaveBeenCalled();
  });
});
