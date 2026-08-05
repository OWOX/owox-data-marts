import { AuthorizationContext } from '../../../idp/types/auth.types';

export class UninstallPluginCommand {
  constructor(
    readonly pluginId: string,
    readonly context: AuthorizationContext
  ) {}
}
