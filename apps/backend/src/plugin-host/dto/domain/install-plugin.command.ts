import { AuthorizationContext } from '../../../idp/types/auth.types';

export class InstallPluginCommand {
  constructor(
    readonly pluginId: string,
    /** The version the member was shown. Guards against installing something they never saw. */
    readonly expectedVersionId: string | null,
    readonly context: AuthorizationContext
  ) {}
}
