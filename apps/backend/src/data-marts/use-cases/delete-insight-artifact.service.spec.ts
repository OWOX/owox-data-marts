import { DeleteInsightArtifactCommand } from '../dto/domain/delete-insight-artifact.command';
import { DeleteInsightArtifactService } from './delete-insight-artifact.service';

describe('DeleteInsightArtifactService', () => {
  const command = new DeleteInsightArtifactCommand('artifact-1', 'data-mart-1', 'project-1');

  const createService = () => {
    const insightArtifactService = {
      getByIdAndDataMartIdAndProjectId: jest.fn(),
      ensureNotUsedInTemplateSources: jest.fn(),
      softDelete: jest.fn(),
    };

    const service = new DeleteInsightArtifactService(insightArtifactService as never);

    return {
      service,
      insightArtifactService,
    };
  };

  it('deletes artifact when it is not used in template sources', async () => {
    const { service, insightArtifactService } = createService();

    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'artifact-1',
    });
    insightArtifactService.ensureNotUsedInTemplateSources.mockResolvedValue(undefined);
    insightArtifactService.softDelete.mockResolvedValue(undefined);

    await service.run(command);

    expect(insightArtifactService.getByIdAndDataMartIdAndProjectId).toHaveBeenCalledWith(
      'artifact-1',
      'data-mart-1',
      'project-1'
    );
    expect(insightArtifactService.ensureNotUsedInTemplateSources).toHaveBeenCalledWith(
      'artifact-1',
      'data-mart-1',
      'project-1'
    );
    expect(insightArtifactService.softDelete).toHaveBeenCalledWith('artifact-1');
  });

  it('does not delete artifact when source usage check fails', async () => {
    const { service, insightArtifactService } = createService();

    insightArtifactService.getByIdAndDataMartIdAndProjectId.mockResolvedValue({
      id: 'artifact-1',
    });
    insightArtifactService.ensureNotUsedInTemplateSources.mockRejectedValue(
      new Error('Artifact is in use')
    );

    await expect(service.run(command)).rejects.toThrow('Artifact is in use');
    expect(insightArtifactService.softDelete).not.toHaveBeenCalled();
  });
});
