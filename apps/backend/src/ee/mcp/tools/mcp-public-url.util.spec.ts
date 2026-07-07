import { joinPublicOrigin } from './mcp-public-url.util';

describe('joinPublicOrigin', () => {
  it('joins a relative path onto the origin', () => {
    expect(
      joinPublicOrigin('https://app.owox.com', '/ui/project-1/data-marts/dm_1/data-setup')
    ).toBe('https://app.owox.com/ui/project-1/data-marts/dm_1/data-setup');
  });

  it('handles a trailing slash on the origin', () => {
    expect(joinPublicOrigin('https://app.owox.com/', '/ui/project-1/connect/google-sheets')).toBe(
      'https://app.owox.com/ui/project-1/connect/google-sheets'
    );
  });

  it('preserves a query string on the path', () => {
    expect(joinPublicOrigin('https://app.owox.com', '/ui/project-1/connect/x?title=Foo')).toBe(
      'https://app.owox.com/ui/project-1/connect/x?title=Foo'
    );
  });
});
