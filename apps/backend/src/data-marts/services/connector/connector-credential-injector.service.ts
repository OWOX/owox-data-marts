// connector-credential-injector.service.ts
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorService } from './connector.service';
import { ConnectorSecretService } from './connector-secret.service';
// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

const { GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD, GENERATED_REFRESH_TOKEN_CONFIG_FIELD } = Core;

@Injectable()
export class ConnectorCredentialInjectorService {
  private readonly logger = new Logger(ConnectorCredentialInjectorService.name);

  constructor(
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly connectorService: ConnectorService,
    private readonly connectorSecretService: ConnectorSecretService
  ) {}

  async injectOAuthCredentials(
    config: Record<string, unknown>,
    connectorName: string,
    projectId: string
  ): Promise<Record<string, unknown>> {
    return (await this.injectOAuthCredentialsRecursive(
      config,
      '',
      connectorName,
      projectId
    )) as Record<string, unknown>;
  }

  async injectGoogleSheetsPreviewCredentials(
    config: Record<string, unknown>,
    projectId: string
  ): Promise<Record<string, unknown>> {
    const connectorName = 'GoogleSheets';
    await this.validatePreviewCredentialReferences(config, connectorName, projectId);
    const configWithSecrets = await this.injectSecrets(config, projectId);
    return this.injectOAuthCredentials(configWithSecrets, connectorName, projectId);
  }

  async refreshCredentialsForConfig(
    projectId: string,
    connectorName: string,
    config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return (await this.refreshCredentialsRecursive(
      projectId,
      connectorName,
      config,
      config
    )) as Record<string, unknown>;
  }

  private async injectOAuthCredentialsRecursive(
    value: unknown,
    currentPath: string,
    connectorName: string,
    projectId: string
  ): Promise<unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const obj = value as Record<string, unknown>;
    const credentialId = obj._source_credential_id as string | undefined;

    if (credentialId) {
      try {
        const credentialsEntity =
          await this.connectorSourceCredentialsService.getCredentialsById(credentialId);

        if (!credentialsEntity) {
          this.logger.warn(
            `OAuth credentials not found for ID: ${credentialId}. Using config without OAuth tokens.`
          );
          return obj;
        }

        if (credentialsEntity.projectId !== projectId) {
          this.logger.warn(
            `OAuth credentials ${credentialId} belong to project ${credentialsEntity.projectId}, not ${projectId}. Skipping injection.`
          );
          return obj;
        }

        const isExpired = await this.connectorSourceCredentialsService.isExpired(credentialId);
        if (isExpired) {
          this.logger.warn(
            `OAuth tokens expired for credential ID: ${credentialId}. Connector may fail. Please re-authorize.`
          );
        }

        const spec = await this.connectorService.getItemByFieldPath(
          credentialsEntity.connectorName,
          currentPath
        );

        const mapping = spec.oauthParams?.mapping as Record<string, string> | undefined;
        const { _source_credential_id: _, ...restObj } = obj;

        if (!mapping) {
          this.logger.warn(
            `No mapping found for OAuth field ${currentPath}. Using credentials directly.`
          );
          const {
            [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: generatedRefreshToken,
            ...credentials
          } = credentialsEntity.credentials;
          return {
            ...restObj,
            ...credentials,
            ...(typeof generatedRefreshToken === 'string' && generatedRefreshToken
              ? { [GENERATED_REFRESH_TOKEN_CONFIG_FIELD]: { value: generatedRefreshToken } }
              : {}),
          };
        }

        const resolvedConfig: Record<string, unknown> = {};
        for (const [key, mappingConfig] of Object.entries(mapping)) {
          resolvedConfig[key] = this.resolveMapping(mappingConfig, credentialsEntity.credentials);
        }
        const generatedRefreshToken =
          credentialsEntity.credentials[GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD];
        if (typeof generatedRefreshToken === 'string' && generatedRefreshToken) {
          resolvedConfig[GENERATED_REFRESH_TOKEN_CONFIG_FIELD] = {
            value: generatedRefreshToken,
          };
        }

        return { ...restObj, ...resolvedConfig };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to inject OAuth credentials for ID: ${credentialId}: ${errorMessage}`,
          error instanceof Error ? error.stack : undefined
        );
        return obj;
      }
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      result[key] = await this.injectOAuthCredentialsRecursive(
        val,
        newPath,
        connectorName,
        projectId
      );
    }
    return result;
  }

  private async refreshCredentialsRecursive(
    projectId: string,
    connectorName: string,
    value: unknown,
    rootConfig: Record<string, unknown>
  ): Promise<unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const obj = value as Record<string, unknown>;
    const credentialId = obj._source_credential_id as string | undefined;

    if (credentialId) {
      try {
        const newCredentialId = await this.connectorService.refreshCredentials(
          projectId,
          connectorName,
          rootConfig,
          credentialId
        );

        if (newCredentialId !== credentialId) {
          return { ...obj, _source_credential_id: newCredentialId };
        }
        return obj;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to refresh credentials for ${credentialId}: ${errorMessage}. Using existing credentials.`
        );
        return obj;
      }
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = await this.refreshCredentialsRecursive(
        projectId,
        connectorName,
        val,
        rootConfig
      );
    }
    return result;
  }

  /**
   * Inject externalized secrets into configuration if _secrets_id is present.
   * Secrets are stored with their full paths (e.g., "AuthType.oauth2.RefreshToken")
   * and need to be injected at the correct nested location.
   */
  async injectSecrets(
    config: Record<string, unknown>,
    projectId: string
  ): Promise<Record<string, unknown>> {
    const secretsId = config._secrets_id as string | undefined;

    if (!secretsId) {
      return config;
    }

    try {
      const secretsEntity =
        await this.connectorSourceCredentialsService.getCredentialsById(secretsId);

      if (!secretsEntity) {
        this.logger.warn(
          `Secrets not found for ID: ${secretsId}. Using config without externalized secrets.`
        );
        return config;
      }

      if (secretsEntity.projectId !== projectId) {
        this.logger.warn(
          `Secrets ${secretsId} belong to project ${secretsEntity.projectId}, not ${projectId}. Skipping injection.`
        );
        return config;
      }

      const { _secrets_id: _, ...restConfig } = config;
      const result = JSON.parse(JSON.stringify(restConfig)) as Record<string, unknown>;
      const { [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: generatedRefreshToken, ...credentials } =
        secretsEntity.credentials;

      this.connectorSecretService.injectSecretsAtPaths(result, credentials);
      if (typeof generatedRefreshToken === 'string' && generatedRefreshToken) {
        result[GENERATED_REFRESH_TOKEN_CONFIG_FIELD] = {
          value: generatedRefreshToken,
        };
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to inject secrets for ID: ${secretsId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );
      return config;
    }
  }

  private resolveMapping(mappingConfig: unknown, credentials: Record<string, unknown>): unknown {
    if (!mappingConfig || typeof mappingConfig !== 'object') {
      return mappingConfig;
    }

    const config = mappingConfig as Record<string, unknown>;
    if (config.key && typeof config.key === 'string') {
      return credentials[config.key] ?? '';
    }
    return mappingConfig;
  }

  private async validatePreviewCredentialReferences(
    config: Record<string, unknown>,
    connectorName: string,
    projectId: string
  ): Promise<void> {
    const configId = typeof config._id === 'string' ? config._id : undefined;
    const copiedFrom =
      config._copiedFrom && typeof config._copiedFrom === 'object'
        ? (config._copiedFrom as Record<string, unknown>)
        : undefined;
    const references = this.collectPreviewCredentialReferences(config);

    for (const reference of references) {
      const credential = await this.connectorSourceCredentialsService.getCredentialsById(
        reference.id
      );
      const belongsToRequestedConnector =
        credential?.projectId === projectId && credential.connectorName === connectorName;

      if (!credential || !belongsToRequestedConnector) {
        throw new ForbiddenException('The selected credentials cannot be used for this preview');
      }

      if (reference.type === 'oauth') {
        const isProjectOAuthCredential = !credential.dataMartId && !credential.configId;
        if (!isProjectOAuthCredential) {
          throw new ForbiddenException('The selected credentials cannot be used for this preview');
        }
      } else {
        const isCurrentConfigSecret = Boolean(configId) && credential.configId === configId;
        const isCopiedConfigSecret =
          typeof copiedFrom?.dataMartId === 'string' &&
          typeof copiedFrom.configId === 'string' &&
          credential.dataMartId === copiedFrom.dataMartId &&
          credential.configId === copiedFrom.configId;
        if (!isCurrentConfigSecret && !isCopiedConfigSecret) {
          throw new ForbiddenException('The selected credentials cannot be used for this preview');
        }
      }
    }
  }

  private collectPreviewCredentialReferences(
    value: unknown,
    references = new Map<string, { id: string; type: 'oauth' | 'secrets' }>()
  ): Array<{ id: string; type: 'oauth' | 'secrets' }> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return Array.from(references.values());
    }

    const obj = value as Record<string, unknown>;
    if (typeof obj._source_credential_id === 'string') {
      references.set(`oauth:${obj._source_credential_id}`, {
        id: obj._source_credential_id,
        type: 'oauth',
      });
    }
    if (typeof obj._secrets_id === 'string') {
      references.set(`secrets:${obj._secrets_id}`, {
        id: obj._secrets_id,
        type: 'secrets',
      });
    }

    for (const child of Object.values(obj)) {
      this.collectPreviewCredentialReferences(child, references);
    }

    return Array.from(references.values());
  }
}
