import {
  Payload,
  Project,
  AuthResult,
  Projects,
  ProjectMember,
  ProjectMemberInvitation,
  ProjectMembershipRequest,
  ApproveMembershipRequestResult,
  Role,
  UserProvisioningSettings,
  UserProvisioningSettingsUpdate,
  UserProvisioningRequestAccessContext,
  RequestProjectAccessResult,
  CreateNewProjectResult,
} from './models.js';
import {
  McpOAuthProjectMemberContext,
  McpScope,
  McpTokenPayload,
  OAuthAuthorizationCode,
  OAuthAuthorizationRequest,
  OAuthJwksResult,
  OAuthTokenExchangeRequest,
  OAuthTokenExchangeResult,
} from './oauth.js';
import { Express, NextFunction, Request, Response } from 'express';

/**
 * Options for getting project members
 */
export interface GetProjectMembersOptions {
  /**
   * If true, always try return fresh data.
   * @default true
   */
  forceFresh?: boolean;
}

/**
 * Simplified IDP Provider interface.
 */
export interface IdpProvider {
  /**
   * Sign in middleware. This method is used to handle the sign in request and use response to send the sign in response.
   * <br/>
   * If the IDP implementation does not support sign in, this method should call the `next()` function.
   */
  signInMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;

  /**
   * Sign up middleware. This method is used to handle the user registration request and send the sign up response.
   * <br/>
   * If the IDP implementation does not support sign up, this method should call the `next()` function.
   */
  signUpMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;

  /**
   * Sign out middleware. This method is used to handle the sign out request and use response to send the sign out response.
   * <br/>
   * If the IDP implementation does not support sign out, this method should call the `next()` function.
   */
  signOutMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;

  /**
   * Access token middleware. This method is used to handle the access token request and use response to send the access token response.
   * <br/>
   * If the IDP implementation does not support access token, this method should call the `next()` function.
   */
  accessTokenMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response>;

  /**
   * User api middleware. This method is used to handle the user request and use response to send the user response.
   * <br/>
   * If the IDP implementation does not support user, this method should call the `next()` function.
   */
  userApiMiddleware(req: Request, res: Response, next: NextFunction): Promise<Response<Payload>>;

  /**
   * Projects api middleware. This method is used to handle the projects request and use response to send the projects response.
   * <br/>
   * If the IDP implementation does not support user, this method should call the `next()` function.
   */
  projectsApiMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<Response<Projects>>;

  /**
   * Return projects available to the bearer access token owner.
   */
  getProjects(accessToken: string): Promise<Projects>;

  /**
   * Return one project available to a user. Intended for trusted backend-to-IDP
   * calls where the caller already has an authenticated user and project context.
   */
  getProjectForUser(userId: string, projectId: string): Promise<Project>;

  /**
   * Register routes with the express app.
   * @param app - The express app to register the routes with.
   * @param basePath - The base path to register the routes with.
   */
  registerRoutes(app: Express): void;

  /**
   * Introspect a token
   * @param token - The token to introspect
   * @returns The token payload
   */
  introspectToken(token: string): Promise<Payload | null>;

  /**
   * Parse a token
   * @param token - The token to parse
   * @returns The token payload
   */
  parseToken(token: string): Promise<Payload | null>;

  /**
   * Refresh a token
   * @param refreshToken - The refresh token to use for the refresh
   * @returns The authentication result
   */
  refreshToken(refreshToken: string): Promise<AuthResult>;

  /**
   * Issue an ODM access token after the backend has validated a project member API key.
   *
   * `role` and `readOnly` are compatibility parameters and are not used by the
   * current exchange flow. Providers should issue tokens from the current
   * project membership, not from API-key metadata.
   */
  issueAccessTokenForProjectMemberApiKey(
    apiKeyId: string,
    userId: string,
    projectId: string,
    role: Role | null,
    readOnly: boolean
  ): Promise<AuthResult>;

  /**
   * Create an MCP OAuth authorization code for an already authenticated
   * project-member context.
   *
   * Implementations that do not support hosted MCP OAuth should throw
   * `IdpOperationNotSupportedError`.
   */
  createMcpOAuthAuthorizationCode(
    request: OAuthAuthorizationRequest,
    projectMember: McpOAuthProjectMemberContext
  ): Promise<OAuthAuthorizationCode>;

  /**
   * Exchange an MCP OAuth authorization code or refresh token for an MCP
   * access token.
   *
   * Implementations that do not support hosted MCP OAuth should throw
   * `IdpOperationNotSupportedError`.
   */
  exchangeMcpOAuthToken(request: OAuthTokenExchangeRequest): Promise<OAuthTokenExchangeResult>;

  /**
   * Verify an MCP access token for a protected resource and required scopes.
   *
   * Implementations that do not support MCP token verification should return
   * `null` so callers can treat the token as invalid for MCP.
   */
  verifyMcpAccessToken(
    token: string,
    resource: string,
    requiredScopes: McpScope[]
  ): Promise<McpTokenPayload | null>;

  /**
   * Return JWKS used for MCP access-token verification when tokens are JWTs.
   *
   * Implementations that do not expose JWKS should throw
   * `IdpOperationNotSupportedError`.
   */
  getMcpOAuthJwks(): Promise<OAuthJwksResult>;

  /**
   * Revoke a token. In different IDP implementations, this may have different token types.
   * @param token - The token to revoke
   */
  revokeToken(token: string): Promise<void>;

  /**
   * Initialize the IDP. Create resources, connect to databases, etc.
   */
  initialize(): Promise<void>;

  /**
   * Health probe for the IDP. Check if the IDP is healthy to handle requests.
   */
  isHealthy(): Promise<boolean>;

  /**
   * Shutdown the IDP, close all connections and release resources
   */
  shutdown(): Promise<void>;

  /**
   * Get list of project members for a specific project
   * @param projectId - The project ID to get members for
   * @param options - Optional settings for controlling freshness
   * @returns Array of project members with their details
   */
  getProjectMembers(
    projectId: string,
    options?: GetProjectMembersOptions
  ): Promise<ProjectMember[]>;

  /**
   * Invite a new member to a project by email with the given role.
   * `actorUserId` is the BI uid of the admin performing the invite — the
   * remote IDP may require it for audit / authorization. Pure local providers
   * (better-auth / none) may ignore it.
   *
   * The returned shape depends on provider semantics:
   *  - `kind: 'email-sent'` — the provider has delivered the invitation email itself.
   *  - `kind: 'magic-link'` — the provider produced a link that the caller must deliver.
   *
   * Implementations that do not support invitations should throw
   * `IdpOperationNotSupportedError`.
   */
  inviteMember(
    projectId: string,
    email: string,
    role: Role,
    actorUserId: string
  ): Promise<ProjectMemberInvitation>;

  /**
   * Remove a member from a project. Idempotent where possible; if the member
   * does not exist, implementations should still complete successfully.
   * `actorUserId` identifies the admin performing the removal.
   *
   * Implementations that do not support removal should throw
   * `IdpOperationNotSupportedError`.
   */
  removeMember(projectId: string, userId: string, actorUserId: string): Promise<void>;

  /**
   * Change a member's role within a project. The new role must be one of the
   * values supported by the shared `RoleEnum`. `actorUserId` identifies the
   * admin performing the change.
   *
   * Implementations that do not support role changes should throw
   * `IdpOperationNotSupportedError`.
   */
  changeMemberRole(
    projectId: string,
    userId: string,
    newRole: Role,
    actorUserId: string
  ): Promise<void>;

  /**
   * Get user provisioning settings for a project. `actorUserId` identifies the
   * current BI user so providers backed by OWOX analytics can perform
   * project-level authorization.
   *
   * Implementations that do not support user provisioning should return
   * `isApplicable: false` with null organization and settings.
   */
  getUserProvisioningSettings(
    projectId: string,
    actorUserId: string
  ): Promise<UserProvisioningSettings>;

  /**
   * Update user provisioning settings for a project. `actorUserId` identifies
   * the admin performing the change.
   *
   * Implementations that do not support user provisioning updates should throw
   * `IdpOperationNotSupportedError`.
   */
  updateUserProvisioningSettings(
    projectId: string,
    actorUserId: string,
    settings: UserProvisioningSettingsUpdate
  ): Promise<UserProvisioningSettings>;

  /**
   * List pending membership requests for a project.
   *
   * `actorUserId` is the BI uid of the admin performing the listing — the
   * remote IDP needs it for audit / authorization (Java sends it as the
   * `biUserId` query parameter on
   * `GET /internal-api/idp/bi-project/{biProjectId}/membership-requests`).
   *
   * Local-only providers (null, better-auth) ignore `actorUserId` and return
   * `[]` rather than throw — an empty list is a valid steady state.
   */
  listMembershipRequests(
    projectId: string,
    actorUserId: string,
    options?: { forceFresh?: boolean }
  ): Promise<ProjectMembershipRequest[]>;

  /**
   * Approve a pending membership request and add the requester to the project
   * with the given role. Must return the resolved `userId` so the caller can
   * apply scope/contexts locally. Implementations that do not support this
   * should throw `IdpOperationNotSupportedError`.
   */
  approveMembershipRequest(
    projectId: string,
    requestId: string,
    role: Role,
    actorUserId: string
  ): Promise<ApproveMembershipRequestResult>;

  /**
   * Decline a pending membership request. Idempotent where possible; if the
   * request is already gone, implementations should still complete
   * successfully. Implementations that do not support this should throw
   * `IdpOperationNotSupportedError`.
   */
  declineMembershipRequest(
    projectId: string,
    requestId: string,
    actorUserId: string
  ): Promise<void>;

  /**
   * Get request-access context for the authenticated user and target project.
   *
   * Implementations that do not support OWOX-managed user provisioning should
   * throw `IdpOperationNotSupportedError`.
   */
  getUserProvisioningRequestAccessContext(
    userId: string,
    projectId: string
  ): Promise<UserProvisioningRequestAccessContext>;

  /**
   * Request access to the project for a user authenticated
   * without project roles.
   *
   * Implementations that do not support OWOX-managed user provisioning should
   * throw `IdpOperationNotSupportedError`.
   */
  requestProjectAccess(
    userId: string,
    projectId: string,
    role: Role
  ): Promise<RequestProjectAccessResult>;

  /**
   * Create a new project for the user from request-access flow.
   *
   * Implementations that do not support OWOX-managed user provisioning should
   * throw `IdpOperationNotSupportedError`.
   */
  createNewProject(userId: string, integration: string): Promise<CreateNewProjectResult>;
}
