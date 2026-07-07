import type { McpDestinationType } from './mcp-destination-type';

export const MCP_DATA_DESTINATIONS_FACADE = Symbol('MCP_DATA_DESTINATIONS_FACADE');

export interface McpListDestinationsRequest {
  projectId: string;
  userId: string;
  roles: string[];
}

export interface McpDestinationListItem {
  id: string;
  name: string;
  type: McpDestinationType;
  owner: string | null;
  connectedGoogleAccount?: string | null;
  createdAt: string;
}

export interface McpCreateDestinationRequest {
  projectId: string;
  userId: string;
  roles: string[];
  type: McpDestinationType;
  title?: string;
  emails?: string[];
}

export interface McpCreateDestinationResponse {
  id: string;
  name: string;
}

export interface McpListDestinationsResponse {
  destinations: McpDestinationListItem[];
}

export interface McpDataDestinationsFacade {
  listDestinations(request: McpListDestinationsRequest): Promise<McpListDestinationsResponse>;
  createDestination(request: McpCreateDestinationRequest): Promise<McpCreateDestinationResponse>;
}
