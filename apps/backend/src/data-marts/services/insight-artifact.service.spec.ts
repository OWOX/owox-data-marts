import { Repository } from 'typeorm';
import { InsightArtifact } from '../entities/insight-artifact.entity';
import { InsightTemplateSourceEntity } from '../entities/insight-template-source.entity';
import { InsightArtifactRepository } from '../repositories/insight-artifact.repository';
import { InsightArtifactService } from './insight-artifact.service';

describe('InsightArtifactService', () => {
  const createService = () => {
    const repository = {
      findOne: jest.fn(),
      find: jest.fn(),
      softDelete: jest.fn(),
      update: jest.fn(),
    } as unknown as Repository<InsightArtifact>;
    const insightTemplateSourceRepository = {
      findOne: jest.fn(),
    } as unknown as Repository<InsightTemplateSourceEntity>;
    const insightArtifactRepository = {
      listByDataMartIdAndProjectIdExcludingArtifactIds: jest.fn(),
    } as unknown as InsightArtifactRepository;

    return {
      service: new InsightArtifactService(
        repository,
        insightTemplateSourceRepository,
        insightArtifactRepository
      ),
      repository,
    };
  };

  it('returns empty array for listByIdsAndDataMartIdAndProjectId when ids are empty', async () => {
    const { service, repository } = createService();

    await expect(
      service.listByIdsAndDataMartIdAndProjectId({
        artifactIds: [],
        dataMartId: 'data-mart-1',
        projectId: 'project-1',
      })
    ).resolves.toEqual([]);

    expect(repository.find).not.toHaveBeenCalled();
  });

  it('loads artifacts by ids within data mart and project scope', async () => {
    const { service, repository } = createService();
    const artifacts = [{ id: 'artifact-1' }, { id: 'artifact-2' }] as InsightArtifact[];

    (repository.find as jest.Mock).mockResolvedValue(artifacts);

    const result = await service.listByIdsAndDataMartIdAndProjectId({
      artifactIds: ['artifact-1', 'artifact-2'],
      dataMartId: 'data-mart-1',
      projectId: 'project-1',
    });

    expect(result).toBe(artifacts);
    expect(repository.find).toHaveBeenCalledTimes(1);

    const [params] = (repository.find as jest.Mock).mock.calls[0];
    expect(params.relations).toEqual(['dataMart']);
    expect(params.where.dataMart).toEqual({
      id: 'data-mart-1',
      projectId: 'project-1',
    });
    expect(params.where.id.value).toEqual(['artifact-1', 'artifact-2']);
  });
});
