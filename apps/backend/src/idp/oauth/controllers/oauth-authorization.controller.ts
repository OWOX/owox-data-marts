import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Logger,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AuthorizationError,
  isViewOnlyPayload,
  ViewOnlyModeError,
  type AuthResult,
  type McpOAuthProjectMemberContext,
  type Payload,
} from '@owox/idp-protocol';
import type { AuthorizationContext } from '../../index';
import { IdpProviderService } from '../../services/idp-provider.service';
import { OAuthClientRegistry } from '../oauth-client.registry';
import { OAuthIdpPort, OAUTH_IDP_PORT } from '../oauth-idp.port';
import { OAuthProjectSelectionService } from '../oauth-project-selection.service';
import { OAuthProjectMemberResolver } from '../oauth-project-member.resolver';
import { OAuthRequestValidator } from '../oauth-request.validator';

@Controller('/oauth')
export class OAuthAuthorizationController {
  private readonly logger = new Logger(OAuthAuthorizationController.name);

  constructor(
    private readonly validator: OAuthRequestValidator,
    private readonly projectMemberResolver: OAuthProjectMemberResolver,
    private readonly idpProviderService: IdpProviderService,
    @Inject(OAUTH_IDP_PORT) private readonly oauthIdp: OAuthIdpPort,
    private readonly clientRegistry: OAuthClientRegistry,
    private readonly projectSelectionService: OAuthProjectSelectionService
  ) {}

  @Get('/authorize')
  async authorize(
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Res() response: Response
  ): Promise<void> {
    const validated = await this.validator.validateAuthorizationRequest(query);
    const authorizationRequest = validated.request;
    const resourceContext = validated.resourceContext;
    const provider = this.idpProviderService.getProvider(request);
    const authorization = await this.resolveAuthorizationContext(provider, request, response);
    if (!authorization) {
      return;
    }

    // View-only sessions must not mint MCP tokens: write tools would otherwise
    // bypass IdpGuard and mutate project state under the impersonated user.
    if (authorization.context.viewOnly === true) {
      throw new ViewOnlyModeError('MCP authorization is not allowed in view-only mode');
    }

    await this.clientRegistry.attachUserIfMissing(
      authorizationRequest.clientId,
      authorization.context.userId
    );

    const projects = this.projectSelectionService.filterSelectableProjects(
      await this.loadProjectsOrEmpty(provider, authorization.accessToken)
    );
    const selectedProjectId = this.getSelectedProjectId(query);
    const projectMember =
      resourceContext.kind === 'project'
        ? await this.resolveProjectHostMember(
            provider,
            authorization.context,
            projects,
            selectedProjectId,
            resourceContext.projectId
          )
        : await this.resolveSharedProjectMember(
            provider,
            authorization.context,
            projects,
            selectedProjectId,
            authorizationRequest,
            response
          );
    if (!projectMember) {
      return;
    }

    const authorizationCode = await this.oauthIdp.createAuthorizationCode(
      authorizationRequest,
      projectMember
    );
    const redirectUrl = new URL(authorizationRequest.redirectUri);
    redirectUrl.searchParams.set('code', authorizationCode.code);
    redirectUrl.searchParams.set('state', authorizationRequest.state);
    response.redirect(redirectUrl.toString());
  }

  private resolveProjectHostMember(
    provider: ReturnType<IdpProviderService['getProvider']>,
    context: AuthorizationContext,
    projects: ReturnType<OAuthProjectSelectionService['filterSelectableProjects']>,
    selectedProjectId: string | undefined,
    projectId: string
  ) {
    if (selectedProjectId && selectedProjectId !== projectId) {
      throw new BadRequestException('selected project conflicts with MCP resource');
    }

    return this.projectSelectionService.resolveProjectHostMember(
      provider,
      context,
      projects,
      projectId
    );
  }

  private async resolveSharedProjectMember(
    provider: ReturnType<IdpProviderService['getProvider']>,
    context: AuthorizationContext,
    projects: ReturnType<OAuthProjectSelectionService['filterSelectableProjects']>,
    selectedProjectId: string | undefined,
    authorizationRequest: Awaited<
      ReturnType<OAuthRequestValidator['validateAuthorizationRequest']>
    >['request'],
    response: Response
  ): Promise<McpOAuthProjectMemberContext | null> {
    if (!selectedProjectId && projects.length > 1) {
      response.type('html').send(
        this.projectSelectionService.renderSelectionPage({
          authorizationRequest,
          projects,
          currentProjectId: context.projectId,
        })
      );
      return null;
    }

    return selectedProjectId
      ? this.projectSelectionService.resolveSelectedProjectMember(
          provider,
          context,
          projects,
          selectedProjectId
        )
      : this.projectMemberResolver.resolve(context);
  }

  private async resolveAuthorizationContext(
    provider: ReturnType<IdpProviderService['getProvider']>,
    request: Request,
    response: Response
  ): Promise<{ context: AuthorizationContext; accessToken: string } | null> {
    const accessToken = this.getHeaderValue(request, 'x-owox-authorization');

    if (accessToken) {
      const payload = await provider.parseToken(accessToken);
      if (payload) {
        return { context: this.toAuthorizationContext(payload), accessToken };
      }
    }

    const refreshToken = this.getCookieValue(request, 'refreshToken');
    if (!refreshToken) {
      this.redirectToSignIn(request, response);
      return null;
    }

    try {
      const auth = await provider.refreshToken(refreshToken);
      this.persistRefreshTokenIfReturned(request, response, auth);

      const payload = await provider.parseToken(auth.accessToken);
      if (!payload) {
        this.redirectToSignIn(request, response);
        return null;
      }

      return { context: this.toAuthorizationContext(payload), accessToken: auth.accessToken };
    } catch {
      this.redirectToSignIn(request, response);
      return null;
    }
  }

  private async loadProjectsOrEmpty(
    provider: ReturnType<IdpProviderService['getProvider']>,
    accessToken: string
  ) {
    try {
      return await this.projectSelectionService.loadProjects(provider, accessToken);
    } catch {
      return [];
    }
  }

  private getSelectedProjectId(query: Record<string, unknown>): string | undefined {
    const value = query.selected_project_id;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private getHeaderValue(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private getCookieValue(request: Request, name: string): string | undefined {
    const value = request.cookies?.[name];
    return typeof value === 'string' ? value : undefined;
  }

  private persistRefreshTokenIfReturned(
    request: Request,
    response: Response,
    auth: AuthResult
  ): void {
    if (!auth.refreshToken || auth.refreshTokenExpiresIn === undefined) {
      return;
    }

    const isSecure =
      request.protocol !== 'http' &&
      !(request.hostname === 'localhost' || request.hostname === '127.0.0.1');

    response.cookie('refreshToken', auth.refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: auth.refreshTokenExpiresIn * 1000,
    });
  }

  private redirectToSignIn(request: Request, response: Response): void {
    const currentUrl = request.originalUrl || request.url;
    const host = request.get('host') ?? 'localhost';
    const signInUrl = new URL('/auth/sign-in', `${request.protocol}://${host}`);
    signInUrl.searchParams.set('redirect', currentUrl);
    signInUrl.searchParams.set('redirect-to', currentUrl);
    signInUrl.searchParams.set('app-redirect-to', currentUrl);
    this.logger.log('Redirecting OAuth authorize request to sign-in', {
      clientId: this.extractClientId(currentUrl, request, host),
      host,
      protocol: request.protocol,
    });
    response.redirect(signInUrl.pathname + signInUrl.search);
  }

  private extractClientId(currentUrl: string, request: Request, host: string): string | undefined {
    try {
      return (
        new URL(currentUrl, `${request.protocol}://${host}`).searchParams.get('client_id') ??
        undefined
      );
    } catch {
      return undefined;
    }
  }

  private toAuthorizationContext(payload: Payload): AuthorizationContext {
    if (payload.authFlow === 'api_key') {
      throw new AuthorizationError('API key authentication is not allowed for OAuth authorization');
    }

    return {
      userId: payload.userId,
      projectId: payload.projectId,
      email: payload.email,
      fullName: payload.fullName,
      avatar: payload.avatar,
      roles: payload.roles,
      projectTitle: payload.projectTitle,
      authFlow: payload.authFlow,
      apiKeyId: payload.apiKeyId,
      // Propagate only when true so normal sessions stay free of the flag.
      viewOnly: isViewOnlyPayload(payload) || undefined,
    };
  }
}
