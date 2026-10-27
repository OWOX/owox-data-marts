import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../../idp';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import { GoogleOAuthFlowService } from '../../services/google-oauth/google-oauth-flow.service';
import type {
  AuthorizeGoogleOAuthCredentialApiDto,
  GoogleOAuthCredentialAuthorizationApiDto,
} from '../dto/credential-api.dto';
import type { Credential } from '../entities/credential.entity';
import { CredentialService } from '../services/credential.service';

@Injectable()
export class AuthorizeGoogleOAuthCredentialService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly access: AccessDecisionService,
    private readonly flow: GoogleOAuthFlowService
  ) {}

  async run(
    context: AuthorizationContext,
    input: AuthorizeGoogleOAuthCredentialApiDto
  ): Promise<GoogleOAuthCredentialAuthorizationApiDto> {
    // Checked here too so a member is not sent through Google consent only to be refused.
    const reconnecting = input.credentialId
      ? await loadReconnectableCredential(
          this.credentials,
          this.access,
          context,
          input.credentialId
        )
      : null;
    if (reconnecting && input.definitionId && input.definitionId !== reconnecting.definitionId) {
      throw new BadRequestException('A reconnect keeps the definition of the Credential.');
    }
    const { authorizationUrl } = await this.flow.generateAuthorizationUrl(
      'credential',
      context.projectId,
      input.credentialId,
      input.redirectUri,
      reconnecting?.definitionId ?? input.definitionId
    );
    return { authorizationUrl };
  }
}

/** A Credential the member may point at a new Google grant: a Google account they can edit. */
export async function loadReconnectableCredential(
  credentials: CredentialService,
  access: AccessDecisionService,
  context: AuthorizationContext,
  credentialId: string
): Promise<Credential> {
  const credential = await credentials.getByIdAndProjectId(credentialId, context.projectId);
  const canEdit = await access.canAccess(
    context.userId,
    context.roles ?? [],
    EntityType.CREDENTIAL,
    credentialId,
    Action.EDIT,
    context.projectId
  );
  if (!canEdit) {
    throw new ForbiddenException('You do not have permission to reconnect this Credential');
  }
  if (!('oauth' in credential.secret)) {
    throw new BadRequestException('Only a Google account Credential can be reconnected.');
  }
  return credential;
}
