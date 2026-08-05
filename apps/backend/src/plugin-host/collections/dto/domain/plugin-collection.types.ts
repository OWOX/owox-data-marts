import type { AuthorizationContext } from '../../../../idp';
import type { PluginCollectionDeclaration } from '../../../utils/plugin-manifest.util';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface PluginCollectionRuntimeContext extends AuthorizationContext {
  readonly pluginId: string;
  readonly installationId: string;
}

export interface PluginCollectionDocumentDto {
  readonly id: string;
  readonly parentId?: string;
  readonly document: JsonValue;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PluginCollectionPageDto {
  readonly items: PluginCollectionDocumentDto[];
  readonly nextCursor: string | null;
}

export interface ResolvedPluginCollection {
  readonly declaration: PluginCollectionDeclaration;
  readonly namespaceKey: string;
  readonly memberId: string | null;
}

export interface PluginCollectionCommand {
  readonly collectionName: string;
  readonly context: PluginCollectionRuntimeContext;
}

export interface ListPluginCollectionCommand extends PluginCollectionCommand {
  readonly limit: number;
  readonly cursor: string | null;
}

export interface GetPluginCollectionCommand extends PluginCollectionCommand {
  readonly documentId: string;
}

export interface PutPluginCollectionCommand extends GetPluginCollectionCommand {
  readonly document: JsonValue;
  readonly parentId: string | null;
}
