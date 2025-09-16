import axios, { AxiosInstance } from 'axios';
import {
  TokenRequest,
  TokenResponse,
  RevocationRequest,
  RevocationResponse,
  IntrospectionRequest,
  IntrospectionResponse,
  JwksResponse,
  TokenResponseSchema,
  IntrospectionResponseSchema,
  JwksResponseSchema,
} from './dto';
import { IdentityOwoxClientConfig } from '../config';
import ms from 'ms';
import { Projects, ProjectsSchema } from '@owox/idp-protocol';

/**
 * Represents a client for interacting with the Identity OWOX API.
 * Provides methods for token management, validation, and retrieval of key sets.
 */
export class IdentityOwoxClient {
  private readonly http: AxiosInstance;

  constructor(config: IdentityOwoxClientConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: ms(config.clientTimeout),
      headers: {
        'Content-Type': 'application/json',
        ...(config.defaultHeaders ?? {}),
      },
    });
  }

  /**
   * POST /api/idp/token
   */
  async getToken(req: TokenRequest): Promise<TokenResponse> {
    const { data } = await this.http.post<TokenResponse>('/api/idp/token', req);
    return TokenResponseSchema.parse(data);
  }

  /**
   * POST /api/idp/revocation
   */
  async revokeToken(req: RevocationRequest): Promise<RevocationResponse> {
    const resp = await this.http.post<void>('/api/idp/revocation', req);
    return { success: resp.status >= 200 && resp.status < 300 };
  }

  /**
   * GET /api/idp/introspection
   */
  async introspectToken(req: IntrospectionRequest): Promise<IntrospectionResponse> {
    const { data } = await this.http.get<IntrospectionResponse>('/api/idp/introspection', {
      headers: {
        Authorization: req.token,
      },
    });

    return IntrospectionResponseSchema.parse(data);
  }

  /**
   * GET /api/idp/projects
   */
  async getProjects(accessToken: string): Promise<Projects> {
    const { data } = await this.http.get<Projects>('/api/idp/projects', {
      headers: {
        Authorization: accessToken,
      },
    });

    return ProjectsSchema.parse(data);
  }

  /**
   * GET /api/idp/.well-known/jwks.json
   */
  async getJwks(): Promise<JwksResponse> {
    const { data } = await this.http.get<JwksResponse>('/api/idp/.well-known/jwks.json');
    return JwksResponseSchema.parse(data);
  }
}
