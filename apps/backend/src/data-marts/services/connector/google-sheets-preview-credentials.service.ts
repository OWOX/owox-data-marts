import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthorizationContext } from '../../../idp';
import { Action, AccessDecisionService, EntityType } from '../access-decision';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';

const GOOGLE_SHEETS_CONNECTOR_NAME = 'GoogleSheets';

@Injectable()
export class GoogleSheetsPreviewCredentialsService {
  constructor(
    private readonly credentialInjector: ConnectorCredentialInjectorService,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async inject(
    config: Record<string, unknown>,
    context: AuthorizationContext
  ): Promise<Record<string, unknown>> {
    await this.validateReferences(config, context);
    return this.credentialInjector.injectSecrets(config, context.projectId);
  }

  private async validateReferences(
    config: Record<string, unknown>,
    context: AuthorizationContext
  ): Promise<void> {
    const configId = typeof config._id === 'string' ? config._id : undefined;
    const copiedFrom = this.getCopiedFrom(config);

    for (const credentialId of this.collectSecretReferences(config)) {
      const credential =
        await this.connectorSourceCredentialsService.getCredentialsById(credentialId);

      if (
        !credential ||
        credential.projectId !== context.projectId ||
        credential.connectorName !== GOOGLE_SHEETS_CONNECTOR_NAME
      ) {
        throw this.invalidCredentials();
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

  private collectSecretReferences(value: unknown, references = new Set<string>()): string[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return Array.from(references.values());
    }

    const object = value as Record<string, unknown>;
    if (typeof object._secrets_id === 'string') {
      references.add(object._secrets_id);
    }

    for (const child of Object.values(object)) {
      this.collectSecretReferences(child, references);
    }

    return Array.from(references.values());
  }

  private invalidCredentials(): ForbiddenException {
    return new ForbiddenException('The selected credentials cannot be used for this preview');
  }
}
