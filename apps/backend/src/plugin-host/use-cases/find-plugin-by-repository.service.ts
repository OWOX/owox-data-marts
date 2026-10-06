import { Injectable, NotFoundException } from '@nestjs/common';
import { FindPluginByRepositoryCommand } from '../dto/domain/find-plugin-by-repository.command';
import { PluginService } from '../services/plugin.service';
import { parseGithubRepoLocator } from '../utils/github-repo-locator.util';

@Injectable()
export class FindPluginByRepositoryService {
  constructor(private readonly pluginService: PluginService) {}

  async run(command: FindPluginByRepositoryCommand): Promise<{ pluginId: string }> {
    const { owner, name } = parseGithubRepoLocator(command.repository);
    const plugin = await this.pluginService.findDeploymentPublishedByRepoName(owner, name);
    if (!plugin) {
      throw new NotFoundException('No public plugin is published from this repository');
    }
    return { pluginId: plugin.id };
  }
}
