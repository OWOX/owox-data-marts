import { CreateInsightTemplateSourceCommand } from '../dto/domain/create-insight-template-source.command';
import { CreateInsightTemplateSourceService } from './create-insight-template-source.service';

jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

describe('CreateInsightTemplateSourceService', () => {
  const createService = () => {
    const insightArtifactRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const insightTemplateSourceService = {
      existsByKeyAndTemplateId: jest.fn(),
      create: jest.fn(),
    };
    const mapper = {
      toDomainDto: jest.fn(),
    };

    return {
      service: new CreateInsightTemplateSourceService(
        insightArtifactRepository as never,
        insightTemplateService as never,
        insightTemplateSourceService as never,
        mapper as never
      ),
      insightArtifactRepository,
      insightTemplateService,
      insightTemplateSourceService,
      mapper,
    };
  };

  it('creates artifact and source and returns mapped dto', async () => {
    const {
      service,
      insightArtifactRepository,
      insightTemplateService,
      insightTemplateSourceService,
      mapper,
    } = createService();
    const command = new CreateInsightTemplateSourceCommand(
      'template-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'projects_2025',
      'Projects 2025',
      'SELECT 1'
    );
    const template = { id: 'template-1', dataMart: { id: 'data-mart-1' } };
    const artifactEntity = { id: 'artifact-1' };
    const source = { id: 'source-1' };

    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(template);
    insightTemplateSourceService.existsByKeyAndTemplateId.mockResolvedValue(false);
    insightArtifactRepository.create.mockReturnValue(artifactEntity);
    insightArtifactRepository.save.mockResolvedValue(artifactEntity);
    insightTemplateSourceService.create.mockResolvedValue(source);
    mapper.toDomainDto.mockReturnValue({ templateSourceId: 'source-1' });

    const result = await service.run(command);

    expect(insightTemplateService.getByIdAndDataMartIdAndProjectId).toHaveBeenCalledWith(
      'template-1',
      'data-mart-1',
      'project-1'
    );
    expect(insightTemplateSourceService.existsByKeyAndTemplateId).toHaveBeenCalledWith(
      'projects_2025',
      'template-1'
    );
    expect(insightTemplateSourceService.create).toHaveBeenCalled();
    expect(mapper.toDomainDto).toHaveBeenCalledWith(source);
    expect(result).toEqual({ templateSourceId: 'source-1' });
  });

  it('throws when key is main', async () => {
    const { service, insightTemplateService } = createService();
    const command = new CreateInsightTemplateSourceCommand(
      'template-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'main',
      'Projects 2025',
      'SELECT 1'
    );
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'template-1',
      dataMart: { id: 'data-mart-1' },
    });

    await expect(service.run(command)).rejects.toThrow(
      'Source key "main" is reserved for the current data mart source'
    );
  });

  it('throws when key already exists', async () => {
    const { service, insightTemplateService, insightTemplateSourceService } = createService();
    const command = new CreateInsightTemplateSourceCommand(
      'template-1',
      'data-mart-1',
      'project-1',
      'user-1',
      'projects_2025',
      'Projects 2025',
      'SELECT 1'
    );
    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'template-1',
      dataMart: { id: 'data-mart-1' },
    });
    insightTemplateSourceService.existsByKeyAndTemplateId.mockResolvedValue(true);

    await expect(service.run(command)).rejects.toThrow('Source key "projects_2025" must be unique');
  });
});
