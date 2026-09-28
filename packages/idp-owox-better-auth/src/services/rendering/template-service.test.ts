import { describe, expect, it } from '@jest/globals';
import { TemplateService } from './template-service.js';

describe('TemplateService', () => {
  it('renders sign-in template with redirect-to fallback for OAuth continuations', () => {
    const html = TemplateService.renderSignIn({
      providers: {
        email: true,
        google: true,
        microsoft: false,
      },
      errorMessage: undefined,
      infoMessage: undefined,
    });

    expect(html.match(/urlParams\.get\('redirect-to'\)/g)).toHaveLength(2);
    expect(html.match(/urlParams\.get\('app-redirect-to'\)/g)).toHaveLength(2);
  });

  it('always forces a fresh state for the social buttons, stripping any state already in the URL', () => {
    const html = TemplateService.renderSignIn({
      providers: { email: true, google: true, microsoft: true },
      errorMessage: undefined,
      infoMessage: undefined,
    });

    expect(html).toContain('function alwaysGetFreshStateThenRun(');
    expect(html).toContain("params.delete('state');");
    expect(html).toContain(
      "googleButton?.addEventListener('click', () => alwaysGetFreshStateThenRun('google'));"
    );
    expect(html).toContain(
      "microsoftButton?.addEventListener('click', () => alwaysGetFreshStateThenRun('microsoft'));"
    );
    // No iframe mechanism - ODM's own sign-in page always sends
    // frame-ancestors 'none', so it can never be the target of a same-site
    // helper frame.
    expect(html).not.toContain('ensureStateViaHiddenFrame');
    expect(html).not.toContain('<iframe');
  });

  it('renders sign-up template with the same always-fresh button behavior', () => {
    const html = TemplateService.renderSignUp({
      providers: { email: true, google: true, microsoft: true },
      errorMessage: undefined,
      infoMessage: undefined,
    });

    expect(html).toContain('function alwaysGetFreshStateThenRun(');
    expect(html).toContain(
      "googleButton?.addEventListener('click', () => alwaysGetFreshStateThenRun('google'));"
    );
    expect(html).toContain(
      "microsoftButton?.addEventListener('click', () => alwaysGetFreshStateThenRun('microsoft'));"
    );
  });
});
