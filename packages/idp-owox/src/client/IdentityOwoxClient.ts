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
  OwoxProjectMembersResponse,
  OwoxProjectMembersResponseSchema,
} from './dto';
import { IdentityOwoxClientConfig } from '../config';
import ms from 'ms';
import { Projects, ProjectsSchema } from '@owox/idp-protocol';
import { AuthenticationException, IdpFailedException } from '../exception';
import { ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';

/**
 * Represents a client for interacting with the Identity OWOX API.
 * Provides methods for token management, validation, and retrieval of key sets.
 */
export class IdentityOwoxClient {
  private readonly http: AxiosInstance;

  private readonly impersonatedIdTokenFetcher?: ImpersonatedIdTokenFetcher;
  private readonly c2cServiceAccountEmail?: string;
  private readonly c2cTargetAudience?: string;
  private readonly clientBackchannelPrefix?: string;

  constructor(config: IdentityOwoxClientConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: ms(config.clientTimeout),
      headers: {
        'Content-Type': 'application/json',
        ...(config.defaultHeaders ?? {}),
      },
    });

    // Initialize service account authentication if configured
    if (
      config.c2cServiceAccountEmail &&
      config.c2cTargetAudience &&
      config.clientBackchannelPrefix
    ) {
      this.impersonatedIdTokenFetcher = new ImpersonatedIdTokenFetcher();
      this.c2cServiceAccountEmail = config.c2cServiceAccountEmail;
      this.c2cTargetAudience = config.c2cTargetAudience;
      this.clientBackchannelPrefix = config.clientBackchannelPrefix;
    }
  }

  /**
   * POST /api/idp/token
   */
  async getToken(req: TokenRequest): Promise<TokenResponse> {
    try {
      const { data } = await this.http.post<TokenResponse>('/api/idp/token', req);
      return TokenResponseSchema.parse(data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;

        if (status === 401) {
          throw new AuthenticationException('Invalid or expired credentials', {
            cause: err,
            context: { req },
          });
        }

        throw new IdpFailedException(`Failed to get token: ${status}`, {
          cause: err,
          context: { req },
        });
      }

      throw err;
    }
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

  /**
   * GET /api/idp/projects/:projectId/project-members
   */
  async getProjectMembers(projectId: string): Promise<OwoxProjectMembersResponse> {
    if (
      !this.impersonatedIdTokenFetcher ||
      !this.c2cServiceAccountEmail ||
      !this.c2cTargetAudience ||
      !this.clientBackchannelPrefix
    ) {
      throw new IdpFailedException(
        'C2C authentication is not configured. Cannot fetch project members.',
        { context: { projectId } }
      );
    }

    const idToken = await this.impersonatedIdTokenFetcher.getIdToken(
      this.c2cServiceAccountEmail,
      this.c2cTargetAudience
    );

    try {
      const { data } = await this.http.get<unknown>(
        `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/members`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );
      return OwoxProjectMembersResponseSchema.parse(data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        throw new IdpFailedException(`Failed to fetch project members: ${status}`, {
          cause: err,
          context: { projectId, status },
        });
      }
      throw err;
    }
  }
}
