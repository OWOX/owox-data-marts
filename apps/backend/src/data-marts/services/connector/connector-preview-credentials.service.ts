import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../../idp';
import { Action, AccessDecisionService, EntityType } from '../access-decision';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';

const SECRET_MASK = '**********';

type CredentialReference = { id: string; type: 'oauth' | 'secrets' };

@Injectable()
export class ConnectorPreviewCredentialsService {
  constructor(
    private readonly credentialInjector: ConnectorCredentialInjectorService,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async inject(
    connectorName: string,
    config: Record<string, unknown>,
    context: AuthorizationContext
  ): Promise<Record<string, unknown>> {
    const previewConfig = this.withoutStoredSecretReferenceForInlineKey(config);
    await this.validateReferences(connectorName, previewConfig, context);
    const configWithSecrets = await this.credentialInjector.injectSecrets(
      previewConfig,
      context.projectId
    );
    return this.credentialInjector.injectOAuthCredentials(
      configWithSecrets,
      connectorName,
      context.projectId
    );
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
    const copiedFrom = this.getCopiedFrom(config);

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
      const isCopiedConfig =
        copiedFrom !== undefined &&
        credential.dataMartId === copiedFrom.dataMartId &&
        credential.configId === copiedFrom.configId;
      if (!isCurrentConfig && !isCopiedConfig) {
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

  private getCopiedFrom(
    config: Record<string, unknown>
  ): { dataMartId: string; configId: string } | undefined {
    if (!config._copiedFrom || typeof config._copiedFrom !== 'object') {
      return undefined;
    }

    const copiedFrom = config._copiedFrom as Record<string, unknown>;
    if (typeof copiedFrom.dataMartId !== 'string' || typeof copiedFrom.configId !== 'string') {
      return undefined;
    }

    return { dataMartId: copiedFrom.dataMartId, configId: copiedFrom.configId };
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
