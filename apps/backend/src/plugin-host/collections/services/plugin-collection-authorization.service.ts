import { Inject, Injectable } from '@nestjs/common';
import {
  PLUGIN_ENTITY_AUTHORIZATION_FACADE,
  type PluginEntityAuthorizationFacade,
} from '../../../data-marts/facades/plugin-entity-authorization.facade';
import type { PluginCollectionDeclaration } from '../../utils/plugin-manifest.util';
import type { PluginCollectionRuntimeContext } from '../dto/domain/plugin-collection.types';
import { PluginCollectionAuthorizationDeniedError } from '../errors/plugin-collection.errors';

export type PluginCollectionOperation = 'read' | 'create' | 'update' | 'delete';

@Injectable()
export class PluginCollectionAuthorizationService {
  constructor(
    @Inject(PLUGIN_ENTITY_AUTHORIZATION_FACADE)
    private readonly entityAuthorization: PluginEntityAuthorizationFacade
  ) {}

  async assertAllowed(
    declaration: PluginCollectionDeclaration,
    operation: PluginCollectionOperation,
    parentId: string | null,
    context: PluginCollectionRuntimeContext
  ): Promise<void> {
    if (!declaration.entityBinding) {
      if (parentId !== null) throw new PluginCollectionAuthorizationDeniedError();
      return;
    }
    if (!parentId) throw new PluginCollectionAuthorizationDeniedError();

    const allowed = await this.entityAuthorization.canAccess({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles ?? [],
      entityType: declaration.entityBinding.type,
      entityId: parentId,
      action: declaration.entityBinding.actions[operation],
    });
    if (!allowed) throw new PluginCollectionAuthorizationDeniedError();
  }

  async filterAllowed(
    declaration: PluginCollectionDeclaration,
    parentIds: readonly string[],
    context: PluginCollectionRuntimeContext
  ): Promise<Set<string>> {
    if (!declaration.entityBinding) return new Set(parentIds);
    const uniqueIds = [...new Set(parentIds)];
    const access = await this.entityAuthorization.canAccessMany(
      uniqueIds.map(entityId => ({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles ?? [],
        entityType: declaration.entityBinding!.type,
        entityId,
        action: declaration.entityBinding!.actions.read,
      }))
    );
    return new Set(uniqueIds.filter(id => access.get(id)));
  }
}
