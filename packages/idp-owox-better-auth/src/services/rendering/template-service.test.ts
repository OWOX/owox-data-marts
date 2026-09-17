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

  it('routes the email form through the hidden-iframe state helper, but not the social buttons', () => {
    const html = TemplateService.renderSignIn({
      providers: { email: true, google: true, microsoft: true },
      errorMessage: undefined,
      infoMessage: undefined,
    });

    expect(html).toContain('function ensureStateViaHiddenFrame(');
    expect(html).toContain("ensureStateViaHiddenFrame('email')");
    // Google/Microsoft have nothing to lose from a full-page bounce, so they
    // keep the simpler navigate-and-resume path rather than the iframe one.
    expect(html).not.toContain("ensureStateViaHiddenFrame('google')");
    expect(html).not.toContain("ensureStateViaHiddenFrame('microsoft')");
  });
});
