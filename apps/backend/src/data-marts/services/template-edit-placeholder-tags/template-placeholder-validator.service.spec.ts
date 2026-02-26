import { TemplatePlaceholderValidator } from './template-placeholder-validator.service';

describe('TemplatePlaceholderValidator', () => {
  let service: TemplatePlaceholderValidator;

  beforeEach(() => {
    service = new TemplatePlaceholderValidator();
  });

  it('validates placeholders and tag consistency', () => {
    const result = service.validate({
      text: '# Report\n\n[[TAG:t1]]\n\nCredits: [[TAG:t2]]\nAgain: [[TAG:t2]]',
      tags: [{ id: 't1' }, { id: 't2' }],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        placeholderIdsInOrder: ['t1', 't2', 't2'],
        placeholderIdsUnique: ['t1', 't2'],
      },
    });
  });

  it('allows raw template tag syntax in text', () => {
    const result = service.validate({
      text: '## Result\n{{table source="main"}}',
      tags: [],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        placeholderIdsInOrder: [],
        placeholderIdsUnique: [],
      },
    });
  });

  it('rejects malformed placeholder syntax', () => {
    const result = service.validate({
      text: '## Result\n[[TAG:bad id]]',
      tags: [{ id: 't1' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_placeholder_invalid_format');
    }
  });

  it('rejects placeholder without matching tag definition', () => {
    const result = service.validate({
      text: '[[TAG:t_missing]]',
      tags: [{ id: 't1' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_placeholder_unknown_id');
    }
  });

  it('rejects unused tag definition', () => {
    const result = service.validate({
      text: '[[TAG:t1]]',
      tags: [{ id: 't1' }, { id: 'unused' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_tag_unused_definition');
    }
  });

  it('rejects duplicate tag ids', () => {
    const result = service.validate({
      text: '[[TAG:t1]]',
      tags: [{ id: 't1' }, { id: 't1' }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_tag_duplicate_id');
    }
  });
});
