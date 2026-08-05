import { AuthorizationContext } from '../../../idp/types/auth.types';

export class GetPluginInstallationEntryCommand {
  constructor(
    readonly installationId: string,
    readonly context: AuthorizationContext
  ) {}
}
