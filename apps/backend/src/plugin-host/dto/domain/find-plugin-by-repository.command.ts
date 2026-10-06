import { AuthorizationContext } from '../../../idp/types/auth.types';

export class FindPluginByRepositoryCommand {
  constructor(
    readonly repository: string,
    readonly context: AuthorizationContext
  ) {}
}
