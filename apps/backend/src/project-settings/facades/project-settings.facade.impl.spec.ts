import { ForbiddenException } from '@nestjs/common';
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
    service,
    new GetProjectSettingsService(service, mapper),
    new UpdateProjectDescriptionService(service, mapper)
  );
  const ctx = { projectId: 'project', userId: 'actor', roles: ['admin'] };

  beforeEach(() => jest.resetAllMocks());

  it('keeps the existing description read and its missing-settings behavior', async () => {
    settingsService.findByProjectId.mockResolvedValueOnce({ description: 'Revenue goals' });
    settingsService.findByProjectId.mockResolvedValueOnce(null);

    await expect(facade.getDescription('project')).resolves.toBe('Revenue goals');
    await expect(facade.getDescription('project')).resolves.toBeNull();
    expect(settingsService.findByProjectId).toHaveBeenCalledWith('project');
  });

  it.each(['viewer', 'editor', 'admin'])(
    'allows %s to read the current project settings DTO',
    async role => {
      settingsService.findByProjectId.mockResolvedValue({
        projectId: 'project',
        description: 'Revenue goals',
        internalField: 'not exposed',
      });

      await expect(facade.getSettings({ ...ctx, roles: [role] })).resolves.toEqual({
        projectId: 'project',
        description: 'Revenue goals',
      });
      expect(settingsService.findByProjectId).toHaveBeenCalledWith('project');
    }
  );

  it('maps missing settings to a null description for the connected project', async () => {
    settingsService.findByProjectId.mockResolvedValue(null);

    await expect(facade.getSettings(ctx)).resolves.toEqual({
      projectId: 'project',
      description: null,
    });
  });

  it.each([
    { projectId: 'project', userId: 'actor', roles: [] },
    { projectId: 'project', userId: 'actor', roles: ['owner'] },
    { projectId: 'project', userId: '', roles: ['admin'] },
    { projectId: 'project', userId: '  ', roles: ['admin'] },
    { projectId: '', userId: 'actor', roles: ['admin'] },
  ])('blocks a settings read without a recognized role and actor: %p', async deniedCtx => {
    await expect(facade.getSettings(deniedCtx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(settingsService.findByProjectId).not.toHaveBeenCalled();
  });

  it('updates the description through the existing normalization and mapper boundary', async () => {
    settingsService.saveDescription.mockImplementation(
      (projectId: string, description: string | null) =>
        Object.assign(new ProjectSettings(), {
          projectId,
          description,
          internalField: 'not exposed',
        })
    );

    await expect(
      facade.updateDescription(ctx, { description: '  Revenue goals  ' })
    ).resolves.toEqual({ projectId: 'project', description: 'Revenue goals' });
    expect(settingsService.saveDescription).toHaveBeenCalledWith('project', 'Revenue goals');
  });

  it('clears the description with an explicit null', async () => {
    settingsService.saveDescription.mockResolvedValue({ projectId: 'project', description: null });

    await expect(facade.updateDescription(ctx, { description: null })).resolves.toEqual({
      projectId: 'project',
      description: null,
    });
    expect(settingsService.saveDescription).toHaveBeenCalledWith('project', null);
  });

  it.each([
    { projectId: 'project', userId: 'actor', roles: ['viewer'] },
    { projectId: 'project', userId: 'actor', roles: ['editor'] },
    { projectId: 'project', userId: 'actor', roles: [] },
    { projectId: 'project', userId: 'actor', roles: ['owner'] },
    { projectId: 'project', userId: '', roles: ['admin'] },
    { projectId: 'project', userId: '  ', roles: ['admin'] },
    { projectId: '', userId: 'actor', roles: ['admin'] },
  ])('blocks a description mutation without an admin actor: %p', async deniedCtx => {
    await expect(
      facade.updateDescription(deniedCtx, { description: 'Revenue' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(settingsService.saveDescription).not.toHaveBeenCalled();
  });

  it('propagates persistence failures', async () => {
    settingsService.saveDescription.mockRejectedValue(new Error('Database unavailable'));

    await expect(facade.updateDescription(ctx, { description: null })).rejects.toThrow(
      'Database unavailable'
    );
  });
});
