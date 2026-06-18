import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  McpScope,
  OAuthAuthorizationRequest,
  OAuthTokenExchangeRequest,
} from '@owox/idp-protocol';
import { OAuthClientRegistry, OAuthRegisteredClient } from './oauth-client.registry';
import { OAuthConfigService } from './oauth-config.service';

type OAuthInput = Record<string, unknown>;

@Injectable()
export class OAuthRequestValidator {
  constructor(
    private readonly config: OAuthConfigService,
    private readonly clientRegistry: OAuthClientRegistry
  ) {}

  async validateAuthorizationRequest(input: OAuthInput): Promise<OAuthAuthorizationRequest> {
    this.requireEquals(input.response_type, 'code', 'response_type must be code');
    this.requireEquals(input.code_challenge_method, 'S256', 'code_challenge_method must be S256');

    const clientId = this.requiredString(input.client_id, 'client_id');
    const redirectUri = this.requiredString(input.redirect_uri, 'redirect_uri');
    const resource = this.requiredString(input.resource, 'resource');
    const state = this.requiredString(input.state, 'state');
    const codeChallenge = this.requiredString(input.code_challenge, 'code_challenge');
    const client = await this.getClient(clientId);

    if (resource !== this.config.resource) {
      throw new BadRequestException('invalid resource');
    }
    if (!client.redirectUris.includes(redirectUri)) {
      throw new BadRequestException('redirect_uri is not registered for client');
    }

    return {
      clientId,
      redirectUri,
      resource,
      scopes: this.parseScopes(input.scope, client),
      state,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  async validateTokenRequest(input: OAuthInput): Promise<OAuthTokenExchangeRequest> {
    const grantType = this.requiredString(input.grant_type, 'grant_type');
    const clientId = this.requiredString(input.client_id, 'client_id');
    const client = await this.getClient(clientId);

    if (grantType === 'authorization_code') {
      const resource = this.requiredResource(input.resource);
      const redirectUri = this.requiredString(input.redirect_uri, 'redirect_uri');
      if (!client.redirectUris.includes(redirectUri)) {
        throw new BadRequestException('redirect_uri is not registered for client');
      }
      return {
        grantType,
        code: this.requiredString(input.code, 'code'),
        clientId,
        redirectUri,
        resource,
        codeVerifier: this.requiredString(input.code_verifier, 'code_verifier'),
      };
    }

    if (grantType === 'refresh_token') {
      const resource = this.optionalResourceOrDefault(input.resource);
      return {
        grantType,
        refreshToken: this.requiredString(input.refresh_token, 'refresh_token'),
        clientId,
        resource,
      };
    }

    throw new BadRequestException('unsupported grant_type');
  }

  private async getClient(clientId: string): Promise<OAuthRegisteredClient> {
    const client = await this.clientRegistry.get(clientId);
    if (!client) {
      throw new BadRequestException('unknown client_id');
    }
    return client;
  }

  private parseScopes(raw: unknown, client: OAuthRegisteredClient): McpScope[] {
    const value = this.requiredString(raw, 'scope');
    const scopes = value.split(/\s+/).filter(Boolean) as McpScope[];
    for (const scope of scopes) {
      if (!this.config.scopes.includes(scope) || !client.scopes.includes(scope)) {
        throw new BadRequestException(`unsupported scope: ${scope}`);
      }
    }
    return scopes;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private requiredResource(value: unknown): string {
    return this.validateResource(this.requiredString(value, 'resource'));
  }

  private optionalResourceOrDefault(value: unknown): string {
    if (value === undefined || value === null) {
      return this.config.resource;
    }
    return this.requiredResource(value);
  }

  private validateResource(resource: string): string {
    if (resource !== this.config.resource) {
      throw new BadRequestException('invalid resource');
    }
    return resource;
  }

  private requireEquals(value: unknown, expected: string, message: string): void {
    if (value !== expected) {
      throw new BadRequestException(message);
    }
  }
}
