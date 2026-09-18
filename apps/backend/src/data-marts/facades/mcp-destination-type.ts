import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';

/**
 * Canonical MCP destination-type vocabulary and single source of truth. The
 * `McpDestinationType` union, the `DESTINATION_TYPE_MAP` target type, and every
 * tool's output `z.enum` are derived from this tuple, so they cannot drift out
 * of sync (a rename here updates every consumer at once).
 */
export const MCP_DESTINATION_TYPES = [
  'google_sheets',
  'looker_studio',
  'excel',
  'email',
  'slack',
  'teams',
  'google_chat',
] as const;

export type McpDestinationType = (typeof MCP_DESTINATION_TYPES)[number];

/**
 * Types `add_destination` does not offer, subtracted from the vocabulary above.
 *
 * The vocabulary itself has to stay exhaustive over the enum, because every type is *named* on
 * the way out — `list_destinations` and `get_data_mart_reports` report whatever a project
 * already has, Excel included. Being creatable is a separate question. The web app offers
 * Excel because a person sees the project's existing Excel destinations in the list before
 * adding one; an agent creates blind, and with nothing to fill in would readily add a second
 * destination indistinguishable from the one the add-in already resolved. Until this tool can
 * show that list first, the option is withheld rather than left to fail in the handler.
 *
 * What an agent is shown, not what the server enforces: the REST API and the web app both
 * accept a hand-created Excel destination, and are expected to keep accepting it.
 */
export const MCP_NON_CREATABLE_DESTINATION_TYPES = [
  'excel',
] as const satisfies readonly McpDestinationType[];

const DESTINATION_TYPE_MAP: Record<DataDestinationType, McpDestinationType> = {
  [DataDestinationType.GOOGLE_SHEETS]: 'google_sheets',
  [DataDestinationType.LOOKER_STUDIO]: 'looker_studio',
  [DataDestinationType.EXCEL]: 'excel',
  [DataDestinationType.EMAIL]: 'email',
  [DataDestinationType.SLACK]: 'slack',
  [DataDestinationType.MS_TEAMS]: 'teams',
  [DataDestinationType.GOOGLE_CHAT]: 'google_chat',
};

/**
 * Maps a domain `DataDestinationType` to the lowercase MCP vocabulary exposed to
 * clients. The `Record` is exhaustive over the enum, so a new destination type
 * fails the build until it is mapped here; the runtime guard covers values that
 * bypass the compiler (e.g. a raw DB string outside the enum), which would
 * otherwise leak `undefined` into an MCP response.
 */
export function toMcpDestinationType(type: DataDestinationType): McpDestinationType {
  const mapped = DESTINATION_TYPE_MAP[type];
  if (!mapped) {
    throw new Error(`Unsupported destination type for MCP: ${type}`);
  }
  return mapped;
}
