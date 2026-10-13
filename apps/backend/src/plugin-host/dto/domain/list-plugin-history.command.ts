import { AuthorizationContext } from '../../../idp/types/auth.types';

export type PluginHistoryType = 'all' | 'installations' | 'publications';

export class ListPluginHistoryCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly type: PluginHistoryType,
    readonly limit: number,
    readonly cursor: string | null
  ) {}
}
