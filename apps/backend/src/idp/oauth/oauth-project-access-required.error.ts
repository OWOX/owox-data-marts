import { AuthorizationError } from '@owox/idp-protocol';

/** A signed-in user needs project access before connecting an MCP client. */
export class OAuthProjectAccessRequiredError extends AuthorizationError {
  constructor(public readonly projectId: string) {
    super('User must be an active project member');
  }
}
