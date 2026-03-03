import { ListInsightTemplateSourcesCommand } from '../dto/domain/list-insight-template-sources.command';
import { ListInsightTemplateSourcesService } from './list-insight-template-sources.service';

describe('ListInsightTemplateSourcesService', () => {
  const createService = () => {
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const insightTemplateSourceService = {
      listByTemplateId: jest.fn(),
    };
    const mapper = {
      toDomainDtoList: jest.fn(),
    };

    return {
      service: new ListInsightTemplateSourcesService(
        insightTemplateService as never,
        insightTemplateSourceService as never,
        mapper as never
      ),
      insightTemplateService,
      insightTemplateSourceService,
      mapper,
    };
  };

  it('returns mapped source list for template', async () => {
    const { service, insightTemplateService, insightTemplateSourceService, mapper } =
      createService();
    const command = new ListInsightTemplateSourcesCommand('template-1', 'data-mart-1', 'project-1');
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({ id: 'template-1' });
    insightTemplateSourceService.listByTemplateId.mockResolvedValue([{ id: 'source-1' }]);
    mapper.toDomainDtoList.mockReturnValue([{ templateSourceId: 'source-1' }]);

    const result = await service.run(command);

    expect(insightTemplateService.getByIdAndDataMartIdAndProjectId).toHaveBeenCalledWith(
      'template-1',
      'data-mart-1',
      'project-1'
    );
    expect(insightTemplateSourceService.listByTemplateId).toHaveBeenCalledWith('template-1');
    expect(mapper.toDomainDtoList).toHaveBeenCalledWith([{ id: 'source-1' }]);
    expect(result).toEqual([{ templateSourceId: 'source-1' }]);
  });
});
