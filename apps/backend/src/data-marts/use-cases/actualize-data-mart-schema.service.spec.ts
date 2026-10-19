jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { ActualizeDataMartSchemaService } from './actualize-data-mart-schema.service';
import { ActualizeDataMartSchemaCommand } from '../dto/domain/actualize-data-mart-schema.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { Action, EntityType } from '../services/access-decision';
import { ForbiddenException } from '@nestjs/common';

describe('ActualizeDataMartSchemaService', () => {
  const createService = (options: { isValid: boolean } = { isValid: true }) => {
    const dataMart = {
      id: 'dm-1',
      storage: { id: 'storage' },
      projectId: 'proj-1',
      definitionType: DataMartDefinitionType.TABLE,
      definition: { tableName: 'my_table' },
    };

    const dataMartService = {
      lockConfigurationReferences: jest.fn(),
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
      actualizeSchemaInEntity: jest.fn().mockResolvedValue(undefined),
      saveActualizedSchema: jest.fn().mockResolvedValue(dataMart),
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
    const service = new ActualizeDataMartSchemaService(
      dataMartService as any,
      definitionValidatorFacade as any,
      mapper as any,
      accessDecisionService as any
    );

    return {
      service,
      dataMartService,
      definitionValidatorFacade,
      dataMart,
      accessDecisionService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should actualize schema successfully when storage validation succeeds', async () => {
    const { service, dataMartService, definitionValidatorFacade, dataMart } = createService({
      isValid: true,
    });
    const command = new ActualizeDataMartSchemaCommand('dm-1', 'proj-1', 'user-1', ['editor']);

    const result = await service.run(command);

    expect(definitionValidatorFacade.checkIsValid).toHaveBeenCalledWith(dataMart);
    expect(dataMartService.actualizeSchemaInEntity).toHaveBeenCalledWith(dataMart);
    expect(dataMartService.saveActualizedSchema).toHaveBeenCalledWith(dataMart);
    expect(result).toEqual({ id: 'dm-1' });
  });

  it('should reject schema actualization when storage validation fails', async () => {
    const { service, dataMartService } = createService({
      isValid: false,
    });
    const command = new ActualizeDataMartSchemaCommand('dm-1', 'proj-1', 'user-1', ['editor']);

    await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
    expect(dataMartService.actualizeSchemaInEntity).not.toHaveBeenCalled();
    expect(dataMartService.saveActualizedSchema).not.toHaveBeenCalled();
  });

  it('rejects denied Storage USE before validation or warehouse schema work', async () => {
    const { service, dataMartService, definitionValidatorFacade, accessDecisionService } =
      createService();
    accessDecisionService.canAccess.mockImplementation(
      async (_userId: string, _roles: string[], type: EntityType, _id: string, action: Action) =>
        type !== EntityType.STORAGE || action !== Action.USE
    );

    await expect(
      service.run(new ActualizeDataMartSchemaCommand('dm-1', 'proj-1', 'user-1', ['editor']))
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(definitionValidatorFacade.checkIsValid).not.toHaveBeenCalled();
    expect(dataMartService.actualizeSchemaInEntity).not.toHaveBeenCalled();
    expect(dataMartService.saveActualizedSchema).not.toHaveBeenCalled();
  });
});
