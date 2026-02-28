import { DeleteInsightTemplateSourceCommand } from '../dto/domain/delete-insight-template-source.command';
import { DeleteInsightTemplateSourceService } from './delete-insight-template-source.service';

describe('DeleteInsightTemplateSourceService', () => {
  const createService = () => {
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const insightTemplateSourceService = {
      getByIdAndTemplateId: jest.fn(),
      hardDeleteByIdAndTemplateId: jest.fn(),
    };
    const insightTemplateValidationService = {
      ensureSourceKeyIsNotUsedInTemplate: jest.fn(),
    };

    return {
      service: new DeleteInsightTemplateSourceService(
        insightTemplateService as never,
        insightTemplateSourceService as never,
        insightTemplateValidationService as never
      ),
      insightTemplateService,
      insightTemplateSourceService,
      insightTemplateValidationService,
    };
  };

  const command = new DeleteInsightTemplateSourceCommand(
    'source-1',
    'template-1',
    'data-mart-1',
    'project-1'
  );

  it('deletes source when it is not used in template', async () => {
    const {
      service,
      insightTemplateService,
      insightTemplateSourceService,
      insightTemplateValidationService,
    } = createService();
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'template-1',
      template: '# Report\n{{table source="main"}}',
    });
    insightTemplateSourceService.getByIdAndTemplateId.mockResolvedValue({
      id: 'source-1',
      key: 'consumption_2025',
    });

    await service.run(command);

    expect(
      insightTemplateValidationService.ensureSourceKeyIsNotUsedInTemplate
    ).toHaveBeenCalledWith('# Report\n{{table source="main"}}', 'consumption_2025');
    expect(insightTemplateSourceService.hardDeleteByIdAndTemplateId).toHaveBeenCalledWith(
      'source-1',
      'template-1'
    );
  });

  it('does not delete source when template usage validation fails', async () => {
    const {
      service,
      insightTemplateService,
      insightTemplateSourceService,
      insightTemplateValidationService,
    } = createService();
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'template-1',
      template: '# Report\n{{table source="consumption_2025"}}',
    });
    insightTemplateSourceService.getByIdAndTemplateId.mockResolvedValue({
      id: 'source-1',
      key: 'consumption_2025',
    });
    insightTemplateValidationService.ensureSourceKeyIsNotUsedInTemplate.mockImplementation(() => {
      throw new Error('Cannot delete source');
    });

    await expect(service.run(command)).rejects.toThrow('Cannot delete source');
    expect(insightTemplateSourceService.hardDeleteByIdAndTemplateId).not.toHaveBeenCalled();
  });
});
