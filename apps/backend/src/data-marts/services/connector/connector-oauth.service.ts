import { ConnectorService } from './connector.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import {
  ConnectorOAuthStatusSchema,
  ConnectorOAuthSettingsSchema,
} from 'src/data-marts/connector-types/connector-oauth-schema';
import type { AuthorizationContext } from '../../../idp';
import { sourceCredentialDefinitions } from '../../connector-types/source-credential-definitions';
import { UNKNOWN_ACCOUNT_ID } from '../../credentials/credential.types';
import type { Credential } from '../../credentials/entities/credential.entity';
import { CredentialService } from '../../credentials/services/credential.service';
import { AccessDecisionService, Action, EntityType } from '../access-decision';

@Injectable()
export class ConnectorOauthService {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly credentials: CredentialService,
    private readonly access: AccessDecisionService
  ) {}

  async getOAuthSettings(
    connectorName: string,
    path: string
  ): Promise<ConnectorOAuthSettingsSchema> {
    const uiVariables = await this.connectorService.getOAuthUiVariablesExpanded(
      connectorName,
      path
    );

    const isEnabled = await this.connectorService.isOAuthEnabled(connectorName, path);

    return {
      vars: uiVariables,
      isEnabled,
    };
  }

  /** A reusable Credential's status, or an old row's when no Credential has that id. */
  async getCredentialStatus(
    connectorName: string,
    credentialId: string,
    context: AuthorizationContext
  ): Promise<ConnectorOAuthStatusSchema> {
    const reusable = await this.credentials.findById(credentialId);
    if (reusable) return this.reusableCredentialStatus(connectorName, reusable, context);

    const { projectId } = context;
    const credential =
      await this.connectorSourceCredentialsService.getCredentialsById(credentialId);

    // A credential from another project is treated as non-existent so callers
    // cannot probe credential status across the tenant boundary.
    if (!credential || credential.projectId !== projectId) {
      throw new Error(`Credential with ID ${credentialId} not found`);
    }

    if (credential.connectorName !== connectorName) {
      throw new Error(
        `Credential belongs to connector ${credential.connectorName}, not ${connectorName}`
      );
    }

    const isValid = !(await this.connectorSourceCredentialsService.isExpired(credentialId));

    return {
      isValid,
      expiresAt: credential.expiresAt,
      user: credential.user,
      additional: undefined,
    };
  }

  private async reusableCredentialStatus(
    connectorName: string,
    credential: Credential,
    context: AuthorizationContext
  ): Promise<ConnectorOAuthStatusSchema> {
    if (credential.projectId !== context.projectId) {
      throw new NotFoundException(`Credential with ID ${credential.id} not found`);
    }
    const canSee = await this.access.canAccess(
      context.userId,
      context.roles ?? [],
      EntityType.CREDENTIAL,
      credential.id,
      Action.SEE,
      context.projectId
    );
    if (!canSee) throw new ForbiddenException('You do not have access to this Credential');
    const generated = sourceCredentialDefinitions().definitions.some(
      definition =>
        definition.id === credential.definitionId &&
        (definition.connectors ?? []).includes(connectorName)
    );
    if (!generated) {
      throw new BadRequestException(
        `Credential ${credential.id} is not a ${connectorName} Credential`
      );
    }
    const metadata = credential.publicMetadata;
    const connection = metadata && 'connection' in metadata ? metadata.connection : undefined;
    const expiresAt = connection?.expiresAt ? new Date(connection.expiresAt) : null;
    const account = connection?.account;
    return {
      isValid: expiresAt === null || expiresAt > new Date(),
      expiresAt,
      user: account
        ? { id: account.id, name: account.name ?? undefined, email: account.email ?? undefined }
        : connection
          ? // A sign-in whose provider names no account still reads as connected.
            { id: UNKNOWN_ACCOUNT_ID, name: credential.title }
          : undefined,
      additional: undefined,
    };
  }
}
