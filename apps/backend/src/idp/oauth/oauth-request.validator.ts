import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  McpScope,
  OAuthAuthorizationRequest,
  OAuthTokenExchangeRequest,
} from '@owox/idp-protocol';
import type { McpResourceContext } from '../../mcp-resource/mcp-resource-context';
import { McpResourceResolverService } from '../../mcp-resource/mcp-resource-resolver.service';
import { OAuthClientRegistry, OAuthRegisteredClient } from './oauth-client.registry';
import { OAuthConfigService } from './oauth-config.service';

type OAuthInput = Record<string, unknown>;

export interface ValidatedOAuthAuthorizationRequest {
  request: OAuthAuthorizationRequest;
  resourceContext: McpResourceContext;
}

export interface ValidatedOAuthTokenRequest {
  request: OAuthTokenExchangeRequest;
  resourceContext: McpResourceContext;
}

@Injectable()
export class OAuthRequestValidator {
  constructor(
    private readonly config: OAuthConfigService,
    private readonly clientRegistry: OAuthClientRegistry,
    private readonly resourceResolver: McpResourceResolverService
  ) {}

  async validateAuthorizationRequest(
    input: OAuthInput,
    requestResource?: string
  ): Promise<ValidatedOAuthAuthorizationRequest> {
    this.requireEquals(input.response_type, 'code', 'response_type must be code');
    this.requireEquals(input.code_challenge_method, 'S256', 'code_challenge_method must be S256');

    const clientId = this.requiredString(input.client_id, 'client_id');
    const redirectUri = this.requiredString(input.redirect_uri, 'redirect_uri');
    const state = this.requiredString(input.state, 'state');
    const codeChallenge = this.requiredString(input.code_challenge, 'code_challenge');
    const client = await this.getClient(clientId);
    const { resource, resourceContext } = this.resolveClientResource(
      client,
      input.resource,
      requestResource
    );

    if (!client.redirectUris.includes(redirectUri)) {
      throw new BadRequestException('redirect_uri is not registered for client');
    }

    return {
      request: {
        clientId,
        redirectUri,
        resource,
        scopes: this.parseScopes(input.scope, client),
        state,
        codeChallenge,
        codeChallengeMethod: 'S256',
      },
      resourceContext,
    };
  }

  async validateTokenRequest(
    input: OAuthInput,
    requestResource?: string
  ): Promise<ValidatedOAuthTokenRequest> {
    const grantType = this.requiredString(input.grant_type, 'grant_type');
    const clientId = this.requiredString(input.client_id, 'client_id');
    const client = await this.getClient(clientId);
    const { resource, resourceContext } = this.resolveClientResource(
      client,
      input.resource,
      requestResource
    );

    if (grantType === 'authorization_code') {
      const redirectUri = this.requiredString(input.redirect_uri, 'redirect_uri');
      if (!client.redirectUris.includes(redirectUri)) {
        throw new BadRequestException('redirect_uri is not registered for client');
      }
      return {
        request: {
          grantType,
          code: this.requiredString(input.code, 'code'),
          clientId,
          redirectUri,
          resource,
          codeVerifier: this.requiredString(input.code_verifier, 'code_verifier'),
        },
        resourceContext,
      };
    }

    if (grantType === 'refresh_token') {
      return {
        request: {
          grantType,
          refreshToken: this.requiredString(input.refresh_token, 'refresh_token'),
          clientId,
          resource,
        },
        resourceContext,
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

  private resolveClientResource(
    client: OAuthRegisteredClient,
    clientResource: unknown,
    requestResource?: string
  ): {
    resource: string;
    resourceContext: McpResourceContext;
  } {
    if (!client.resource) {
      throw new BadRequestException('client is not bound to an MCP resource');
    }

    const resource = client.resource;
    const resourceContext = this.validateResource(resource);
    this.assertMatchingResource(
      clientResource,
      resource,
      'resource does not match registered client'
    );

    if (requestResource !== undefined && requestResource !== resource) {
      throw new BadRequestException('request resource does not match registered client');
    }

    return {
      resource,
      resourceContext,
    };
  }

  private assertMatchingResource(value: unknown, expected: string, message: string): void {
    if (value === undefined) {
      return;
    }

    const resource = this.requiredString(value, 'resource');
    this.validateResource(resource);
    if (resource !== expected) {
      throw new BadRequestException(message);
    }
  }

  private validateResource(resource: string): McpResourceContext {
    try {
      return this.resourceResolver.resolveResource(resource);
    } catch {
      throw new BadRequestException('invalid resource');
    }
  }

  private requireEquals(value: unknown, expected: string, message: string): void {
    if (value !== expected) {
      throw new BadRequestException(message);
    }
  }
}
