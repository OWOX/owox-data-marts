import { PluginAuditAction } from '../../enums/plugin-audit-action.enum';
import { PluginPublicationScope } from '../../enums/plugin-publication-scope.enum';

export type PluginHistoryAction = Exclude<PluginAuditAction, PluginAuditAction.UPDATE_CHECK>;

export type PluginHistoryActorDto =
  | { readonly kind: 'you' }
  | { readonly kind: 'member'; readonly name: string }
  | { readonly kind: 'deployment' };

export interface PluginHistoryPluginDto {
  readonly pluginId: string;
  readonly displayName: string;
  readonly ownerName: string;
}

export interface PluginHistoryEventDto {
  readonly id: string;
  readonly occurredAt: Date;
  readonly action: PluginHistoryAction;
  readonly scope: PluginPublicationScope | null;
  readonly plugin: PluginHistoryPluginDto;
  readonly actor: PluginHistoryActorDto | null;
  readonly version: string | null;
}

export interface PluginHistoryPageDto {
  readonly items: PluginHistoryEventDto[];
  readonly nextCursor: string | null;
}
