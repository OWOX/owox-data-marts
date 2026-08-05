import { AuthorizationContext } from '../../../idp/types/auth.types';

export class GetPluginGalleryCommand {
  constructor(readonly context: AuthorizationContext) {}
}
