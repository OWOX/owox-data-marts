import { ForbiddenException } from '@nestjs/common';
import { RunDataMartService } from './run-data-mart.service';
import { RunDataMartCommand } from '../dto/domain/run-data-mart.command';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { ValidationResultCode } from '../data-storage-types/interfaces/data-storage-access-validator.interface';
import { CredentialsExpiredException } from '../exceptions/google-oauth.exceptions';

describe('RunDataMartService', () => {
  const mockDataMart = {
    id: 'dm-1',
    projectId: 'proj-1',
    definitionType: DataMartDefinitionType.CONNECTOR,
    storage: {
      id: 'storage-1',
      type: 'GOOGLE_BIGQUERY',
      config: { projectId: 'p' },
      credentialId: 'cred-1',
    },
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
    const credentialsResolver = {
      resolve: jest.fn().mockResolvedValue({ type: 'bigquery_oauth' }),
    };
    const validationFacade = {
      validateAccess: jest.fn().mockResolvedValue({ valid: true }),
    };

    const service = new RunDataMartService(
      dataMartService as never,
      connectorExecutionService as never,
      accessDecisionService as never,
      validationFacade as never,
      credentialsResolver as never
    );

    return {
      service,
      dataMartService,
      connectorExecutionService,
      accessDecisionService,
      credentialsResolver,
      validationFacade,
    };
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

  describe('pre-run storage access check', () => {
    const command = () => new RunDataMartCommand('dm-1', 'proj-1', '', 'manual' as never);

    it('blocks the run when validation requires re-authorization', async () => {
      const { service, validationFacade, connectorExecutionService } = createService();
      validationFacade.validateAccess.mockResolvedValue({
        valid: false,
        code: ValidationResultCode.OAUTH_REAUTH_REQUIRED,
      });

      await expect(service.run(command())).rejects.toBeInstanceOf(CredentialsExpiredException);
      expect(connectorExecutionService.run).not.toHaveBeenCalled();
    });

    it('blocks the run when credential resolution reports expired authorization', async () => {
      const { service, credentialsResolver, connectorExecutionService } = createService();
      credentialsResolver.resolve.mockRejectedValue(
        new CredentialsExpiredException('storage-1', 'storage')
      );

      await expect(service.run(command())).rejects.toBeInstanceOf(CredentialsExpiredException);
      expect(connectorExecutionService.run).not.toHaveBeenCalled();
    });

    it('proceeds when validation fails with a transient/non-reauth error', async () => {
      const { service, validationFacade, connectorExecutionService } = createService();
      validationFacade.validateAccess.mockResolvedValue({
        valid: false,
        errorMessage: 'Temporary API error',
      });

      const result = await service.run(command());

      expect(result).toBe('run-id-1');
      expect(connectorExecutionService.run).toHaveBeenCalled();
    });

    it('proceeds when credential resolution throws a transient error', async () => {
      const { service, credentialsResolver, connectorExecutionService } = createService();
      credentialsResolver.resolve.mockRejectedValue(new Error('network timeout'));

      const result = await service.run(command());

      expect(result).toBe('run-id-1');
      expect(connectorExecutionService.run).toHaveBeenCalled();
    });

    it('skips the check for storage without a credentialId', async () => {
      const { service, dataMartService, credentialsResolver, connectorExecutionService } =
        createService();
      dataMartService.getByIdAndProjectId.mockResolvedValue({
        ...mockDataMart,
        storage: { id: 'storage-2', type: 'AWS_ATHENA', config: { region: 'us' } },
      });

      const result = await service.run(command());

      expect(result).toBe('run-id-1');
      expect(credentialsResolver.resolve).not.toHaveBeenCalled();
      expect(connectorExecutionService.run).toHaveBeenCalled();
    });

    it('skips validateAccess for non-OAuth credentials (e.g. service account)', async () => {
      const { service, credentialsResolver, validationFacade, connectorExecutionService } =
        createService();
      credentialsResolver.resolve.mockResolvedValue({ type: 'service_account' });

      const result = await service.run(command());

      expect(result).toBe('run-id-1');
      expect(validationFacade.validateAccess).not.toHaveBeenCalled();
      expect(connectorExecutionService.run).toHaveBeenCalled();
    });

    it('skips the check for scheduled runs so they still produce a failed-run record', async () => {
      const { service, validationFacade, credentialsResolver, connectorExecutionService } =
        createService();
      // Even when the storage would require re-authorization, a scheduled run must proceed
      // (and fail during execution) rather than being silently dropped before any record exists.
      validationFacade.validateAccess.mockResolvedValue({
        valid: false,
        code: ValidationResultCode.OAUTH_REAUTH_REQUIRED,
      });

      const scheduledCommand = new RunDataMartCommand('dm-1', 'proj-1', '', 'scheduled' as never);
      const result = await service.run(scheduledCommand);

      expect(result).toBe('run-id-1');
      expect(credentialsResolver.resolve).not.toHaveBeenCalled();
      expect(validationFacade.validateAccess).not.toHaveBeenCalled();
      expect(connectorExecutionService.run).toHaveBeenCalled();
    });
  });
});
