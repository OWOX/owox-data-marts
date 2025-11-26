import { ConnectorService } from '../connector.service';
import { Injectable } from '@nestjs/common';
import { ConnectorSourceCredentialsService } from '../connector-source-credentials.service';
import {
  ConnectorOAuthStatusSchema,
  ConnectorOAuthSettingsSchema,
  ConnectorOAuthExchangeResultSchema,
} from 'src/data-marts/connector-types/connector-oauth-schema';

@Injectable()
export class ConnectorOauthService {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService
  ) {}

  async exchangeCredentials(
    projectId: string,
    userId: string,
    connectorName: string,
    fieldPath: string,
    payload: Record<string, unknown>
  ): Promise<ConnectorOAuthExchangeResultSchema> {
    try {
      const result = await this.connectorService.exchangeCredential(
        projectId,
        userId,
        connectorName,
        fieldPath,
        payload
      );
      return {
        success: true,
        credentialId: result.credentialId,
        user: result.user,
        additional: result.additional,
        reasons: result.warnings,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
  }

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

  async getCredentialStatus(
    connectorName: string,
    credentialId: string
  ): Promise<ConnectorOAuthStatusSchema> {
    const credential =
      await this.connectorSourceCredentialsService.getCredentialsById(credentialId);

    if (!credential) {
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
}
