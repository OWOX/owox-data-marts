import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import type { AuthorizationContext } from '../../idp';
import type { ConnectorOAuthExchangeResultSchema } from '../connector-types/connector-oauth-schema';
import type { ExchangedOAuthCredentials } from '../connector-types/interfaces/connector-oauth-credentials';
import {
  sourceConnectBindingFor,
  sourceFieldValues,
} from '../connector-types/source-credential-definitions';
import { UNKNOWN_ACCOUNT_ID, type SourceConnection } from '../credentials/credential.types';
import type { ResolvedCredentialDefinition } from '../credentials/dto/credential-api.dto';
import type { Credential } from '../credentials/entities/credential.entity';
import { parseFieldsForCreate } from '../credentials/services/credential-fields';
import { CredentialDefinitionService } from '../credentials/services/credential-definition.service';
import { CredentialService } from '../credentials/services/credential.service';
import type {
  ExchangeOAuthCredentialsDto,
  ExchangeOAuthCredentialTargetDto,
} from '../dto/presentation/exchange-oauth-credentials.dto';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ConnectorService } from '../services/connector/connector.service';

type ConnectedValues = Pick<
  Credential,
  'secret' | 'publicMetadata' | 'validationState' | 'validationMessage' | 'validatedAt'
>;

/** Signs in through a connector's own OAuth app and keeps the result as a Credential of the variant's type. */
@Injectable()
export class ConnectSourceOAuthCredentialService {
  constructor(
    private readonly connectors: ConnectorService,
    private readonly credentials: CredentialService,
    private readonly definitions: CredentialDefinitionService,
    private readonly access: AccessDecisionService
  ) {}

  async run(
    context: AuthorizationContext,
    connectorName: string,
    input: ExchangeOAuthCredentialsDto
  ): Promise<ConnectorOAuthExchangeResultSchema> {
    const { fieldPath, payload, credential: target = {} } = input;
    const binding = sourceConnectBindingFor(connectorName, fieldPath);
    if (!binding) {
      throw new BadRequestException(`${connectorName} has no sign-in at ${fieldPath}`);
    }
    if (!(await this.connectors.isOAuthEnabled(connectorName, fieldPath))) {
      throw new BadRequestException(`Sign-in with ${connectorName} is not set up on this server`);
    }
    const definition = await this.definitions.get(binding.definitionId);
    const { auth } = definition.contract;
    if (auth.type !== 'fields') {
      throw new BadRequestException(`${definition.contract.displayName} cannot be connected`);
    }
    // Checked before the exchange so a refused reconnect does not spend the sign-in.
    if (target.id) await this.assertReconnectable(context, target.id, binding.definitionId);

    const exchanged = await this.exchange(connectorName, fieldPath, payload);
    const mapping = (await this.connectors.getItemByFieldPath(connectorName, fieldPath)).oauthParams
      ?.mapping as Record<string, { key?: string }> | undefined;
    const { secret, publicMetadata } = parseFieldsForCreate(
      auth,
      sourceFieldValues(binding, mapping, exchanged.credentials),
      definition.definitionId
    );
    const { user } = exchanged;
    const connection: SourceConnection = {
      account:
        user?.id && user.id !== UNKNOWN_ACCOUNT_ID
          ? { id: user.id, name: user.name ?? null, email: user.email ?? null }
          : null,
      expiresAt: exchanged.expiresAt?.toISOString() ?? null,
    };
    const values: ConnectedValues = {
      secret,
      publicMetadata: { fields: publicMetadata.fields, connection },
      validationState: 'verified',
      validationMessage: 'Account connected',
      validatedAt: new Date(),
    };
    const credentialId = target.id
      ? await this.reconnect(context, target.id, values, connection)
      : await this.create(context, target, definition, values, connection);

    return {
      success: true,
      credentialId,
      user,
      reasons: exchanged.warnings,
    };
  }

  private async create(
    context: AuthorizationContext,
    target: ExchangeOAuthCredentialTargetDto,
    definition: ResolvedCredentialDefinition,
    values: ConnectedValues,
    { account }: SourceConnection
  ): Promise<string> {
    const title =
      target.title?.trim() || account?.name || account?.email || definition.contract.displayName;
    const credential = await this.credentials.createWithAccess(
      {
        ...values,
        projectId: context.projectId,
        title: title.slice(0, 255),
        definitionSource: definition.source,
        definitionId: definition.definitionId,
        acceptedCompatibilityLine: definition.compatibilityLine,
        enabled: true,
        availableForUse: target.availableForUse ?? false,
        availableForMaintenance: target.availableForMaintenance ?? false,
      },
      { createdBy: context, ownerIds: target.ownerIds ?? [], contextIds: target.contextIds ?? [] }
    );
    return credential.id;
  }

  private async reconnect(
    context: AuthorizationContext,
    credentialId: string,
    values: ConnectedValues,
    { account }: SourceConnection
  ): Promise<string> {
    // Fresh read: the exchange took seconds and another request may have saved meanwhile.
    const credential = await this.credentials.getByIdAndProjectId(credentialId, context.projectId);
    const metadata = credential.publicMetadata;
    const saved = metadata && 'connection' in metadata ? metadata.connection?.account : null;
    if (saved && account && saved.id !== account.id) {
      const who = saved.email ?? saved.name;
      throw new BadRequestException(
        `Sign in to the same account${who ? ` (${who})` : ''}, or create a new Credential.`
      );
    }
    return (await this.credentials.save(Object.assign(credential, values))).id;
  }

  private async assertReconnectable(
    context: AuthorizationContext,
    credentialId: string,
    definitionId: string
  ): Promise<void> {
    const credential = await this.credentials.getByIdAndProjectId(credentialId, context.projectId);
    const canEdit = await this.access.canAccess(
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
    if (credential.definitionId !== definitionId) {
      throw new BadRequestException('A reconnect keeps the definition of the Credential.');
    }
  }

  private async exchange(
    connectorName: string,
    fieldPath: string,
    payload: Record<string, unknown>
  ): Promise<ExchangedOAuthCredentials> {
    try {
      return await this.connectors.exchangeOauth(connectorName, fieldPath, payload);
    } catch (error) {
      const failure = castError(error);
      const flow =
        failure.name === 'OauthFlowException' ||
        (failure as { type?: unknown }).type === 'OauthFlowException';
      throw flow ? new BadRequestException(failure.message) : failure;
    }
  }
}
