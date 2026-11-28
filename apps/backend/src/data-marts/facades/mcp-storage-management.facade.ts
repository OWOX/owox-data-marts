import type { AuthorizationContext } from '../../idp';
import type { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import type { OwnerFilter } from '../enums/owner-filter.enum';
import type { DataStorageConfig } from '../data-storage-types/data-storage-config.type';
import type { StorageCredentialSummary } from '../data-storage-types/storage-credential-state';
import type { StorageResourceFilter } from '../data-storage-types/interfaces/storage-resource-browser.interface';
import type { ListStorageResourcesDto } from '../dto/domain/list-storage-resources.dto';
import type { ContextSummary } from '../utils/extract-context-summaries';
import type { OwoxStorageLocation } from '../owox-storage/owox-storage-settings';

export interface McpStorageDto {
  id: string;
  title: string;
  type: DataStorageType;
  configuration: DataStorageConfig | null;
  credential: StorageCredentialSummary | null;
  owners: { userId: string; name: string | null; email: string | null }[];
  contexts: ContextSummary[];
  availableForUse: boolean;
  availableForMaintenance: boolean;
  createdAt: string;
  modifiedAt: string;
  /** Set only for an OWOX Storage, which OWOX creates and manages. */
  owoxStorage: { location: OwoxStorageLocation; datasetId: string } | null;
}

export interface McpListStoragesInput {
  type?: DataStorageType;
  ownerId?: string;
  ownerFilter?: OwnerFilter;
}
export interface McpCreateStorageInput {
  type: DataStorageType;
  title?: string;
}
export interface McpCreateOwoxStorageInput {
  location: OwoxStorageLocation;
  title?: string;
}
export interface McpUpdateStorageInput {
  title?: string;
  configuration?: DataStorageConfig;
  credentialId?: string;
}
export interface McpSetStorageAccessInput {
  ownerIds?: string[];
  contextIds?: string[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
}
export interface McpListStorageResourcesInput {
  level: 'namespaces' | 'resources';
  namespaceId?: string;
  resourceType?: StorageResourceFilter;
}
export interface McpStorageValidationDto {
  valid: boolean;
  state:
    | 'valid'
    | 'unconfigured'
    | 'invalid_configuration'
    | 'reauthorization_required'
    | 'credential_unavailable'
    | 'validation_failed';
  message: string;
}

export type McpStorageSummary = Pick<
  McpStorageDto,
  'id' | 'title' | 'type' | 'createdAt' | 'modifiedAt' | 'owoxStorage'
>;

/** Where an actor can create an OWOX Storage in the project. */
export interface McpOwoxStorageOffer {
  locations: OwoxStorageLocation[];
}

export const MCP_STORAGE_MANAGEMENT_FACADE = Symbol('MCP_STORAGE_MANAGEMENT_FACADE');

export interface McpStorageManagementFacade {
  list(actor: AuthorizationContext, input: McpListStoragesInput): Promise<McpStorageSummary[]>;
  get(actor: AuthorizationContext, id: string): Promise<McpStorageDto>;
  create(actor: AuthorizationContext, input: McpCreateStorageInput): Promise<McpStorageDto>;
  createOwoxStorage(
    actor: AuthorizationContext,
    input: McpCreateOwoxStorageInput
  ): Promise<McpStorageDto>;
  update(
    actor: AuthorizationContext,
    id: string,
    input: McpUpdateStorageInput
  ): Promise<McpStorageDto>;
  setAccess(
    actor: AuthorizationContext,
    id: string,
    input: McpSetStorageAccessInput
  ): Promise<void>;
  validate(actor: AuthorizationContext, id: string): Promise<McpStorageValidationDto>;
  listResources(
    actor: AuthorizationContext,
    id: string,
    input: McpListStorageResourcesInput
  ): Promise<ListStorageResourcesDto>;
  delete(actor: AuthorizationContext, id: string): Promise<void>;
  /** False on a deployment without OWOX Storage, such as a self-managed one. */
  isOwoxStorageEnabled(): boolean;
  /** Null when the deployment has no OWOX Storage, the actor is not an editor, or both locations are taken. */
  getOwoxStorageOffer(actor: AuthorizationContext): Promise<McpOwoxStorageOffer | null>;
}
