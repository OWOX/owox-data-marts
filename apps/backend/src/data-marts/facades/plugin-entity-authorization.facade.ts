export const PLUGIN_ENTITY_AUTHORIZATION_FACADE = Symbol('PLUGIN_ENTITY_AUTHORIZATION_FACADE');

export type PluginCollectionEntityType = 'data-mart' | 'storage' | 'destination' | 'report';
export type PluginCollectionEntityAction =
  | 'SEE'
  | 'USE'
  | 'EDIT'
  | 'DELETE'
  | 'CONFIGURE_SHARING'
  | 'MANAGE_OWNERS'
  | 'MANAGE_TRIGGERS'
  | 'COPY_CREDENTIALS'
  | 'RUN';

export interface PluginEntityAuthorizationRequest {
  readonly projectId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly entityType: PluginCollectionEntityType;
  readonly entityId: string;
  readonly action: PluginCollectionEntityAction;
}

export interface PluginEntityAuthorizationFacade {
  canAccess(request: PluginEntityAuthorizationRequest): Promise<boolean>;
  canAccessMany(
    requests: readonly PluginEntityAuthorizationRequest[]
  ): Promise<Map<string, boolean>>;
}
