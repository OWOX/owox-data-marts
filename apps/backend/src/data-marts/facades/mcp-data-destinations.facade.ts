import type { AuthorizationContext } from '../../idp';
import type { McpDestinationType } from './mcp-destination-type';
import type { OwnerFilter } from '../enums/owner-filter.enum';
import type { DestinationCredentialSummary } from '../data-destination-types/destination-credential-state';
import type { DataDestinationImpact } from '../dto/domain/data-destination-impact.dto';
import type { ContextSummary } from '../utils/extract-context-summaries';

export interface McpDestinationDto {
  id: string;
  name: string;
  type: McpDestinationType;
  /** Creator email. Current owners are listed in owners. */
  owner: string | null;
  connectedGoogleAccount: string | null;
  createdAt: string;
  owners: { userId: string; name: string | null; email: string | null }[];
  contexts: ContextSummary[];
  availableForUse: boolean | null;
  availableForMaintenance: boolean | null;
  credential: DestinationCredentialSummary | null;
  emails: string[] | null;
  folderUrl: string | null;
}

export interface McpListDestinationsRequest extends AuthorizationContext {
  type?: McpDestinationType;
  ownerFilter?: OwnerFilter;
  ownerId?: string;
}

export interface McpCreateDestinationRequest extends AuthorizationContext {
  type: McpDestinationType;
  title?: string;
  emails?: string[];
  credentialId?: string;
  folderUrl?: string;
}

export interface McpUpdateDestinationRequest {
  destinationId: string;
  title?: string;
  emails?: string[];
  credentialId?: string;
  folderUrl?: string | null;
}

export interface McpSetDestinationAccessRequest {
  destinationId: string;
  ownerIds?: string[];
  contextIds?: string[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
}

export interface McpCreateDestinationResponse {
  id: string;
  name: string;
}

export interface McpListDestinationsResponse {
  destinations: McpDestinationDto[];
}

export interface McpDestinationMutationResponse {
  id: string;
  status: 'updated' | 'deleted' | 'rotated';
}

export const MCP_DATA_DESTINATIONS_FACADE = Symbol('MCP_DATA_DESTINATIONS_FACADE');

export interface McpDataDestinationsFacade {
  listDestinations(request: McpListDestinationsRequest): Promise<McpListDestinationsResponse>;
  createDestination(request: McpCreateDestinationRequest): Promise<McpCreateDestinationResponse>;
  getDestination(actor: AuthorizationContext, id: string): Promise<McpDestinationDto>;
  updateDestination(
    actor: AuthorizationContext,
    request: McpUpdateDestinationRequest
  ): Promise<McpDestinationDto>;
  setDestinationAccess(
    actor: AuthorizationContext,
    request: McpSetDestinationAccessRequest
  ): Promise<McpDestinationMutationResponse>;
  getDestinationImpact(actor: AuthorizationContext, id: string): Promise<DataDestinationImpact>;
  deleteDestination(
    actor: AuthorizationContext,
    id: string
  ): Promise<McpDestinationMutationResponse>;
  rotateDestinationSecretKey(
    actor: AuthorizationContext,
    id: string
  ): Promise<McpDestinationMutationResponse>;
}
