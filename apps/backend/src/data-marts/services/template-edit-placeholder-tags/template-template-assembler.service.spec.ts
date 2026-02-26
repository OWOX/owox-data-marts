import { TemplateTemplateAssembler } from './template-template-assembler.service';

describe('TemplateTemplateAssembler', () => {
  let service: TemplateTemplateAssembler;

  beforeEach(() => {
    service = new TemplateTemplateAssembler();
  });

  it('replaces placeholders using Handlebars with rendered tags', () => {
    const result = service.assemble({
      text: '# Report\n\n[[TAG:t1]]\n\nCredits: [[TAG:t2]]',
      renderedTagsById: {
        t1: '{{table source="main"}}',
        t2: '{{value source="main" path=".credits[1]"}}',
      },
    });

    expect(result).toEqual({
      ok: true,
      value:
        '# Report\n\n{{table source="main"}}\n\nCredits: {{value source="main" path=".credits[1]"}}',
    });
  });

  it('supports repeated placeholders', () => {
    const result = service.assemble({
      text: 'A [[TAG:t1]] B [[TAG:t1]]',
      renderedTagsById: {
        t1: '{{table source="main"}}',
      },
    });

    expect(result).toEqual({
      ok: true,
      value: 'A {{table source="main"}} B {{table source="main"}}',
    });
  });
});
