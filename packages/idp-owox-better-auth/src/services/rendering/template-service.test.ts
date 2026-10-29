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
    expect(html).toContain('form.action = `/auth/sign-in/social-intent?${params.toString()}`;');
    expect(html).toContain("form.method = 'POST';");
    expect(html).toContain('nonce = await requestSocialIntentNonce();');
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
    expect(html).toContain('form.action = `/auth/sign-up/social-intent?${params.toString()}`;');
    expect(html).toContain('nonce = await requestSocialIntentNonce();');
    expect(html).toContain(
      "googleButton?.addEventListener('click', () => alwaysGetFreshStateThenRun('google'));"
    );
    expect(html).toContain(
      "microsoftButton?.addEventListener('click', () => alwaysGetFreshStateThenRun('microsoft'));"
    );
  });

  it('shows the account linking notice once, under the options, on the sign-in and sign-up pages', () => {
    const data = {
      providers: { email: true, google: true, microsoft: true },
      errorMessage: undefined,
      infoMessage: undefined,
    };
    for (const html of [TemplateService.renderSignIn(data), TemplateService.renderSignUp(data)]) {
      expect(html.match(/we link them to your account/g)).toHaveLength(1);
      expect(html).toContain('https://www.owox.com/policies/control-your-data');
      expect(html).toContain(
        'https://www.owox.com/policies/privacy#9-cookies-or-other-tracking-technologies'
      );
      expect(html).not.toContain('acknowledge our');
      expect(html.indexOf('we link them to your account')).toBeGreaterThan(
        html.indexOf('Continue with Google')
      );
    }
  });

  it('keeps the short line on the other auth pages', () => {
    const html = TemplateService.renderMagicLinkConfirm({
      intent: 'signup',
      token: 'token',
      callbackURL: '/',
    });

    expect(html).toContain('acknowledge our');
    expect(html).not.toContain('we link them to your account');
  });
});
