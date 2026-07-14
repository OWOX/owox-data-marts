import type { Repository } from 'typeorm';
import { ProjectSettings } from '../entities/project-settings.entity';
import { ProjectSettingsService } from './project-settings.service';

describe('ProjectSettingsService', () => {
  const repository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<Repository<ProjectSettings>>;

  const service = new ProjectSettingsService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('finds settings only by the requested project id', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findByProjectId('project-1')).resolves.toBeNull();

    expect(repository.findOne).toHaveBeenCalledWith({ where: { projectId: 'project-1' } });
  });

  it('creates project settings when saving the first description', async () => {
    const created = { projectId: 'project-1', description: null } as ProjectSettings;
    repository.findOne.mockResolvedValue(null);
    repository.create.mockReturnValue(created);
    repository.save.mockImplementation(async entity => entity as ProjectSettings);

    await expect(service.saveDescription('project-1', 'Revenue is net revenue')).resolves.toEqual({
      projectId: 'project-1',
      description: 'Revenue is net revenue',
    });

    expect(repository.create).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(repository.save).toHaveBeenCalledWith(created);
  });

  it('updates the existing project settings and supports clearing the description', async () => {
    const existing = {
      projectId: 'project-1',
      description: 'Old description',
    } as ProjectSettings;
    repository.findOne.mockResolvedValue(existing);
    repository.save.mockImplementation(async entity => entity as ProjectSettings);

    await expect(service.saveDescription('project-1', null)).resolves.toEqual({
      projectId: 'project-1',
      description: null,
    });

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(existing);
  });
});
