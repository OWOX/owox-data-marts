import { ForbiddenException } from '@nestjs/common';
import { RunDataMartService } from './run-data-mart.service';
import { RunDataMartCommand } from '../dto/domain/run-data-mart.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';

describe('RunDataMartService', () => {
  const mockDataMart = {
    id: 'dm-1',
    projectId: 'proj-1',
    definitionType: DataMartDefinitionType.CONNECTOR,
  };

  const createService = () => {
    const dataMartService = {
      getByIdAndProjectId: jest.fn().mockResolvedValue(mockDataMart),
    };
    const connectorExecutionService = {
      run: jest.fn().mockResolvedValue('run-id-1'),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };

    const service = new RunDataMartService(
      dataMartService as never,
      connectorExecutionService as never,
      accessDecisionService as never
    );

    return { service, dataMartService, connectorExecutionService, accessDecisionService };
  };

  it('should allow manual run when user has EDIT access', async () => {
    const { service, accessDecisionService, connectorExecutionService } = createService();
    accessDecisionService.canAccess.mockResolvedValue(true);

    const command = new RunDataMartCommand(
      'dm-1',
      'proj-1',
      'user-1',
      'manual' as never,
      undefined,
      ['editor']
    );
    const result = await service.run(command);

    expect(result).toBe('run-id-1');
    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      'DATA_MART',
      'dm-1',
      'EDIT',
      'proj-1'
    );
    expect(connectorExecutionService.run).toHaveBeenCalled();
  });

  it('should block manual run when user lacks EDIT access', async () => {
    const { service, accessDecisionService } = createService();
    accessDecisionService.canAccess.mockResolvedValue(false);

    const command = new RunDataMartCommand(
      'dm-1',
      'proj-1',
      'user-1',
      'manual' as never,
      undefined,
      ['editor']
    );

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should skip access check for scheduled runs (roles=[])', async () => {
    const { service, accessDecisionService, connectorExecutionService } = createService();

    // Scheduled run: createdById is set but roles is empty
    const command = new RunDataMartCommand(
      'dm-1',
      'proj-1',
      'trigger-creator-id',
      'scheduled' as never,
      undefined,
      []
    );
    const result = await service.run(command);

    expect(result).toBe('run-id-1');
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(connectorExecutionService.run).toHaveBeenCalled();
  });

  it('should skip access check when createdById is empty', async () => {
    const { service, accessDecisionService, connectorExecutionService } = createService();

    const command = new RunDataMartCommand('dm-1', 'proj-1', '', 'scheduled' as never);
    const result = await service.run(command);

    expect(result).toBe('run-id-1');
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(connectorExecutionService.run).toHaveBeenCalled();
  });
});
