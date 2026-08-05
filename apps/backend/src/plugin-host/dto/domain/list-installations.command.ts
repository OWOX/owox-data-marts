import { AuthorizationContext } from '../../../idp/types/auth.types';

export class ListInstallationsCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly includeUninstalled: boolean = false
  ) {}
}
