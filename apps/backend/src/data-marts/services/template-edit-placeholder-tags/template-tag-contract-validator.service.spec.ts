import { TemplateEditPlaceholderTag } from './template-edit-placeholder-tags.contracts';
import { TemplateTagContractValidator } from './template-tag-contract-validator.service';

describe('TemplateTagContractValidator', () => {
  let service: TemplateTagContractValidator;

  beforeEach(() => {
    service = new TemplateTagContractValidator();
  });

  it('accepts valid table and value tags', () => {
    const tags: TemplateEditPlaceholderTag[] = [
      {
        id: 't1',
        name: 'table',
        params: { source: 'main', limit: 10, from: 'start' },
      },
      {
        id: 't2',
        name: 'value',
        params: { source: 'consumption_2025', path: '.credits[1]' },
      },
    ];

    const result = service.validateAll(tags, {
      availableSourceKeys: ['consumption_2025'],
    });

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('rejects unsupported tag name', () => {
    const result = service.validateAll([
      {
        id: 't1',
        name: 'chart',
        params: { source: 'main' },
      } as TemplateEditPlaceholderTag,
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_tag_unsupported_name');
    }
  });

  it('rejects invalid params schema', () => {
    const result = service.validateAll([
      {
        id: 't1',
        name: 'value',
        params: { source: 'main', path: '.credits[1]', row: 1 },
      },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_tag_invalid_params');
    }
  });

  it('rejects invalid source format', () => {
    const result = service.validateAll([
      {
        id: 't1',
        name: 'table',
        params: { source: 'bad key' },
      },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_tag_invalid_source');
    }
  });

  it('rejects unavailable source when source list is provided', () => {
    const result = service.validateAll(
      [
        {
          id: 't1',
          name: 'table',
          params: { source: 'consumption_2025' },
        },
      ],
      { availableSourceKeys: ['another_source'] }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_tag_invalid_source');
    }
  });

  it('rejects params when source and sourceKey mismatch', () => {
    const result = service.validateAll([
      {
        id: 't1',
        name: 'table',
        params: { source: 'main', sourceKey: 'other' },
      },
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_tag_invalid_params');
    }
  });
});
