import type { AuthorizationContext } from '../../../idp/types/auth.types';
import type { PluginRunFilter } from './plugin-run.dto';

export const PLUGIN_RUNS_DEFAULT_LIMIT = 50;

export class ListPluginRunsCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly filter: PluginRunFilter,
    readonly cursor: string | null,
    readonly limit: number
  ) {}
}

export class PluginRunCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly id: string
  ) {}
}
