import { FinishMcpGoogleSheetsSetupService } from './finish-mcp-google-sheets-setup.service';
import { CreateDataDestinationCommand } from '../../dto/domain/create-data-destination.command';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { InvalidOAuthStateException } from '../../exceptions/google-oauth.exceptions';
import type { GoogleOAuthFlowService } from '../../services/google-oauth/google-oauth-flow.service';
import type { RedirectBackAllowlistService } from '../../services/google-oauth/redirect-back-allowlist.service';
import type { DataDestinationCredentialService } from '../../services/data-destination-credential.service';
import type { CreateDataDestinationService } from '../create-data-destination.service';
import type { DataDestinationDto } from '../../dto/domain/data-destination.dto';

describe('FinishMcpGoogleSheetsSetupService', () => {
  let googleOAuthFlowService: jest.Mocked<
    Pick<GoogleOAuthFlowService, 'validateStateToken' | 'exchangeAuthorizationCode'>
  >;
  let createDataDestinationService: jest.Mocked<Pick<CreateDataDestinationService, 'run'>>;
  let dataDestinationCredentialService: jest.Mocked<Pick<DataDestinationCredentialService, 'softDelete'>>;
  let redirectBackAllowlist: jest.Mocked<Pick<RedirectBackAllowlistService, 'sanitize'>>;
  let service: FinishMcpGoogleSheetsSetupService;

  const mcpStatePayload = {
    projectId: 'project-1',
    type: 'destination' as const,
    redirectUri: 'https://app.owox.com/oauth/google/callback',
    mcpUserId: 'user-1',
    mcpRedirectBack: 'https://claude.ai/chat/123',
    mcpTitle: 'My Google Sheets',
  };

  beforeEach(() => {
    googleOAuthFlowService = {
      validateStateToken: jest.fn().mockReturnValue(mcpStatePayload),
      exchangeAuthorizationCode: jest.fn().mockResolvedValue({ credentialId: 'credential-1' }),
    };
    createDataDestinationService = {
      run: jest.fn().mockResolvedValue({ id: 'destination-1' } as DataDestinationDto),
    };
    dataDestinationCredentialService = { softDelete: jest.fn().mockResolvedValue(undefined) };
    redirectBackAllowlist = { sanitize: jest.fn().mockReturnValue('https://claude.ai/chat/123') };

    service = new FinishMcpGoogleSheetsSetupService(
      googleOAuthFlowService as unknown as GoogleOAuthFlowService,
      createDataDestinationService as unknown as CreateDataDestinationService,
      dataDestinationCredentialService as unknown as DataDestinationCredentialService,
      redirectBackAllowlist as unknown as RedirectBackAllowlistService
    );
  });

  it('exchanges the code, creates the destination, and returns a sanitized redirect target', async () => {
    const result = await service.run('auth-code', 'state-token');

    expect(googleOAuthFlowService.exchangeAuthorizationCode).toHaveBeenCalledWith(
      'auth-code',
      'state-token',
      'user-1',
      'project-1'
    );
    expect(createDataDestinationService.run).toHaveBeenCalledWith(
      new CreateDataDestinationCommand(
        'project-1',
        'My Google Sheets',
        DataDestinationType.GOOGLE_SHEETS,
        'user-1',
        undefined,
        'credential-1',
        undefined,
        undefined,
        []
      )
    );
    expect(result).toEqual({ destinationId: 'destination-1', redirectTo: 'https://claude.ai/chat/123' });
  });

  it('falls back to a default title when none was supplied', async () => {
    googleOAuthFlowService.validateStateToken.mockReturnValue({
      ...mcpStatePayload,
      mcpTitle: undefined,
    });

    await service.run('auth-code', 'state-token');

    const command = createDataDestinationService.run.mock.calls[0][0] as CreateDataDestinationCommand;
    expect(command.title).toBe('Google Sheets MCP Destination');
  });

  it('rejects a state token that is not an MCP setup token', async () => {
    googleOAuthFlowService.validateStateToken.mockReturnValue({
      projectId: 'project-1',
      type: 'destination',
      redirectUri: 'https://app.owox.com/oauth/google/callback',
    });

    await expect(service.run('auth-code', 'state-token')).rejects.toThrow(InvalidOAuthStateException);
    expect(googleOAuthFlowService.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('soft-deletes the just-created credential if destination creation fails, and rethrows', async () => {
    const failure = new Error('boom');
    createDataDestinationService.run.mockRejectedValue(failure);

    await expect(service.run('auth-code', 'state-token')).rejects.toThrow(failure);
    expect(dataDestinationCredentialService.softDelete).toHaveBeenCalledWith('credential-1');
  });
});
