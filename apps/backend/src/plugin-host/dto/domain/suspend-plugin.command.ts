import { AuthorizationContext } from '../../../idp/types/auth.types';

export class SuspendPluginCommand {
  constructor(
    readonly repoLocator: string,
    readonly context: AuthorizationContext,
    readonly note?: string
  ) {}
}

export class ResumePluginCommand {
  constructor(
    readonly repoLocator: string,
    readonly context: AuthorizationContext,
    readonly note?: string
  ) {}
}

export interface PluginSuspensionDto {
  readonly pluginId: string;
  readonly suspended: boolean;
  readonly note: string | null;
}
