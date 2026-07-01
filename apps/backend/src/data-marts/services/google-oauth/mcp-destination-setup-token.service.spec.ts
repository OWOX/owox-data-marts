import * as jwt from 'jsonwebtoken';
import { McpDestinationSetupTokenService } from './mcp-destination-setup-token.service';
import { InvalidOAuthStateException } from '../../exceptions/google-oauth.exceptions';
import type { GoogleOAuthConfigService } from './google-oauth-config.service';

describe('McpDestinationSetupTokenService', () => {
  const SECRET = 'test-secret';

  function createService(): McpDestinationSetupTokenService {
    const googleOAuthConfigService = {
      getJwtSecret: jest.fn().mockReturnValue(SECRET),
    } as unknown as GoogleOAuthConfigService;
    return new McpDestinationSetupTokenService(googleOAuthConfigService);
  }

  it('issues a token that verifies back to the original payload', () => {
    const service = createService();
    const token = service.issue({
      projectId: 'project-1',
      userId: 'user-1',
      title: 'My Google Sheets',
      redirectBack: 'https://claude.ai/chat/123',
    });

    const payload = service.verify(token);

    expect(payload).toMatchObject({
      purpose: 'mcp_google_sheets_destination_setup',
      projectId: 'project-1',
      userId: 'user-1',
      title: 'My Google Sheets',
      redirectBack: 'https://claude.ai/chat/123',
    });
  });

  it('rejects a token signed with a different secret', () => {
    const service = createService();
    const forged = jwt.sign(
      { purpose: 'mcp_google_sheets_destination_setup', projectId: 'project-1', userId: 'user-1' },
      'wrong-secret',
      { expiresIn: 300 }
    );

    expect(() => service.verify(forged)).toThrow(InvalidOAuthStateException);
  });

  it('rejects an expired token', () => {
    const service = createService();
    const expired = jwt.sign(
      { purpose: 'mcp_google_sheets_destination_setup', projectId: 'project-1', userId: 'user-1' },
      SECRET,
      { expiresIn: -1 }
    );

    expect(() => service.verify(expired)).toThrow(InvalidOAuthStateException);
  });

  it('rejects a token with the wrong purpose', () => {
    const service = createService();
    const wrongPurpose = jwt.sign(
      { purpose: 'something_else', projectId: 'project-1', userId: 'user-1' },
      SECRET,
      { expiresIn: 300 }
    );

    expect(() => service.verify(wrongPurpose)).toThrow(InvalidOAuthStateException);
  });
});
