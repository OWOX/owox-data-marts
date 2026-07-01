export const MCP_DATA_DESTINATIONS_FACADE = Symbol('MCP_DATA_DESTINATIONS_FACADE');

export interface McpListDestinationsRequest {
  projectId: string;
  userId: string;
  roles: string[];
}

/**
 * Canonical MCP destination-type vocabulary and single source of truth. The
 * `McpDestinationType` union, the `DESTINATION_TYPE_MAP` target type, and the
 * tool's output `z.enum` are all derived from this tuple, so they cannot drift
 * out of sync (a rename here updates every consumer at once).
 */
export const MCP_DESTINATION_TYPES = [
  'google_sheets',
  'looker_studio',
  'email',
  'slack',
  'teams',
  'google_chat',
] as const;

export type McpDestinationType = (typeof MCP_DESTINATION_TYPES)[number];

export interface McpDestinationListItem {
  id: string;
  name: string;
  type: McpDestinationType;
  owner: string | null;
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
  lookerStudioCredentials?: {
    destinationId: string;
    destinationSecretKey: string;
    deploymentUrl: string;
  };
}

export interface McpListDestinationsResponse {
  destinations: McpDestinationListItem[];
}

export interface McpBeginGoogleSheetsSetupRequest {
  projectId: string;
  userId: string;
  title?: string;
  redirectBack?: string;
}

export interface McpBeginGoogleSheetsSetupResponse {
  setupUrl: string;
}

export interface McpDataDestinationsFacade {
  listDestinations(request: McpListDestinationsRequest): Promise<McpListDestinationsResponse>;
  createDestination(request: McpCreateDestinationRequest): Promise<McpCreateDestinationResponse>;
  beginGoogleSheetsSetup(
    request: McpBeginGoogleSheetsSetupRequest
  ): Promise<McpBeginGoogleSheetsSetupResponse>;
}
