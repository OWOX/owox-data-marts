import { TemplateToPlaceholderTagsConverterService } from './template-edit-placeholder-tags/template-to-placeholder-tags-converter.service';
import { InsightTemplateSourceUsageService } from './insight-template-source-usage.service';

describe('InsightTemplateSourceUsageService', () => {
  it('treats {{table}} as usage of main source', () => {
    const service = new InsightTemplateSourceUsageService(
      new TemplateToPlaceholderTagsConverterService()
    );

    expect(service.getUsedSourceKeys('{{table}}')).toEqual(['main']);
  });

  it('extracts explicit source from {{table source="secondary"}}', () => {
    const service = new InsightTemplateSourceUsageService(
      new TemplateToPlaceholderTagsConverterService()
    );

    expect(service.getUsedSourceKeys('{{table source="secondary"}}')).toEqual(['secondary']);
  });

  it('extracts main and secondary sources from value tags', () => {
    const service = new InsightTemplateSourceUsageService(
      new TemplateToPlaceholderTagsConverterService()
    );

    expect(
      service.getUsedSourceKeys(`
        {{value path=".credits"}}
        {{value source="secondary" path=".revenue"}}
      `)
    ).toEqual(['main', 'secondary']);
  });

  it('uses converter output and returns unique source keys in first-occurrence order', () => {
    const converter = {
      toPlaceholderDocument: jest.fn().mockReturnValue({
        text: 'ignored',
        tags: [
          { id: 't1', name: 'table', params: {} },
          { id: 't2', name: 'value', params: { source: 'secondary' } },
          { id: 't3', name: 'value', params: { sourceKey: 'artifact_source' } },
          { id: 't4', name: 'table', params: { source: 'secondary' } },
        ],
      }),
    };
    const service = new InsightTemplateSourceUsageService(
      converter as never as TemplateToPlaceholderTagsConverterService
    );

    expect(service.getUsedSourceKeys('template text')).toEqual([
      'main',
      'secondary',
      'artifact_source',
    ]);
    expect(converter.toPlaceholderDocument).toHaveBeenCalledWith('template text');
  });

  it('extracts source keys from supported raw template tags', () => {
    const service = new InsightTemplateSourceUsageService(
      new TemplateToPlaceholderTagsConverterService()
    );

    expect(
      service.getUsedSourceKeys(`
        # Report
        {{prompt}}
        {{table}}
        {{value source="secondary" path=".credits"}}
        {{table sourceKey="artifact_source"}}
        {{value}}
      `)
    ).toEqual(['main', 'secondary', 'artifact_source']);
  });

  it('returns empty array for empty template', () => {
    const service = new InsightTemplateSourceUsageService(
      new TemplateToPlaceholderTagsConverterService()
    );

    expect(service.getUsedSourceKeys('')).toEqual([]);
    expect(service.getUsedSourceKeys('   ')).toEqual([]);
    expect(service.getUsedSourceKeys(null)).toEqual([]);
  });

  it('ignores tags with invalid explicit source values without failing analysis', () => {
    const service = new InsightTemplateSourceUsageService(
      new TemplateToPlaceholderTagsConverterService()
    );

    expect(
      service.getUsedSourceKeys(`
        {{table source=123}}
        {{value source=true path=".credits"}}
        {{table source=""}}
        {{value}}
      `)
    ).toEqual(['main']);
  });
});
