import { TemplatePlaceholderValidator } from './template-placeholder-validator.service';
import { TemplateTagContractValidator } from './template-tag-contract-validator.service';
import { TemplateTagRenderer } from './template-tag-renderer.service';
import { TemplateTemplateAssembler } from './template-template-assembler.service';
import { TemplateFinalValidator } from './template-final-validator.service';
import { TemplatePlaceholderTagsRendererService } from './template-placeholder-tags-renderer.service';

describe('TemplatePlaceholderTagsRendererService', () => {
  let service: TemplatePlaceholderTagsRendererService;

  beforeEach(() => {
    service = new TemplatePlaceholderTagsRendererService(
      new TemplatePlaceholderValidator(),
      new TemplateTagContractValidator(),
      new TemplateTagRenderer(),
      new TemplateTemplateAssembler(),
      new TemplateFinalValidator()
    );
  });

  it('renders deterministic final template from text + tags[]', () => {
    const result = service.render({
      text: '# Report\n\n## Result\n[[TAG:t1]]\n\nCredits: [[TAG:t2]]',
      tags: [
        {
          id: 't1',
          name: 'table',
          params: { source: 'main' },
        },
        {
          id: 't2',
          name: 'value',
          params: { source: 'consumption_2025', path: '.credits[1]' },
        },
      ],
      tagValidationOptions: {
        availableSourceKeys: ['consumption_2025'],
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        renderedTagsById: {
          t1: '{{table source="main"}}',
          t2: '{{value source="consumption_2025" path=".credits[1]"}}',
        },
        template:
          '# Report\n\n## Result\n{{table source="main"}}\n\nCredits: {{value source="consumption_2025" path=".credits[1]"}}',
      },
    });
  });

  it('allows mixed raw template tags and placeholder tags', () => {
    const result = service.render({
      text: '# Report\n{{table source="main"}}\nTotal: [[TAG:t1]]',
      tags: [{ id: 't1', name: 'value', params: { source: 'main' } }],
      tagValidationOptions: {
        allowMainSource: true,
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        renderedTagsById: {
          t1: '{{value source="main"}}',
        },
        template: '# Report\n{{table source="main"}}\nTotal: {{value source="main"}}',
      },
    });
  });
});
