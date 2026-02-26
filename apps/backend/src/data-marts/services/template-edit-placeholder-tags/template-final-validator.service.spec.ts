import { TemplateFinalValidator } from './template-final-validator.service';

describe('TemplateFinalValidator', () => {
  let service: TemplateFinalValidator;

  beforeEach(() => {
    service = new TemplateFinalValidator();
  });

  it('accepts valid rendered template with supported tags', () => {
    const result = service.validate(
      '# Report\n\n{{table source="main"}}\n\nCredits: {{value source="main" path=".credits[1]"}}'
    );

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('rejects unresolved placeholders', () => {
    const result = service.validate('# Report\n\n[[TAG:t1]]');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_render_invalid');
    }
  });

  it('rejects unsupported rendered tags', () => {
    const result = service.validate('# Report\n\n{{chart source="main"}}');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_render_invalid');
      expect(result.error.message).toContain('unsupported tag "chart"');
    }
  });

  it('rejects malformed template syntax', () => {
    const result = service.validate('# Report\n\n{{table source="main"');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_render_invalid');
    }
  });
});
