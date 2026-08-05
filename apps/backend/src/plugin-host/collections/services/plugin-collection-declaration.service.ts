import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PluginService } from '../../services/plugin.service';
import { PluginVersionService } from '../../services/plugin-version.service';
import type {
  PluginCollectionRuntimeContext,
  ResolvedPluginCollection,
} from '../dto/domain/plugin-collection.types';
import { PluginCollectionNotFoundError } from '../errors/plugin-collection.errors';

@Injectable()
export class PluginCollectionDeclarationService {
  constructor(
    private readonly plugins: PluginService,
    private readonly versions: PluginVersionService
  ) {}

  async resolve(
    collectionName: string,
    context: PluginCollectionRuntimeContext
  ): Promise<ResolvedPluginCollection> {
    const plugin = await this.plugins.findById(context.pluginId);
    if (!plugin?.currentVersionId) throw new PluginCollectionNotFoundError();

    const version = await this.versions.findById(plugin.currentVersionId);
    const declaration = (version?.collections ?? []).find(item => item.name === collectionName);
    if (!declaration) throw new PluginCollectionNotFoundError();

    const memberId = declaration.scope === 'member' ? context.userId : null;
    const namespaceKey = createHash('sha256')
      .update(
        JSON.stringify([
          context.pluginId,
          context.projectId,
          declaration.scope,
          memberId,
          collectionName,
        ])
      )
      .digest('hex');
    return { declaration, namespaceKey, memberId };
  }
}
