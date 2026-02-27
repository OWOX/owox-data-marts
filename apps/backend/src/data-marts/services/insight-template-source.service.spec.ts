import { Repository } from 'typeorm';
import { InsightTemplateSourceEntity } from '../entities/insight-template-source.entity';
import { InsightTemplateSourceService } from './insight-template-source.service';

describe('InsightTemplateSourceService', () => {
  const createService = () => {
    const repository = {
      findOne: jest.fn(),
    } as unknown as Repository<InsightTemplateSourceEntity>;

    return {
      service: new InsightTemplateSourceService(repository),
      repository,
    };
  };

  it('loads source by id and template id with artifact relation', async () => {
    const { service, repository } = createService();
    const source = {
      id: 'source-1',
      templateId: 'template-1',
      artifactId: 'artifact-1',
    } as InsightTemplateSourceEntity;

    (repository.findOne as jest.Mock).mockResolvedValue(source);

    await expect(service.getByIdAndTemplateId('source-1', 'template-1')).resolves.toBe(source);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        id: 'source-1',
        templateId: 'template-1',
      },
      relations: ['insightArtifact'],
    });
  });
});
