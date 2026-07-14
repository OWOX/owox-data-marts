import { UpdateProjectDescriptionCommand } from '../dto/domain/update-project-description.command';
import { ProjectSettingsMapper } from '../mappers/project-settings.mapper';
import type { ProjectSettingsService } from '../services/project-settings.service';
import { UpdateProjectDescriptionService } from './update-project-description.service';

describe('UpdateProjectDescriptionService', () => {
  const projectSettingsService = {
    saveDescription: jest.fn(),
  } as unknown as jest.Mocked<ProjectSettingsService>;
  const service = new UpdateProjectDescriptionService(
    projectSettingsService,
    new ProjectSettingsMapper()
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('trims and saves a project description', async () => {
    projectSettingsService.saveDescription.mockResolvedValue({
      projectId: 'project-1',
      description: 'Revenue means net revenue',
    } as never);

    await expect(
      service.run(new UpdateProjectDescriptionCommand('project-1', '  Revenue means net revenue  '))
    ).resolves.toEqual({
      projectId: 'project-1',
      description: 'Revenue means net revenue',
    });

    expect(projectSettingsService.saveDescription).toHaveBeenCalledWith(
      'project-1',
      'Revenue means net revenue'
    );
  });

  it('normalizes an empty description to null', async () => {
    projectSettingsService.saveDescription.mockResolvedValue({
      projectId: 'project-1',
      description: null,
    } as never);

    await service.run(new UpdateProjectDescriptionCommand('project-1', '   '));

    expect(projectSettingsService.saveDescription).toHaveBeenCalledWith('project-1', null);
  });
});
