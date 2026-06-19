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
});
