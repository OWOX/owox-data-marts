import { ConflictException } from '@nestjs/common';
import { TemplateFullReplaceApplyService } from './template-full-replace-apply.service';

describe('TemplateFullReplaceApplyService', () => {
  const createTemplate = (patch: Record<string, unknown> = {}) => ({
    id: 'template-1',
    template: '## Report\n{{table source="main"}}',
    sources: [{ key: 'consumption_2025' }],
    ...patch,
  });

  const createService = () => {
    const templateRepository = {
      update: jest.fn(),
    };
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const insightTemplateValidationService = {
      validateTemplateText: jest.fn(),
    };
    const placeholderTagsRenderer = {
      render: jest.fn(),
    };

    const service = new TemplateFullReplaceApplyService(
      templateRepository as never,
      insightTemplateService as never,
      insightTemplateValidationService as never,
      placeholderTagsRenderer as never
    );

    return {
      service,
      templateRepository,
      insightTemplateService,
      insightTemplateValidationService,
      placeholderTagsRenderer,
    };
  };

  it('applies deterministic full replace', async () => {
    const {
      service,
      templateRepository,
      insightTemplateService,
      insightTemplateValidationService,
      placeholderTagsRenderer,
    } = createService();
    const template = createTemplate();
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(template);
    placeholderTagsRenderer.render.mockReturnValue({
      ok: true,
      value: {
        template: '# Report\n\n{{table source="main"}}',
        renderedTagsById: { t1: '{{table source="main"}}' },
      },
    });
    templateRepository.update.mockResolvedValue({ affected: 1 });

    const result = await service.apply({
      templateId: 'template-1',
      dataMartId: 'dm-1',
      projectId: 'prj-1',
      text: '# Report\n\n[[TAG:t1]]',
      tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
    });

    expect(placeholderTagsRenderer.render).toHaveBeenCalledWith({
      text: '# Report\n\n[[TAG:t1]]',
      tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
      tagValidationOptions: {
        availableSourceKeys: ['consumption_2025'],
        allowMainSource: true,
      },
    });
    expect(insightTemplateValidationService.validateTemplateText).toHaveBeenCalledWith(
      '# Report\n\n{{table source="main"}}'
    );
    expect(templateRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'template-1',
        template: '## Report\n{{table source="main"}}',
      }),
      {
        template: '# Report\n\n{{table source="main"}}',
      }
    );
    expect(result.status).toBe('updated');
    expect(result.templateUpdated).toBe(true);
    expect(result.reason).toBe('replace_template_document');
  });

  it('returns validation_failed when placeholder/tag renderer validation fails', async () => {
    const { service, insightTemplateService, placeholderTagsRenderer, templateRepository } =
      createService();
    const template = createTemplate();
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(template);
    placeholderTagsRenderer.render.mockReturnValue({
      ok: false,
      error: {
        code: 'template_placeholder_unknown_id',
        message: 'Missing tag definition',
      },
    });

    const result = await service.apply({
      templateId: 'template-1',
      dataMartId: 'dm-1',
      projectId: 'prj-1',
      text: '[[TAG:t1]]',
      tags: [],
    });

    expect(result).toEqual(
      expect.objectContaining({
        templateUpdated: false,
        status: 'validation_failed',
        reason: 'template_placeholder_unknown_id: Missing tag definition',
      })
    );
    expect(templateRepository.update).not.toHaveBeenCalled();
  });

  it('returns no_op when compiled template is unchanged', async () => {
    const { service, insightTemplateService, placeholderTagsRenderer, templateRepository } =
      createService();
    const template = createTemplate({ template: '# Report\n\n{{table source="main"}}' });
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(template);
    placeholderTagsRenderer.render.mockReturnValue({
      ok: true,
      value: {
        template: '# Report\n\n{{table source="main"}}',
        renderedTagsById: { t1: '{{table source="main"}}' },
      },
    });

    const result = await service.apply({
      templateId: 'template-1',
      dataMartId: 'dm-1',
      projectId: 'prj-1',
      text: '# Report\n\n[[TAG:t1]]',
      tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
    });

    expect(result.status).toBe('no_op');
    expect(result.reason).toBe('template_full_replace_no_changes');
    expect(templateRepository.update).not.toHaveBeenCalled();
  });

  it('throws hard fail if conditional full replace update loses optimistic race', async () => {
    const { service, insightTemplateService, placeholderTagsRenderer, templateRepository } =
      createService();
    const template = createTemplate();
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(template);
    placeholderTagsRenderer.render.mockReturnValue({
      ok: true,
      value: {
        template: '# Report\n\n{{table source="main"}}',
        renderedTagsById: { t1: '{{table source="main"}}' },
      },
    });
    templateRepository.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.apply({
        templateId: 'template-1',
        dataMartId: 'dm-1',
        projectId: 'prj-1',
        text: '# Report\n\n[[TAG:t1]]',
        tags: [{ id: 't1', name: 'table', params: { source: 'main' } }],
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
