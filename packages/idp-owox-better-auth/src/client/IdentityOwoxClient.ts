import { Project, ProjectSchema, Projects, ProjectsSchema } from '@owox/idp-protocol';
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
  McpOAuthAuthorizationCodeRequest,
  McpOAuthAuthorizationCodeRequestSchema,
  McpOAuthAuthorizationCodeResponse,
  McpOAuthAuthorizationCodeResponseSchema,
  McpOAuthTokenExchangeRequest,
  McpOAuthTokenExchangeRequestSchema,
  McpOAuthTokenExchangeResponse,
  McpOAuthTokenExchangeResponseSchema,
  McpOAuthTokenVerificationRequest,
  McpOAuthTokenVerificationRequestSchema,
  McpOAuthTokenVerificationResponseSchema,
  OwoxApproveMembershipRequestResponse,
  OwoxApproveMembershipRequestResponseSchema,
  OwoxInviteProjectMemberResponse,
  OwoxInviteProjectMemberResponseSchema,
  OwoxListMembershipRequestsResponse,
  OwoxListMembershipRequestsResponseSchema,
  OwoxProjectMembersResponse,
  OwoxProjectMembersResponseSchema,
  ProjectMemberApiKeyAuthFlowRequest,
  ProjectMemberApiKeyAuthFlowRequestSchema,
  OwoxCreateNewProjectResponse,
  OwoxCreateNewProjectResponseSchema,
  OwoxRequestProjectAccessRequestSchema,
  OwoxRequestProjectAccessResponse,
  OwoxRequestProjectAccessResponseSchema,
  OwoxUpdateUserProvisioningSettingsRequest,
  OwoxUpdateUserProvisioningSettingsRequestSchema,
  OwoxUserProvisioningRequestAccessContextResponse,
  OwoxUserProvisioningRequestAccessContextResponseSchema,
  OwoxUserProvisioningSettingsResponse,
  OwoxUserProvisioningSettingsResponseSchema,
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

    this.clientBackchannelPrefix = config.clientBackchannelPrefix.replace(/\/+$/, '');

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
    const authHeader = await this.getC2cAuthHeader('exchange Google identity token', { req });

    try {
      const { data } = await this.http.post<TokenResponse>(
        `${this.clientBackchannelPrefix}/idp/auth-flow/extension/identity`,
        req,
        { headers: authHeader }
      );
      return TokenResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(err, { req }, 'Failed to exchange Google identity token');
    }
  }

  /**
   * POST /idp/auth-flow/project-member-api-key
   */
  async issueAccessTokenForProjectMemberApiKey(
    req: ProjectMemberApiKeyAuthFlowRequest
  ): Promise<TokenResponse> {
    const parsed = ProjectMemberApiKeyAuthFlowRequestSchema.parse(req);
    const authHeader = await this.getC2cAuthHeader('issue project member API key token', {
      projectId: parsed.projectId,
      userId: parsed.userId,
      apiKeyId: parsed.apiKeyId,
      hasRole: parsed.role !== null,
    });
    const body = {
      projectId: parsed.projectId,
      userId: parsed.userId,
      ...(parsed.role === null ? {} : { roles: [parsed.role] }),
      readOnly: parsed.readOnly,
      apiKeyId: parsed.apiKeyId,
    };

    try {
      const { data } = await this.http.post<TokenResponse>(
        `${this.clientBackchannelPrefix}/idp/auth-flow/project-member-api-key`,
        body,
        { headers: authHeader }
      );
      return TokenResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(err, { req }, 'Failed to issue project member API key token');
    }
  }

  /**
   * POST /idp/oauth/authorization-code.
   */
  async createMcpOAuthAuthorizationCode(
    req: McpOAuthAuthorizationCodeRequest
  ): Promise<McpOAuthAuthorizationCodeResponse> {
    const parsed = McpOAuthAuthorizationCodeRequestSchema.parse(req);
    const authHeader = await this.getC2cAuthHeader('create MCP OAuth authorization code', {
      clientId: parsed.request.clientId,
      projectId: parsed.projectMember.projectId,
      userId: parsed.projectMember.userId,
    });

    try {
      const { data } = await this.http.post<unknown>(
        `${this.clientBackchannelPrefix}/idp/oauth/authorization-code`,
        parsed,
        { headers: authHeader }
      );
      return McpOAuthAuthorizationCodeResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(err, { req }, 'Failed to create MCP OAuth authorization code');
    }
  }

  /**
   * POST /idp/oauth/token.
   */
  async exchangeMcpOAuthToken(
    req: McpOAuthTokenExchangeRequest
  ): Promise<McpOAuthTokenExchangeResponse> {
    const parsed = McpOAuthTokenExchangeRequestSchema.parse(req);
    const authHeader = await this.getC2cAuthHeader('exchange MCP OAuth token', {
      grantType: parsed.grantType,
      clientId: parsed.clientId,
      resource: parsed.resource,
    });

    try {
      const { data } = await this.http.post<unknown>(
        `${this.clientBackchannelPrefix}/idp/oauth/token`,
        parsed,
        { headers: authHeader }
      );
      return McpOAuthTokenExchangeResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(err, { req }, 'Failed to exchange MCP OAuth token');
    }
  }

  /**
   * POST /idp/oauth/token/verify.
   */
  async verifyMcpAccessToken(req: McpOAuthTokenVerificationRequest) {
    const parsed = McpOAuthTokenVerificationRequestSchema.parse(req);
    const authHeader = await this.getC2cAuthHeader('verify MCP access token', {
      resource: parsed.resource,
      requiredScopes: parsed.requiredScopes,
    });

    try {
      const { data } = await this.http.post<unknown>(
        `${this.clientBackchannelPrefix}/idp/oauth/token/verify`,
        parsed,
        { headers: authHeader }
      );
      const result = McpOAuthTokenVerificationResponseSchema.parse(data);
      return result.active ? result.payload : null;
    } catch (err) {
      this.handleAxiosError(err, { req }, 'Failed to verify MCP access token');
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
   * GET one project for a user via C2C (component-to-component) authentication.
   */
  async getProjectForUser(userId: string, projectId: string): Promise<Project> {
    const authHeader = await this.getC2cAuthHeader('fetch project for user', {
      userId,
      projectId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/users/${encodeURIComponent(
      userId
    )}/projects/${encodeURIComponent(projectId)}`;

    try {
      const { data } = await this.http.get<Project>(url, { headers: authHeader });
      return ProjectSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(err, { userId, projectId }, 'Failed to fetch project for user');
    }
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
    const authHeader = await this.getC2cAuthHeader('complete auth flow', {
      hasRequest: Boolean(request),
    });

    try {
      const { data } = await this.http.post<AuthFlowResponse>(
        `${this.clientBackchannelPrefix}/idp/auth-flow/complete`,
        request,
        { headers: authHeader }
      );
      return AuthFlowResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(err, { request }, 'Failed to complete auth flow');
    }
  }

  /**
   * GET project members via C2C (component-to-component) authentication.
   */
  async getProjectMembers(projectId: string): Promise<OwoxProjectMembersResponse> {
    const authHeader = await this.getC2cAuthHeader('fetch project members', { projectId });

    try {
      const { data } = await this.http.get<unknown>(
        `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/members`,
        { headers: authHeader }
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
    const authHeader = await this.getC2cAuthHeader('invite project member', {
      projectId,
      email,
      role,
      actorUserId,
    });

    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/members`;
    const body = { biUserId: actorUserId, inviteeEmail: email, role };

    try {
      const { data } = await this.http.post<unknown>(url, body, { headers: authHeader });
      return OwoxInviteProjectMemberResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(err, { projectId, email, role }, 'Failed to invite project member');
    }
  }

  /**
   * DELETE /idp/bi-project/:projectId/members/:userId — remove a member.
   * See `inviteProjectMember` for path rationale.
   */
  async removeProjectMember(projectId: string, userId: string, actorUserId: string): Promise<void> {
    const authHeader = await this.getC2cAuthHeader('remove project member', {
      projectId,
      userId,
      actorUserId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/members/${userId}`;
    const body = { biUserId: actorUserId };

    try {
      // Java contract requires `biUserId` in the request body even for DELETE —
      // axios forwards it via the `data` option.
      await this.http.delete(url, { headers: authHeader, data: body });
    } catch (err) {
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
    const authHeader = await this.getC2cAuthHeader('change project member role', {
      projectId,
      userId,
      newRole,
      actorUserId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/members/${userId}/role`;
    const body = { biUserId: actorUserId, role: newRole };

    try {
      await this.http.put(url, body, { headers: authHeader });
    } catch (err) {
      this.handleAxiosError(
        err,
        { projectId, userId, newRole },
        'Failed to change project member role'
      );
    }
  }

  /**
   * GET /idp/bi-project/:projectId/user-provisioning-settings.
   * See `inviteProjectMember` for C2C backchannel rationale.
   */
  async getUserProvisioningSettings(
    projectId: string,
    actorUserId: string
  ): Promise<OwoxUserProvisioningSettingsResponse> {
    const authHeader = await this.getC2cAuthHeader('fetch user provisioning settings', {
      projectId,
      actorUserId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/user-provisioning-settings`;

    try {
      const { data } = await this.http.get<unknown>(url, {
        headers: authHeader,
        params: { biUserId: actorUserId },
      });
      return OwoxUserProvisioningSettingsResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(
        err,
        { projectId, actorUserId },
        'Failed to fetch user provisioning settings'
      );
    }
  }

  /**
   * PUT /idp/bi-project/:projectId/user-provisioning-settings.
   * See `inviteProjectMember` for C2C backchannel rationale.
   */
  async updateUserProvisioningSettings(
    projectId: string,
    actorUserId: string,
    settings: OwoxUpdateUserProvisioningSettingsRequest
  ): Promise<OwoxUserProvisioningSettingsResponse> {
    const authHeader = await this.getC2cAuthHeader('update user provisioning settings', {
      projectId,
      actorUserId,
      settings,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/user-provisioning-settings`;
    const parsedSettings = OwoxUpdateUserProvisioningSettingsRequestSchema.parse(settings);
    const body = { biUserId: actorUserId, ...parsedSettings };

    try {
      const { data } = await this.http.put<unknown>(url, body, { headers: authHeader });
      return OwoxUserProvisioningSettingsResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(
        err,
        { projectId, actorUserId, settings },
        'Failed to update user provisioning settings'
      );
    }
  }

  /**
   * GET /idp/bi-project/:projectId/membership-requests — list pending requests.
   *
   * `actorUserId` is forwarded as the `biUserId` query parameter as required
   * by the Java contract.
   */
  async listProjectMembershipRequests(
    projectId: string,
    actorUserId: string
  ): Promise<OwoxListMembershipRequestsResponse> {
    const authHeader = await this.getC2cAuthHeader('list project membership requests', {
      projectId,
      actorUserId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/membership-requests`;
    try {
      const { data } = await this.http.get<unknown>(url, {
        headers: authHeader,
        params: { biUserId: actorUserId },
      });
      return OwoxListMembershipRequestsResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(
        err,
        { projectId, actorUserId },
        'Failed to list project membership requests'
      );
    }
  }

  /**
   * POST /idp/bi-project/:projectId/membership-requests/:requestId/approve.
   *
   * Response: 200 OK with body `{ userUid: string }` — the resolved user uid
   * of the approved requester. `MembershipRequestsService` maps `userUid → userId`
   * on `ApproveMembershipRequestResult`.
   */
  async approveProjectMembershipRequest(
    projectId: string,
    requestId: string,
    role: string,
    actorUserId: string
  ): Promise<OwoxApproveMembershipRequestResponse> {
    const authHeader = await this.getC2cAuthHeader('approve project membership request', {
      projectId,
      requestId,
      role,
      actorUserId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/membership-requests/${requestId}/approve`;
    const body = { biUserId: actorUserId, role };
    try {
      const { data } = await this.http.post<unknown>(url, body, { headers: authHeader });
      return OwoxApproveMembershipRequestResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(
        err,
        { projectId, requestId, role },
        'Failed to approve project membership request'
      );
    }
  }

  /**
   * POST /idp/bi-project/:projectId/membership-requests/:requestId/decline.
   * See `listProjectMembershipRequests` for wiring status.
   */
  async declineProjectMembershipRequest(
    projectId: string,
    requestId: string,
    actorUserId: string
  ): Promise<void> {
    const authHeader = await this.getC2cAuthHeader('decline project membership request', {
      projectId,
      requestId,
      actorUserId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/membership-requests/${requestId}/decline`;
    const body = { biUserId: actorUserId };
    try {
      await this.http.post(url, body, { headers: authHeader });
    } catch (err) {
      this.handleAxiosError(
        err,
        { projectId, requestId, actorUserId },
        'Failed to decline project membership request'
      );
    }
  }

  /**
   * GET /idp/bi-project/:projectId/user-provisioning/request-access-context.
   */
  async getUserProvisioningRequestAccessContext(
    userUid: string,
    projectId: string
  ): Promise<OwoxUserProvisioningRequestAccessContextResponse> {
    const authHeader = await this.getC2cAuthHeader('get user provisioning request-access context', {
      userUid,
      projectId,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/user-provisioning/request-access-context`;

    try {
      const { data } = await this.http.get<unknown>(url, {
        headers: authHeader,
        params: {
          biUserId: userUid,
        },
      });
      return OwoxUserProvisioningRequestAccessContextResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(
        err,
        { userUid, projectId },
        'Failed to get user provisioning request-access context'
      );
    }
  }

  /**
   * POST /idp/bi-project/:projectId/user-provisioning/request-access.
   */
  async requestProjectAccess(
    userUid: string,
    projectId: string,
    role: string
  ): Promise<OwoxRequestProjectAccessResponse> {
    const authHeader = await this.getC2cAuthHeader('request project access', {
      userUid,
      projectId,
      role,
    });
    const url = `${this.clientBackchannelPrefix}/idp/bi-project/${projectId}/user-provisioning/request-access`;
    const body = OwoxRequestProjectAccessRequestSchema.parse({ biUserId: userUid, role });

    try {
      const { data } = await this.http.post<unknown>(url, body, { headers: authHeader });
      return OwoxRequestProjectAccessResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(err, { userUid, projectId, role }, 'Failed to request project access');
    }
  }

  /**
   * POST /idp/user-provisioning/create-new-project.
   */
  async createNewProject(
    userUid: string,
    integration: string
  ): Promise<OwoxCreateNewProjectResponse> {
    const authHeader = await this.getC2cAuthHeader('create new project', {
      userUid,
      integration,
    });
    const url = `${this.clientBackchannelPrefix}/idp/user-provisioning/create-new-project`;
    const body = { biUserId: userUid, integration };

    try {
      const { data } = await this.http.post<unknown>(url, body, { headers: authHeader });
      return OwoxCreateNewProjectResponseSchema.parse(data);
    } catch (err) {
      this.handleAxiosError(err, { userUid, integration }, 'Failed to create new project');
    }
  }

  /**
   * Validate the C2C configuration and mint an `Authorization` header for a
   * single backchannel call. Used by every method that hits the OWOX Identity
   * service over service-to-service auth — keeps the preflight (check + token
   * fetch) in one place so future additions to the C2C config surface in one
   * spot, not nine.
   */
  private async getC2cAuthHeader(
    operationLabel: string,
    context: Record<string, unknown>
  ): Promise<{ Authorization: string }> {
    if (
      !this.impersonatedIdTokenFetcher ||
      !this.c2cServiceAccountEmail ||
      !this.c2cTargetAudience
    ) {
      throw new IdpFailedException(
        `C2C authentication is not configured. Cannot ${operationLabel}.`,
        { context }
      );
    }
    const idToken = await this.impersonatedIdTokenFetcher.getIdToken(
      this.c2cServiceAccountEmail,
      this.c2cTargetAudience
    );
    return { Authorization: `Bearer ${idToken}` };
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
