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
 * already has, Excel included. Being creatable is a separate question, and Excel answers it the
 * same way it does in the web app's type list: the add-in resolves one on first use and it
 * holds nothing to fill in, so offering it would invite a second destination indistinguishable
 * from the automatic one — and possibly not the one the add-in goes on to use.
 *
 * What an agent is shown, not what the server enforces: the REST API still accepts a
 * hand-created Excel destination, and is expected to keep accepting it.
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
