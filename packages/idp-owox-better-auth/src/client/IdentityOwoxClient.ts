import { Projects, ProjectsSchema } from '@owox/idp-protocol';
import { ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import axios, { AxiosInstance } from 'axios';
import ms from 'ms';
import { IdentityOwoxClientConfig } from '../config/idp-owox-config.js';
import {
  AuthenticationException,
  ForbiddenException,
  IdpFailedException,
} from '../core/exceptions.js';
import {
  AuthFlowRequest,
  AuthFlowResponse,
  AuthFlowResponseSchema,
  IntrospectionRequest,
  IntrospectionResponse,
  IntrospectionResponseSchema,
  JwksResponse,
  JwksResponseSchema,
  OwoxProjectMembersResponse,
  OwoxProjectMembersResponseSchema,
  RevocationRequest,
  RevocationResponse,
  TokenRequest,
  TokenResponse,
  TokenResponseSchema,
} from './dto/index.js';

/**
 * Represents a client for interacting with the Identity OWOX API.
 * Provides methods for token management, validation, and retrieval of key sets.
 */
export class IdentityOwoxClient {
  private readonly http: AxiosInstance;
  private readonly impersonatedIdTokenFetcher?: ImpersonatedIdTokenFetcher;
  private readonly c2cServiceAccountEmail?: string;
  private readonly c2cTargetAudience?: string;
  private readonly clientBackchannelPrefix: string;

  constructor(config: IdentityOwoxClientConfig) {
    const timeout =
      typeof config.clientTimeout === 'number' ? config.clientTimeout : ms(config.clientTimeout);
    this.http = axios.create({
      baseURL: config.clientBaseUrl,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(config.defaultHeaders ?? {}),
      },
    });

    this.clientBackchannelPrefix = config.clientBackchannelPrefix;

    // Initialize service account authentication if configured
    if (config.c2cServiceAccountEmail && config.c2cTargetAudience) {
      this.impersonatedIdTokenFetcher = new ImpersonatedIdTokenFetcher();
      this.c2cServiceAccountEmail = config.c2cServiceAccountEmail;
      this.c2cTargetAudience = config.c2cTargetAudience;
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

        if (status === 403) {
          throw new ForbiddenException('Forbidden identity (inactive or blocked user)', {
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
    try {
      const resp = await this.http.post<void>('/api/idp/revocation', req);
      return { success: resp.status >= 200 && resp.status < 300 };
    } catch (err) {
      if (axios.isAxiosError(err)) {
        return { success: false };
      }
      throw err;
    }
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
   * Completes auth flow by exchanging user info for a one-time authorization code.
   * Requires service account authentication for the private internal endpoint.
   */
  async completeAuthFlow(request: AuthFlowRequest): Promise<AuthFlowResponse> {
    if (
      !this.impersonatedIdTokenFetcher ||
      !this.c2cServiceAccountEmail ||
      !this.c2cTargetAudience
    ) {
      throw new IdpFailedException(
        'Service account authentication is not configured. Cannot complete auth flow.',
        { context: { hasRequest: Boolean(request) } }
      );
    }

    try {
      const idToken = await this.impersonatedIdTokenFetcher.getIdToken(
        this.c2cServiceAccountEmail,
        this.c2cTargetAudience
      );

      const { data } = await this.http.post<AuthFlowResponse>(
        `${this.clientBackchannelPrefix}/idp/auth-flow/complete`,
        request,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );

      // Validate and return response
      return AuthFlowResponseSchema.parse(data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const responseData = err.response?.data;

        throw new IdpFailedException(`Failed to complete auth flow: ${status}`, {
          cause: err,
          context: { request, status, responseData },
        });
      }

      throw err;
    }
  }

  /**
   * GET project members via C2C (component-to-component) authentication.
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
