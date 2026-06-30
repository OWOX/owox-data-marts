jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { PublishDataMartService } from './publish-data-mart.service';
import { PublishDataMartCommand } from '../dto/domain/publish-data-mart.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';

describe('PublishDataMartService', () => {
  const createService = (options: { isValid: boolean } = { isValid: true }) => {
    const dataMart = {
      id: 'dm-1',
      projectId: 'proj-1',
      status: DataMartStatus.DRAFT,
      definitionType: DataMartDefinitionType.TABLE,
      definition: { tableName: 'my_table' },
      createdById: 'user-1',
    };

    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart),
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
      toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1', status: DataMartStatus.PUBLISHED }),
    };

    const eventDispatcher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };

    const connectorExecutionService = {
      run: jest.fn().mockResolvedValue(undefined),
    };

    const advancedSearchIndexSync = {
      scheduleReindex: jest.fn().mockResolvedValue(undefined),
    };

    const service = new (PublishDataMartService as any)(
      dataMartService as any,
      definitionValidatorFacade as any,
      mapper as any,
      eventDispatcher as any,
      accessDecisionService as any,
      connectorExecutionService as any,
      advancedSearchIndexSync
    );

    return {
      service: service as PublishDataMartService,
      dataMartService,
      definitionValidatorFacade,
      dataMart,
      advancedSearchIndexSync,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should publish successfully when storage validation succeeds', async () => {
    const { service, dataMartService, definitionValidatorFacade, dataMart } = createService({
      isValid: true,
    });
    const command = new PublishDataMartCommand('dm-1', 'proj-1', 'user-1', ['editor'], 'user-1');

    const result = await service.run(command);

    expect(definitionValidatorFacade.checkIsValid).toHaveBeenCalledWith(dataMart);
    expect(dataMart.status).toBe(DataMartStatus.PUBLISHED);
    expect(dataMartService.save).toHaveBeenCalledWith(dataMart);
    expect(result.status).toBe(DataMartStatus.PUBLISHED);
  });

  it('schedules search reindex after successful publish', async () => {
    const { service, advancedSearchIndexSync } = createService({ isValid: true });
    const command = new PublishDataMartCommand('dm-1', 'proj-1', 'user-1', ['editor'], 'user-1');

    await service.run(command);

    expect(advancedSearchIndexSync.scheduleReindex).toHaveBeenCalledWith(
      'DATA_MART',
      'dm-1',
      'proj-1'
    );
  });

  it('should reject publish when storage validation fails', async () => {
    const { service, dataMartService, advancedSearchIndexSync } = createService({
      isValid: false,
    });
    const command = new PublishDataMartCommand('dm-1', 'proj-1', 'user-1', ['editor'], 'user-1');

    await expect(service.run(command)).rejects.toThrow(BusinessViolationException);
    expect(dataMartService.save).not.toHaveBeenCalled();
    expect(advancedSearchIndexSync.scheduleReindex).not.toHaveBeenCalled();
  });
});
