import { describe, expect, it } from 'vitest';
import { requestAccessRedirectTarget, storedRedirectTarget } from './post-auth-redirect';

describe('storedRedirectTarget', () => {
  it('resolves a stored placeholder link to the member project', () => {
    expect(
      storedRedirectTarget({
        storedRedirect: '/ui/none/plugins/p1?x=1',
        currentUrl: '/ui/42',
        projectId: '42',
      })
    ).toBe('/ui/42/plugins/p1?x=1');
  });

  it("keeps today's rules for real projects", () => {
    expect(
      storedRedirectTarget({ storedRedirect: '/ui/42/a', currentUrl: '/ui/42/a', projectId: '42' })
    ).toBeNull();
    expect(
      storedRedirectTarget({ storedRedirect: '/ui/42/a', currentUrl: '/ui/42', projectId: '42' })
    ).toBe('/ui/42/a');
    expect(
      storedRedirectTarget({ storedRedirect: '/ui/7/a', currentUrl: '/ui/7/b', projectId: '42' })
    ).toBe('/ui/42');
    expect(
      storedRedirectTarget({ storedRedirect: '/ui/7/a', currentUrl: '/ui/42/b', projectId: '42' })
    ).toBeNull();
    expect(
      storedRedirectTarget({ storedRedirect: null, currentUrl: '/ui/42', projectId: '42' })
    ).toBeNull();
  });
});

describe('requestAccessRedirectTarget', () => {
  it('keeps a stored placeholder deep link, resolved', () => {
    expect(
      requestAccessRedirectTarget({
        storedRedirect: '/ui/none/plugins/p1/open/d/1',
        currentUrl: '/ui/42',
        currentPath: '/ui/42',
        projectId: '42',
      })
    ).toBe('/ui/42/plugins/p1/open/d/1');
  });

  it('resolves a placeholder current URL when nothing was stored', () => {
    expect(
      requestAccessRedirectTarget({
        storedRedirect: null,
        currentUrl: '/ui/none/plugins/p1?x=1',
        currentPath: '/ui/none/plugins/p1',
        projectId: '42',
      })
    ).toBe('/ui/42/plugins/p1?x=1');
  });

  it("keeps today's rules for real projects", () => {
    expect(
      requestAccessRedirectTarget({
        storedRedirect: '/ui/7/a',
        currentUrl: '/ui/42/b',
        currentPath: '/ui/42/b',
        projectId: '42',
      })
    ).toBe('/ui/42/b');
    expect(
      requestAccessRedirectTarget({
        storedRedirect: null,
        currentUrl: '/',
        currentPath: '/',
        projectId: '42',
      })
    ).toBe('/ui/42/data-marts');
  });
});
