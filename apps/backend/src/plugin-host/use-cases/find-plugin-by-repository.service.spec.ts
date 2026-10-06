import { NotFoundException } from '@nestjs/common';
import { FindPluginByRepositoryCommand } from '../dto/domain/find-plugin-by-repository.command';
import { InvalidRepoLocatorError } from '../errors/plugin-host.errors';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { FindPluginByRepositoryService } from './find-plugin-by-repository.service';

describe('FindPluginByRepositoryService', () => {
  const findDeploymentPluginIdByRepo = jest.fn();
  const service = new FindPluginByRepositoryService({
    findDeploymentPluginIdByRepo,
  } as unknown as PluginPublicationService);
  const context = { projectId: 'project-1', userId: 'user-1' };

  beforeEach(() => findDeploymentPluginIdByRepo.mockReset());

  it("returns the plugin id for owner/name in the caller's project", async () => {
    findDeploymentPluginIdByRepo.mockResolvedValue('plugin-1');

    await expect(
      service.run(new FindPluginByRepositoryCommand('OWOX/odm-usage-stat', context))
    ).resolves.toEqual({
      pluginId: 'plugin-1',
    });
    expect(findDeploymentPluginIdByRepo).toHaveBeenCalledWith(
      'project-1',
      'OWOX',
      'odm-usage-stat'
    );
  });

  it('accepts a GitHub URL', async () => {
    findDeploymentPluginIdByRepo.mockResolvedValue('plugin-1');

    await service.run(
      new FindPluginByRepositoryCommand('https://github.com/OWOX/odm-usage-stat.git', context)
    );

    expect(findDeploymentPluginIdByRepo).toHaveBeenCalledWith(
      'project-1',
      'OWOX',
      'odm-usage-stat'
    );
  });

  it("answers not found when no public plugin is published to the caller's project", async () => {
    findDeploymentPluginIdByRepo.mockResolvedValue(null);

    await expect(
      service.run(new FindPluginByRepositoryCommand('OWOX/private-one', context))
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses something that is not a repository', async () => {
    await expect(
      service.run(new FindPluginByRepositoryCommand('not a repo', context))
    ).rejects.toBeInstanceOf(InvalidRepoLocatorError);
    expect(findDeploymentPluginIdByRepo).not.toHaveBeenCalled();
  });
});
