import { GetTemplateContentTool } from './get-template-content.tool';
import { DEFAULT_INSIGHT_TEMPLATE } from '../../../template/default-insight-template';

describe('GetTemplateContentTool', () => {
  const createContext = () => ({
    request: {
      projectId: 'project-1',
      dataMartId: 'data-mart-1',
      sessionContext: {
        templateId: 'template-1',
      },
    },
  });

  it('returns null template for the default template content', async () => {
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn().mockResolvedValue({
        template: DEFAULT_INSIGHT_TEMPLATE,
      }),
    };
    const templateToPlaceholderTagsConverter = {
      toPlaceholderDocument: jest.fn(),
    };
    const tool = new GetTemplateContentTool(
      insightTemplateService as never,
      templateToPlaceholderTagsConverter as never
    );

    const result = await tool.execute({}, createContext() as never);

    expect(result).toEqual({ template: null });
    expect(templateToPlaceholderTagsConverter.toPlaceholderDocument).not.toHaveBeenCalled();
  });

  it('returns canonical placeholder template for non-default content', async () => {
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn().mockResolvedValue({
        template: '# Report\n\n{{table source="main"}}',
      }),
    };
    const templateToPlaceholderTagsConverter = {
      toPlaceholderDocument: jest.fn().mockReturnValue({
        text: '# Report\n\n[[TAG:t1]]',
        tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
      }),
    };
    const tool = new GetTemplateContentTool(
      insightTemplateService as never,
      templateToPlaceholderTagsConverter as never
    );

    const result = await tool.execute({}, createContext() as never);

    expect(templateToPlaceholderTagsConverter.toPlaceholderDocument).toHaveBeenCalledWith(
      '# Report\n\n{{table source="main"}}'
    );
    expect(result).toEqual({
      template: {
        text: '# Report\n\n[[TAG:t1]]',
        tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
      },
    });
  });
});
