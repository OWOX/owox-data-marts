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
}

export interface McpListDestinationsResponse {
  destinations: McpDestinationListItem[];
}

export interface McpDataDestinationsFacade {
  listDestinations(request: McpListDestinationsRequest): Promise<McpListDestinationsResponse>;
}
