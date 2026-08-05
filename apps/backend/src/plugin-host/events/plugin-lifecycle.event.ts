import { BaseEvent } from '@owox/internal-helpers';
import { PluginAuditAction } from '../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../enums/plugin-publication-scope.enum';

export interface PluginLifecycleEventPayload {
  pluginId: string;
  action: PluginAuditAction;
  authorityScope: PluginPublicationScope;
  projectId: string | null;
  userId: string | null;
  apiKeyId: string | null;
}

/**
 * Integration hook for a security-significant plugin action.
 *
 * The durable record is the plugin_audit_event row; this event is the outbound
 * notification, and it deliberately carries no before/after state -- the external bus
 * is an integration channel, not an audit store.
 */
export class PluginLifecycleEvent extends BaseEvent<PluginLifecycleEventPayload> {
  get name() {
    return 'plugin.lifecycle' as const;
  }

  constructor(payload: PluginLifecycleEventPayload) {
    super(payload);
  }
}
