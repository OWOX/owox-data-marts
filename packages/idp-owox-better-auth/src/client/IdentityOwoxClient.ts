import { Projects, ProjectsSchema } from '@owox/idp-protocol';
import { ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import axios, { AxiosInstance } from 'axios';
import ms from 'ms';
import { IdentityOwoxClientConfig } from '../config/idp-owox-config.js';
import {
  AuthenticationException,
  ForbiddenException,
  IdentityApiException,
  IdpFailedException,
  IdpNotFoundException,
} from '../core/exceptions.js';
import {
  AuthFlowRequest,
  AuthFlowResponse,
  AuthFlowResponseSchema,
  GoogleIdentityExchangeRequest,
  IntrospectionRequest,
  IntrospectionResponse,
  IntrospectionResponseSchema,
  JwksResponse,
  JwksResponseSchema,
  OwoxInviteProjectMemberResponse,
  OwoxInviteProjectMemberResponseSchema,
  OwoxProjectMembersResponse,
  OwoxProjectMembersResponseSchema,
  RevocationRequest,
  RevocationResponse,
  TokenRequest,
  TokenResponse,
  TokenResponseSchema,
} from './dto/index.js';
import { createServiceLogger } from '../core/logger.js';

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
  private readonly logger = createServiceLogger(IdentityOwoxClient.name);

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
      this.handleAxiosError(err, { req }, 'Failed to get token');
    }
  }

  /**
   * POST auth-flow/extension/identity
   */
  async exchangeGoogleIdentityToken(req: GoogleIdentityExchangeRequest): Promise<TokenResponse> {
    if (
      !this.impersonatedIdTokenFetcher ||
      !this.c2cServiceAccountEmail ||
      !this.c2cTargetAudience ||
      !this.clientBackchannelPrefix
    ) {
      throw new IdpFailedException(
        'C2C authentication is not configured. Cannot exchange Google identity token.',
        { context: { req } }
      );
    }

    try {
      const idToken = await this.impersonatedIdTokenFetcher.getIdToken(
        this.c2cServiceAccountEmail,
        this.c2cTargetAudience
      );

      const { data } = await this.http.post<TokenResponse>(
        `${this.clientBackchannelPrefix}/idp/auth-flow/extension/identity`,
        req,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );
      return TokenResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(err, { req }, 'Failed to exchange Google identity token');
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
      this.handleAxiosError(err, { request }, 'Failed to complete auth flow');
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
      this.handleAxiosError(err, { projectId }, 'Failed to fetch project members');
    }
  }

  /**
   * POST /idp/bi-project/:projectId/members — invite a new member by email.
   *
   * The Java endpoint owns validation, duplicate detection, email delivery and
   * pending-user provisioning. It returns the resolved userUid (new or
   * pre-existing) so callers can attach authorization scope immediately.
   *
   * Path mirrors the existing `getProjectMembers` (GET on the same collection)
   * on the C2C backchannel — the public `/api/idp/projects/...` variant is
   * user-JWT authed and not reachable from this service-to-service client.
   */
  async inviteProjectMember(
    projectId: string,
    email: string,
    role: string,
    actorUserId: string
  ): Promise<OwoxInviteProjectMemberResponse> {
    const idToken = await this.getC2cIdToken('inviteProjectMember', {
      projectId,
      email,
      role,
      actorUserId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/members`;
    const body = { biUserId: actorUserId, inviteeEmail: email, role };

    // TODO(stage4-idp-proxy-debug): temporary verbose logging while we verify
    // the Java wiring in staging. Drop once remove/invite flows are stable.
    this.logger.info('inviteProjectMember → request', { method: 'POST', url, body });

    try {
      const { data, status } = await this.http.post<unknown>(url, body, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      this.logger.info('inviteProjectMember ← response', { status, data });
      return OwoxInviteProjectMemberResponseSchema.parse(data);
    } catch (err) {
      this.logger.warn('inviteProjectMember ← error', {
        url,
        body,
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
        responseData: axios.isAxiosError(err) ? err.response?.data : undefined,
      });
      this.handleAxiosError(err, { projectId, email, role }, 'Failed to invite project member');
    }
  }

  /**
   * DELETE /idp/bi-project/:projectId/members/:userId — remove a member.
   * See `inviteProjectMember` for path rationale.
   */
  async removeProjectMember(projectId: string, userId: string, actorUserId: string): Promise<void> {
    const idToken = await this.getC2cIdToken('removeProjectMember', {
      projectId,
      userId,
      actorUserId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/members/${userId}`;
    const body = { biUserId: actorUserId };

    this.logger.info('removeProjectMember → request', {
      method: 'DELETE',
      url,
      projectId,
      userId,
      body,
    });

    try {
      // Java contract requires `biUserId` in the request body even for DELETE —
      // axios forwards it via the `data` option.
      const { status } = await this.http.delete(url, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        data: body,
      });
      this.logger.info('removeProjectMember ← response', { status });
    } catch (err) {
      this.logger.warn('removeProjectMember ← error', {
        url,
        body,
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
        responseData: axios.isAxiosError(err) ? err.response?.data : undefined,
      });
      this.handleAxiosError(
        err,
        { projectId, userId, actorUserId },
        'Failed to remove project member'
      );
    }
  }

  /**
   * PUT /idp/bi-project/:projectId/members/:userId/role — change a member's role.
   * See `inviteProjectMember` for path rationale.
   */
  async changeProjectMemberRole(
    projectId: string,
    userId: string,
    newRole: string,
    actorUserId: string
  ): Promise<void> {
    const idToken = await this.getC2cIdToken('changeProjectMemberRole', {
      projectId,
      userId,
      newRole,
      actorUserId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/members/${userId}/role`;
    const body = { biUserId: actorUserId, role: newRole };

    this.logger.info('changeProjectMemberRole → request', { method: 'PUT', url, body });

    try {
      const { status } = await this.http.put(url, body, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      this.logger.info('changeProjectMemberRole ← response', { status });
    } catch (err) {
      this.logger.warn('changeProjectMemberRole ← error', {
        url,
        body,
        status: axios.isAxiosError(err) ? err.response?.status : undefined,
        responseData: axios.isAxiosError(err) ? err.response?.data : undefined,
      });
      this.handleAxiosError(
        err,
        { projectId, userId, newRole },
        'Failed to change project member role'
      );
    }
  }

  /**
   * Resolve the C2C impersonated id token used by project-members mutation
   * endpoints. Centralised here so the three admin-only methods above share a
   * single "is C2C configured?" guard and logging path.
   */
  private async getC2cIdToken(
    operation: string,
    context: Record<string, unknown>
  ): Promise<string> {
    if (
      !this.impersonatedIdTokenFetcher ||
      !this.c2cServiceAccountEmail ||
      !this.c2cTargetAudience ||
      !this.clientBackchannelPrefix
    ) {
      throw new IdpFailedException(
        `C2C authentication is not configured. Cannot perform ${operation}.`,
        { context }
      );
    }

    return this.impersonatedIdTokenFetcher.getIdToken(
      this.c2cServiceAccountEmail,
      this.c2cTargetAudience
    );
  }

  private handleAxiosError(
    error: unknown,
    context: Record<string, unknown>,
    defaultMessage: string
  ): never {
    if (!axios.isAxiosError(error)) {
      throw error;
    }

    const status = error.response?.status;
    const rawBody = error.response?.data;

    // Handle specific status codes.
    switch (status) {
      case 400:
        throw new IdentityApiException('Bad request', {
          cause: error,
          context: { ...context, body: rawBody },
          status: 400,
        });
      case 401:
        throw new AuthenticationException('Invalid or expired credentials', {
          cause: error,
          context,
          status,
          description:
            typeof rawBody === 'object' && rawBody !== null && 'error' in rawBody
              ? ((rawBody as Record<string, unknown>).description as string | null | undefined)
              : undefined,
        });
      case 403:
        throw new ForbiddenException('Identity inactive or blocked', {
          cause: error,
          context,
          status,
        });
      case 404:
        throw new IdpNotFoundException('Upstream resource not found', {
          cause: error,
          context: { ...context, responseData: rawBody },
          status,
        });
      default:
        throw new IdpFailedException(`${defaultMessage}${status ? `: ${status}` : ''}`, {
          cause: error,
          context: { ...context, responseData: rawBody },
          status,
        });
    }
  }
}
