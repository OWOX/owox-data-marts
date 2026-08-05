import { AuthorizationContext } from '../../../idp/types/auth.types';
import { PluginPublicationScope } from '../../enums/plugin-publication-scope.enum';

export class ListPublicationsCommand {
  constructor(
    readonly scope: PluginPublicationScope,
    readonly context: AuthorizationContext
  ) {}
}
