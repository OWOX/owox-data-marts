import { BadRequestException, Injectable } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import type { AuthorizationContext } from '../../../idp';
import {
  GoogleApiException,
  InvalidOAuthStateException,
} from '../../exceptions/google-oauth.exceptions';
import { AccessDecisionService } from '../../services/access-decision';
import { GoogleOAuthFlowService } from '../../services/google-oauth/google-oauth-flow.service';
import type {
  CredentialPublicMetadata,
  CredentialSecret,
  CredentialValidationResult,
} from '../credential.types';
import type { ConnectGoogleOAuthCredentialApiDto } from '../dto/credential-api.dto';
import type { CredentialDto } from '../dto/credential.dto';
import { CredentialDefinitionService } from '../services/credential-definition.service';
import { CredentialService } from '../services/credential.service';
import { CredentialViewService } from '../services/credential-view.service';
import { loadReconnectableCredential } from './authorize-google-oauth-credential.service';

type GoogleAccountMetadata = Extract<CredentialPublicMetadata, { account: unknown }>;

/** Stores a Google consent as a new Credential, or as the new grant of the one being reconnected. */
@Injectable()
export class ConnectGoogleOAuthCredentialService {
  constructor(
    private readonly flow: GoogleOAuthFlowService,
    private readonly credentials: CredentialService,
    private readonly definitions: CredentialDefinitionService,
    private readonly access: AccessDecisionService,
    private readonly view: CredentialViewService
  ) {}

  async run(
    context: AuthorizationContext,
    input: ConnectGoogleOAuthCredentialApiDto
  ): Promise<CredentialDto> {
    const grant = await this.flow.exchangeCodeForGrant(input.code, input.state, context.projectId);
    const { definitionId } = grant.state;
    if (grant.state.type !== 'credential' || !definitionId) {
      throw new InvalidOAuthStateException();
    }
    const { email, name, picture } = grant.user;
    if (!email) {
      throw new GoogleApiException('Failed to fetch user information');
    }
    // Picked field by field so the id_token Google also returns is not kept.
    const { access_token, refresh_token, token_type, scope, expiry_date } = grant.tokens;
    const secret: CredentialSecret = {
      oauth: {
        provider: 'google',
        clientId: grant.clientId,
        tokens: { access_token, refresh_token, token_type, scope, expiry_date },
      },
    };
    const publicMetadata: GoogleAccountMetadata = {
      account: { email, name: name ?? null, picture: picture ?? null },
      scopes: scope.split(' ').filter(Boolean),
    };
    const validation: CredentialValidationResult = {
      state: 'verified',
      message: 'Google account connected',
      validatedAt: new Date(),
    };

    return grant.state.resourceId
      ? this.reconnect(context, grant.state.resourceId, secret, publicMetadata, validation)
      : this.create(context, input, definitionId, secret, publicMetadata, validation);
  }

  private async reconnect(
    context: AuthorizationContext,
    credentialId: string,
    secret: CredentialSecret,
    publicMetadata: GoogleAccountMetadata,
    validation: CredentialValidationResult
  ): Promise<CredentialDto> {
    const credential = await loadReconnectableCredential(
      this.credentials,
      this.access,
      context,
      credentialId
    );
    const saved = credential.publicMetadata;
    const savedEmail = saved && 'account' in saved ? saved.account.email : null;
    if (savedEmail && savedEmail.toLowerCase() !== publicMetadata.account.email.toLowerCase()) {
      throw new BadRequestException(
        `Connect the same Google account (${savedEmail}), or create a new Credential.`
      );
    }
    credential.secret = secret;
    credential.publicMetadata = publicMetadata;
    credential.validationState = validation.state;
    credential.validationMessage = validation.message;
    credential.validatedAt = validation.validatedAt;
    await this.credentials.save(credential);
    return this.view.build(
      await this.credentials.getByIdAndProjectId(credentialId, context.projectId),
      context
    );
  }

  @Transactional()
  private async create(
    context: AuthorizationContext,
    input: ConnectGoogleOAuthCredentialApiDto,
    definitionId: string,
    secret: CredentialSecret,
    publicMetadata: GoogleAccountMetadata,
    validation: CredentialValidationResult
  ): Promise<CredentialDto> {
    const definition = await this.definitions.get(definitionId);
    const credential = await this.credentials.createWithAccess(
      {
        projectId: context.projectId,
        title: input.title?.trim() || publicMetadata.account.email,
        definitionSource: definition.source,
        definitionId: definition.definitionId,
        acceptedCompatibilityLine: definition.compatibilityLine,
        secret,
        publicMetadata,
        enabled: true,
        availableForUse: input.availableForUse ?? true,
        availableForMaintenance: input.availableForMaintenance ?? false,
        validationState: validation.state,
        validationMessage: validation.message,
        validatedAt: validation.validatedAt,
      },
      { createdBy: context, ownerIds: input.ownerIds ?? [], contextIds: [] }
    );

    return this.view.build(
      await this.credentials.getByIdAndProjectId(credential.id, context.projectId),
      context
    );
  }
}
