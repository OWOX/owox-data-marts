import { BeginMcpGoogleSheetsSetupService } from './begin-mcp-google-sheets-setup.service';
import type { McpDestinationSetupTokenService } from '../../services/google-oauth/mcp-destination-setup-token.service';
import type { RedirectBackAllowlistService } from '../../services/google-oauth/redirect-back-allowlist.service';
import type { PublicOriginService } from '../../../common/config/public-origin.service';

describe('BeginMcpGoogleSheetsSetupService', () => {
  let tokenService: jest.Mocked<Pick<McpDestinationSetupTokenService, 'issue'>>;
  let redirectBackAllowlist: jest.Mocked<Pick<RedirectBackAllowlistService, 'sanitize'>>;
  let publicOriginService: jest.Mocked<Pick<PublicOriginService, 'getPublicOrigin' | 'ensureHttps'>>;
  let service: BeginMcpGoogleSheetsSetupService;

  beforeEach(() => {
    tokenService = { issue: jest.fn().mockReturnValue('signed-token') };
    redirectBackAllowlist = { sanitize: jest.fn() };
    publicOriginService = {
      getPublicOrigin: jest.fn().mockReturnValue('http://localhost:3000'),
      ensureHttps: jest.fn().mockReturnValue('https://localhost:3000'),
    };

    service = new BeginMcpGoogleSheetsSetupService(
      tokenService as unknown as McpDestinationSetupTokenService,
      redirectBackAllowlist as unknown as RedirectBackAllowlistService,
      publicOriginService as unknown as PublicOriginService
    );
  });

  it('builds a setup URL pointing at the start endpoint with the signed token', () => {
    redirectBackAllowlist.sanitize.mockReturnValue(undefined);

    const result = service.run({ projectId: 'project-1', userId: 'user-1' });

    expect(result.setupUrl).toBe(
      'https://localhost:3000/data-destinations/oauth/mcp/google-sheets/start?token=signed-token'
    );
  });

  it('sanitizes redirectBack before minting the token', () => {
    redirectBackAllowlist.sanitize.mockReturnValue('https://claude.ai/chat/123');

    service.run({
      projectId: 'project-1',
      userId: 'user-1',
      title: 'My Sheets',
      redirectBack: 'https://claude.ai/chat/123',
    });

    expect(redirectBackAllowlist.sanitize).toHaveBeenCalledWith('https://claude.ai/chat/123');
    expect(tokenService.issue).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      title: 'My Sheets',
      redirectBack: 'https://claude.ai/chat/123',
    });
  });

  it('drops a non-allowlisted redirectBack before minting the token', () => {
    redirectBackAllowlist.sanitize.mockReturnValue(undefined);

    service.run({
      projectId: 'project-1',
      userId: 'user-1',
      redirectBack: 'https://evil.example.com',
    });

    expect(tokenService.issue).toHaveBeenCalledWith(
      expect.objectContaining({ redirectBack: undefined })
    );
  });
});
