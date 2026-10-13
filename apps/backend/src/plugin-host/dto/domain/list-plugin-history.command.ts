import { AuthorizationContext } from '../../../idp/types/auth.types';

export const PLUGIN_HISTORY_DEFAULT_LIMIT = 50;

export type PluginHistoryType = 'all' | 'installations' | 'publications';

export class ListPluginHistoryCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly type: PluginHistoryType,
    readonly limit: number,
    readonly cursor: string | null
  ) {}
}
