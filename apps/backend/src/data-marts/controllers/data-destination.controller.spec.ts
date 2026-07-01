jest.mock('../../idp', () => {
  const noop = () => () => undefined;
  return {
    Auth: noop,
    AuthContext: noop,
    Role: { admin: () => 'admin', editor: () => 'editor', viewer: () => 'viewer' },
    Strategy: { INTROSPECT: 'INTROSPECT', PARSE: 'PARSE' },
  };
});

import { DataDestinationController } from './data-destination.controller';
import { InvalidOAuthStateException } from '../exceptions/google-oauth.exceptions';

describe('DataDestinationController — MCP Google Sheets setup routes', () => {
  const createController = () => {
    const googleOAuthFlowService = {
      generateAuthorizationUrl: jest.fn(),
    };
    const googleOAuthConfigService = {
      getRedirectUri: jest.fn().mockReturnValue('https://app.owox.com/oauth/google/callback'),
    };
    const mcpDestinationSetupTokenService = {
      verify: jest.fn(),
    };
    const finishMcpGoogleSheetsSetupService = {
      run: jest.fn(),
    };

    // Only the 4 deps exercised by the new MCP routes are meaningfully stubbed; the
    // rest of this 21-arg constructor is irrelevant to these routes.
    const controller = new DataDestinationController(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      googleOAuthFlowService as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      googleOAuthConfigService as never,
      mcpDestinationSetupTokenService as never,
      finishMcpGoogleSheetsSetupService as never
    );

    return {
      controller,
      googleOAuthFlowService,
      googleOAuthConfigService,
      mcpDestinationSetupTokenService,
      finishMcpGoogleSheetsSetupService,
    };
  };

  describe('startMcpGoogleSheetsSetup', () => {
    it('verifies the setup token and 302-redirects to the Google authorization URL', async () => {
      const { controller, googleOAuthFlowService, mcpDestinationSetupTokenService } =
        createController();
      mcpDestinationSetupTokenService.verify.mockReturnValue({
        purpose: 'mcp_google_sheets_destination_setup',
        projectId: 'project-1',
        userId: 'user-1',
        title: 'My Sheets',
        redirectBack: 'https://claude.ai/chat/123',
      });
      googleOAuthFlowService.generateAuthorizationUrl.mockResolvedValue({
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
        state: 'signed-state',
      });
      const res = { redirect: jest.fn() };

      await controller.startMcpGoogleSheetsSetup('setup-token', res as never);

      expect(mcpDestinationSetupTokenService.verify).toHaveBeenCalledWith('setup-token');
      expect(googleOAuthFlowService.generateAuthorizationUrl).toHaveBeenCalledWith(
        'destination',
        'project-1',
        undefined,
        'https://app.owox.com/oauth/google/callback',
        {
          mcpUserId: 'user-1',
          mcpRedirectBack: 'https://claude.ai/chat/123',
          mcpTitle: 'My Sheets',
        }
      );
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'https://accounts.google.com/o/oauth2/v2/auth?...'
      );
    });

    it('propagates the error for an invalid or expired token without redirecting', async () => {
      const { controller, googleOAuthFlowService, mcpDestinationSetupTokenService } =
        createController();
      mcpDestinationSetupTokenService.verify.mockImplementation(() => {
        throw new InvalidOAuthStateException();
      });
      const res = { redirect: jest.fn() };

      await expect(
        controller.startMcpGoogleSheetsSetup('bad-token', res as never)
      ).rejects.toThrow(InvalidOAuthStateException);
      expect(res.redirect).not.toHaveBeenCalled();
      expect(googleOAuthFlowService.generateAuthorizationUrl).not.toHaveBeenCalled();
    });
  });

  describe('finishMcpGoogleSheetsSetup', () => {
    it('delegates to FinishMcpGoogleSheetsSetupService', async () => {
      const { controller, finishMcpGoogleSheetsSetupService } = createController();
      finishMcpGoogleSheetsSetupService.run.mockResolvedValue({
        destinationId: 'destination-1',
        redirectTo: 'https://claude.ai/chat/123',
      });

      const result = await controller.finishMcpGoogleSheetsSetup({
        code: 'auth-code',
        state: 'signed-state',
      });

      expect(finishMcpGoogleSheetsSetupService.run).toHaveBeenCalledWith(
        'auth-code',
        'signed-state'
      );
      expect(result).toEqual({ destinationId: 'destination-1', redirectTo: 'https://claude.ai/chat/123' });
    });
  });
});
