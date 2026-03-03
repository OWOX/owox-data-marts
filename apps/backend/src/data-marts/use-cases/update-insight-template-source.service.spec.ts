import { InsightArtifactValidationStatus } from '../enums/insight-artifact-validation-status.enum';
import { UpdateInsightTemplateSourceCommand } from '../dto/domain/update-insight-template-source.command';
import { UpdateInsightTemplateSourceService } from './update-insight-template-source.service';

jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

describe('UpdateInsightTemplateSourceService', () => {
  const createService = () => {
    const insightArtifactRepository = {
      save: jest.fn(),
    };
    const insightTemplateService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const insightTemplateSourceService = {
      getByIdAndTemplateId: jest.fn(),
    };
    const insightArtifactService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
    };
    const mapper = {
      toDomainDto: jest.fn(),
    };

    return {
      service: new UpdateInsightTemplateSourceService(
        insightArtifactRepository as never,
        insightTemplateService as never,
        insightTemplateSourceService as never,
        insightArtifactService as never,
        mapper as never
      ),
      insightArtifactRepository,
      insightTemplateService,
      insightTemplateSourceService,
      insightArtifactService,
      mapper,
    };
  };

  it('updates linked artifact and returns mapped dto', async () => {
    const {
      service,
      insightArtifactRepository,
      insightTemplateService,
      insightTemplateSourceService,
      insightArtifactService,
      mapper,
    } = createService();
    const command = new UpdateInsightTemplateSourceCommand(
      'source-1',
      'template-1',
      'data-mart-1',
      'project-1',
      'Projects 2025 (updated)',
      'SELECT 2'
    );
    const source = { id: 'source-1', artifactId: 'artifact-1' };
    const artifact = {
      id: 'artifact-1',
      title: 'old',
      sql: 'SELECT 1',
      validationStatus: InsightArtifactValidationStatus.ERROR,
      validationError: 'failed',
    };
    const savedArtifact = {
      ...artifact,
      title: 'Projects 2025 (updated)',
      sql: 'SELECT 2',
      validationStatus: InsightArtifactValidationStatus.VALID,
      validationError: null,
    };

    insightTemplateService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({ id: 'template-1' });
    insightTemplateSourceService.getByIdAndTemplateId.mockResolvedValue(source);
    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue(artifact);
    insightArtifactRepository.save.mockResolvedValue(savedArtifact);
    mapper.toDomainDto.mockReturnValue({ templateSourceId: 'source-1' });

    const result = await service.run(command);

    expect(insightTemplateSourceService.getByIdAndTemplateId).toHaveBeenCalledWith(
      'source-1',
      'template-1'
    );
    expect(insightArtifactService.getByIdAndDataMartIdAndProjectId).toHaveBeenCalledWith(
      'artifact-1',
      'data-mart-1',
      'project-1'
    );
    expect(insightArtifactRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Projects 2025 (updated)',
        sql: 'SELECT 2',
        validationStatus: InsightArtifactValidationStatus.VALID,
        validationError: null,
      })
    );
    expect(result).toEqual({ templateSourceId: 'source-1' });
  });
});
