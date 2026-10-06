import { Injectable, NotFoundException } from '@nestjs/common';
import { FindPluginByRepositoryCommand } from '../dto/domain/find-plugin-by-repository.command';
import { PluginPublicationService } from '../services/plugin-publication.service';
import { parseGithubRepoLocator } from '../utils/github-repo-locator.util';

@Injectable()
export class FindPluginByRepositoryService {
  constructor(private readonly publications: PluginPublicationService) {}

  async run(command: FindPluginByRepositoryCommand): Promise<{ pluginId: string }> {
    const { owner, name } = parseGithubRepoLocator(command.repository);
    const pluginId = await this.publications.findDeploymentPluginIdByRepo(
      command.context.projectId,
      owner,
      name
    );
    if (!pluginId) {
      throw new NotFoundException('No public plugin is published from this repository');
    }
    return { pluginId };
  }
}
