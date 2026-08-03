import { AuthorizationContext } from '../../../idp/types/auth.types';

export class GetPluginDetailsCommand {
  constructor(
    readonly pluginId: string,
    readonly context: AuthorizationContext
  ) {}
}
