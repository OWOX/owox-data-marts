import { ProjectSettingsFacadeImpl } from './project-settings.facade.impl';
import { ProjectSettingsMapper } from '../mappers/project-settings.mapper';
import type { ProjectSettingsService } from '../services/project-settings.service';
import { GetProjectSettingsService } from '../use-cases/get-project-settings.service';
import { UpdateProjectDescriptionService } from '../use-cases/update-project-description.service';
import { ProjectSettings } from '../entities/project-settings.entity';

describe('ProjectSettingsFacadeImpl', () => {
  const settingsService = { findByProjectId: jest.fn(), saveDescription: jest.fn() };
  const service = settingsService as unknown as ProjectSettingsService;
  const mapper = new ProjectSettingsMapper();
  const facade = new ProjectSettingsFacadeImpl(
    new GetProjectSettingsService(service, mapper),
    new UpdateProjectDescriptionService(service, mapper)
  );
  const projectId = 'project';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns the stored description or null when settings are missing', async () => {
    settingsService.findByProjectId.mockResolvedValueOnce({ description: 'Revenue goals' });
    settingsService.findByProjectId.mockResolvedValueOnce(null);

    await expect(facade.getDescription(projectId)).resolves.toBe('Revenue goals');
    await expect(facade.getDescription(projectId)).resolves.toBeNull();
    expect(settingsService.findByProjectId).toHaveBeenCalledWith('project');
  });

  it('reads settings for the authenticated project without exposing persistence fields', async () => {
    settingsService.findByProjectId.mockResolvedValue({
      projectId: 'project',
      description: 'Revenue goals',
      internalField: 'not exposed',
    });
    await expect(facade.getSettings(projectId)).resolves.toEqual({
      projectId: 'project',
      description: 'Revenue goals',
    });
    expect(settingsService.findByProjectId).toHaveBeenCalledWith('project');
  });

  it('maps missing settings to a null description for the connected project', async () => {
    settingsService.findByProjectId.mockResolvedValue(null);

    await expect(facade.getSettings(projectId)).resolves.toEqual({
      projectId: 'project',
      description: null,
    });
  });

  it('trims the description before saving and returns public settings', async () => {
    settingsService.saveDescription.mockImplementation(
      (projectId: string, description: string | null) =>
        Object.assign(new ProjectSettings(), {
          projectId,
          description,
          internalField: 'not exposed',
        })
    );

    await expect(
      facade.updateDescription(projectId, { description: '  Revenue goals  ' })
    ).resolves.toEqual({ projectId: 'project', description: 'Revenue goals' });
    expect(settingsService.saveDescription).toHaveBeenCalledWith('project', 'Revenue goals');
  });

  it('clears the description with an explicit null', async () => {
    settingsService.saveDescription.mockResolvedValue({ projectId: 'project', description: null });

    await expect(facade.updateDescription(projectId, { description: null })).resolves.toEqual({
      projectId: 'project',
      description: null,
    });
    expect(settingsService.saveDescription).toHaveBeenCalledWith('project', null);
  });

  it('propagates persistence failures', async () => {
    settingsService.saveDescription.mockRejectedValue(new Error('Database unavailable'));

    await expect(facade.updateDescription(projectId, { description: null })).rejects.toThrow(
      'Database unavailable'
    );
  });
});
