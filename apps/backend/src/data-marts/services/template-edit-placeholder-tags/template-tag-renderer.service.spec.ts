import { TemplateTagRenderer } from './template-tag-renderer.service';

describe('TemplateTagRenderer', () => {
  let service: TemplateTagRenderer;

  beforeEach(() => {
    service = new TemplateTagRenderer();
  });

  it('renders table tag in canonical attribute order', () => {
    const result = service.renderTag({
      id: 't1',
      name: 'table',
      params: {
        sourceKey: 'main',
        columns: 'date,credits',
        limit: 25,
        from: 'end',
      },
    });

    expect(result).toEqual({
      ok: true,
      value: '{{table source="main" columns="date,credits" limit="25" from="end"}}',
    });
  });

  it('renders value tag with path and canonical source', () => {
    const result = service.renderTag({
      id: 't1',
      name: 'value',
      params: {
        sourceKey: 'consumption_2025',
        path: '.credits[1]',
        row: 2,
      },
    });

    expect(result).toEqual({
      ok: true,
      value: '{{value source="consumption_2025" path=".credits[1]"}}',
    });
  });

  it('renders value tag with column/row when path is absent', () => {
    const result = service.renderTag({
      id: 't1',
      name: 'value',
      params: {
        source: 'main',
        column: 'credits',
        row: 1,
      },
    });

    expect(result).toEqual({
      ok: true,
      value: '{{value source="main" column="credits" row="1"}}',
    });
  });

  it('escapes quotes and backslashes in attribute values', () => {
    const result = service.renderTag({
      id: 't1',
      name: 'value',
      params: {
        source: 'main',
        path: '.foo\\"bar',
      },
    });

    expect(result).toEqual({
      ok: true,
      value: '{{value source="main" path=".foo\\\\\\"bar"}}',
    });
  });

  it('rejects unsupported tag name', () => {
    const result = service.renderTag({
      id: 't1',
      name: 'chart',
      params: { source: 'main' },
    } as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('template_tag_unsupported_name');
    }
  });
});
