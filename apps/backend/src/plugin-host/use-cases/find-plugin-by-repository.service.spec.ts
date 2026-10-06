import { NotFoundException } from '@nestjs/common';
import { FindPluginByRepositoryCommand } from '../dto/domain/find-plugin-by-repository.command';
import { InvalidRepoLocatorError } from '../errors/plugin-host.errors';
import { PluginService } from '../services/plugin.service';
import { FindPluginByRepositoryService } from './find-plugin-by-repository.service';

describe('FindPluginByRepositoryService', () => {
  const findDeploymentPublishedByRepoName = jest.fn();
  const service = new FindPluginByRepositoryService({
    findDeploymentPublishedByRepoName,
  } as unknown as PluginService);

  beforeEach(() => findDeploymentPublishedByRepoName.mockReset());

  it('returns the plugin id for owner/name', async () => {
    findDeploymentPublishedByRepoName.mockResolvedValue({ id: 'plugin-1' });

    await expect(
      service.run(new FindPluginByRepositoryCommand('OWOX/odm-usage-stat'))
    ).resolves.toEqual({
      pluginId: 'plugin-1',
    });
    expect(findDeploymentPublishedByRepoName).toHaveBeenCalledWith('OWOX', 'odm-usage-stat');
  });

  it('accepts a GitHub URL', async () => {
    findDeploymentPublishedByRepoName.mockResolvedValue({ id: 'plugin-1' });

    await service.run(
      new FindPluginByRepositoryCommand('https://github.com/OWOX/odm-usage-stat.git')
    );

    expect(findDeploymentPublishedByRepoName).toHaveBeenCalledWith('OWOX', 'odm-usage-stat');
  });

  it('answers not found when no public plugin is published to the deployment', async () => {
    findDeploymentPublishedByRepoName.mockResolvedValue(null);

    await expect(
      service.run(new FindPluginByRepositoryCommand('OWOX/private-one'))
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses something that is not a repository', async () => {
    await expect(
      service.run(new FindPluginByRepositoryCommand('not a repo'))
    ).rejects.toBeInstanceOf(InvalidRepoLocatorError);
    expect(findDeploymentPublishedByRepoName).not.toHaveBeenCalled();
  });
});
