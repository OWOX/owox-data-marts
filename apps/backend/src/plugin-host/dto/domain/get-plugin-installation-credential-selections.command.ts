import { AuthorizationContext } from '../../../idp/types/auth.types';

export class GetPluginInstallationCredentialSelectionsCommand {
  constructor(
    readonly installationId: string,
    readonly context: AuthorizationContext
  ) {}
}
