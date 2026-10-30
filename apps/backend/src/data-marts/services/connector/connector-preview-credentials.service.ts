import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../../idp';
import { Action, AccessDecisionService, EntityType } from '../access-decision';
import { SourceCredentialBindingService } from '../../connector-types/source-credential-binding.service';
import { ConnectorCredentialBoundaryError } from '../../errors/connector-credential-boundary.error';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { SourceCredentialInjectorService } from './source-credential-injector.service';

const SECRET_MASK = '**********';

type CredentialReference = { id: string; type: 'oauth' | 'secrets' };

@Injectable()
export class ConnectorPreviewCredentialsService {
  constructor(
    private readonly credentialInjector: ConnectorCredentialInjectorService,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly sourceCredentials: SourceCredentialBindingService,
    private readonly sourceCredentialInjector: SourceCredentialInjectorService
  ) {}

  async inject(
    connectorName: string,
    config: Record<string, unknown>,
    context: AuthorizationContext,
    dataMartId?: string
  ): Promise<Record<string, unknown>> {
    const { _credential_id: credentialId, ...rest } = config;
    if (credentialId !== undefined) {
      return this.injectCredential(connectorName, rest, credentialId, context, dataMartId);
    }
    const previewConfig = this.withoutStoredSecretReferenceForInlineKey(config);
    await this.validateReferences(connectorName, previewConfig, context);
    const configWithSecrets = await this.credentialInjector.injectSecrets(
      previewConfig,
      context.projectId,
      connectorName
    );
    return this.credentialInjector.injectOAuthCredentials(
      configWithSecrets,
      connectorName,
      context.projectId
    );
  }

  /** USE the Credential, or EDIT the Data Mart it is bound to for exactly this configuration. */
  private async injectCredential(
    connectorName: string,
    config: Record<string, unknown>,
    credentialId: unknown,
    context: AuthorizationContext,
    dataMartId?: string
  ): Promise<Record<string, unknown>> {
    if (typeof credentialId !== 'string' || !credentialId) throw this.invalidCredentials();
    const { projectId, userId, roles = [] } = context;
    const ids =
      dataMartId !== undefined && typeof config._id === 'string'
        ? await this.sourceCredentials.boundCredentialIds(projectId, dataMartId)
        : undefined;
    // Undefined when the configuration is unbound, null once its Credential was deleted.
    const bound = ids?.get(config._id as string);
    const canEditDataMart =
      bound !== undefined &&
      (bound === null || bound === credentialId) &&
      (await this.accessDecisionService.canAccess(
        userId,
        roles,
        EntityType.DATA_MART,
        dataMartId!,
        Action.EDIT,
        projectId
      ));
    if (!(canEditDataMart && bound === credentialId)) {
      // An id that is not a Credential of this project is refused as a member is, whatever the role.
      const deletedKnown = canEditDataMart && bound === null;
      if (!deletedKnown && !(await this.sourceCredentials.hasCredential(projectId, credentialId))) {
        throw this.invalidCredentials();
      }
      try {
        await this.sourceCredentials.assertCanUseCredential({
          projectId,
          userId,
          roles,
          credentialId,
        });
      } catch (error) {
        if (canEditDataMart && bound === null) throw this.sourceCredentials.boundCredentialGone();
        throw error;
      }
    }
    const credential = await this.sourceCredentials.resolveCredential(projectId, credentialId);
    try {
      return this.sourceCredentialInjector.previewBoundConfig(config, connectorName, credential);
    } catch (error) {
      if (error instanceof ConnectorCredentialBoundaryError) throw this.invalidCredentials();
      throw error;
    }
  }

  private withoutStoredSecretReferenceForInlineKey(
    config: Record<string, unknown>
  ): Record<string, unknown> {
    const authType = config.AuthType as Record<string, unknown> | undefined;
    const serviceAccount = authType?.service_account as Record<string, unknown> | undefined;
    const key = serviceAccount?.ServiceAccountKey;
    if (typeof key !== 'string' || !key.trim() || key === SECRET_MASK) {
      return config;
    }

    const previewConfig = { ...config };
    delete previewConfig._secrets_id;
    return previewConfig;
  }

  private async validateReferences(
    connectorName: string,
    config: Record<string, unknown>,
    context: AuthorizationContext
  ): Promise<void> {
    const configId = typeof config._id === 'string' ? config._id : undefined;

    for (const reference of this.collectReferences(config)) {
      const credential = await this.connectorSourceCredentialsService.getCredentialsById(
        reference.id
      );

      if (
        !credential ||
        credential.projectId !== context.projectId ||
        credential.connectorName !== connectorName
      ) {
        throw this.invalidCredentials();
      }

      if (reference.type === 'oauth') {
        // Managed OAuth credentials are project-scoped and intentionally match
        // the access boundary used by connector runs. Data-Mart-scoped secret
        // records must not be accepted as OAuth credentials for a preview.
        if (credential.dataMartId || credential.configId) {
          throw this.invalidCredentials();
        }
        continue;
      }

      const isCurrentConfig = Boolean(configId) && credential.configId === configId;
      if (!isCurrentConfig) {
        throw this.invalidCredentials();
      }

      if (!credential.dataMartId) {
        throw this.invalidCredentials();
      }

      const canUseCredentials = await this.accessDecisionService.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.DATA_MART,
        credential.dataMartId,
        Action.EDIT,
        context.projectId
      );
      if (!canUseCredentials) {
        throw this.invalidCredentials();
      }
    }
  }

  private collectReferences(
    value: unknown,
    references = new Map<string, CredentialReference>()
  ): CredentialReference[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return Array.from(references.values());
    }

    const object = value as Record<string, unknown>;
    if (typeof object._source_credential_id === 'string') {
      references.set(`oauth:${object._source_credential_id}`, {
        id: object._source_credential_id,
        type: 'oauth',
      });
    }
    if (typeof object._secrets_id === 'string') {
      references.set(`secrets:${object._secrets_id}`, {
        id: object._secrets_id,
        type: 'secrets',
      });
    }

    for (const child of Object.values(object)) {
      this.collectReferences(child, references);
    }

    return Array.from(references.values());
  }

  private invalidCredentials(): ForbiddenException {
    return new ForbiddenException('The selected credentials cannot be used for this preview');
  }
}
