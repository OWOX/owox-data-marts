import { ConfigService } from '@nestjs/config';
import { RedirectBackAllowlistService } from './redirect-back-allowlist.service';

describe('RedirectBackAllowlistService', () => {
  function createService(allowedOrigins = 'https://claude.ai,https://chatgpt.com'): RedirectBackAllowlistService {
    const config = {
      get: jest.fn((key: string) =>
        key === 'MCP_DESTINATION_SETUP_ALLOWED_REDIRECT_ORIGINS' ? allowedOrigins : undefined
      ),
    } as unknown as ConfigService;
    return new RedirectBackAllowlistService(config);
  }

  it('returns undefined for a missing value', () => {
    const service = createService();
    expect(service.sanitize(undefined)).toBeUndefined();
    expect(service.sanitize('')).toBeUndefined();
  });

  it('returns undefined for a malformed URL', () => {
    const service = createService();
    expect(service.sanitize('not-a-url')).toBeUndefined();
  });

  it('accepts an allowlisted https origin', () => {
    const service = createService();
    expect(service.sanitize('https://claude.ai/chat/123')).toBe('https://claude.ai/chat/123');
  });

  it('rejects a non-allowlisted https origin', () => {
    const service = createService();
    expect(service.sanitize('https://evil.example.com/phish')).toBeUndefined();
  });

  it.each(['claude://connected', 'cursor://oauth/done', 'vscode://owox/done'])(
    'accepts the deep-link scheme %s regardless of the allowlist',
    url => {
      const service = createService('');
      expect(service.sanitize(url)).toBe(url);
    }
  );

  it('rejects http (non-https) origins even if the host matches an allowlisted origin', () => {
    const service = createService('https://claude.ai');
    expect(service.sanitize('http://claude.ai')).toBeUndefined();
  });

  it('never throws, even for unexpected input', () => {
    const service = createService();
    expect(() => service.sanitize('::::')).not.toThrow();
  });
});
