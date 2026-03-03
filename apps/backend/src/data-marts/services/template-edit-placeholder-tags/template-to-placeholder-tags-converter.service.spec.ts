import { TemplateToPlaceholderTagsConverterService } from './template-to-placeholder-tags-converter.service';

describe('TemplateToPlaceholderTagsConverterService', () => {
  let service: TemplateToPlaceholderTagsConverterService;

  beforeEach(() => {
    service = new TemplateToPlaceholderTagsConverterService();
  });

  it('converts supported raw template tags to placeholders + tags[]', () => {
    const result = service.toPlaceholderDocument(
      '# Report\n\n{{table source="main"}}\n\nTotal: {{value source="consumption_2025" path=".credits[1]"}}'
    );

    expect(result).toEqual({
      text: '# Report\n\n[[TAG:t1]]\n\nTotal: [[TAG:t2]]',
      tags: [
        { id: 't1', name: 'table', params: { source: 'main' } },
        {
          id: 't2',
          name: 'value',
          params: { source: 'consumption_2025', path: '.credits[1]' },
        },
      ],
    });
  });

  it('preserves non-tag text when no supported template tags are present', () => {
    const result = service.toPlaceholderDocument('# Report\n\nNo tags yet');

    expect(result).toEqual({
      text: '# Report\n\nNo tags yet',
      tags: [],
    });
  });

  it('converts repeated tag occurrences into separate placeholders', () => {
    const result = service.toPlaceholderDocument(
      'A {{value source="main" column="credits"}} B {{value source="main" column="credits"}}'
    );

    expect(result).toEqual({
      text: 'A [[TAG:t1]] B [[TAG:t2]]',
      tags: [
        { id: 't1', name: 'value', params: { source: 'main', column: 'credits' } },
        { id: 't2', name: 'value', params: { source: 'main', column: 'credits' } },
      ],
    });
  });
});
