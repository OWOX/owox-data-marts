import {
  type Express,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from 'express';
import { AUTH_BASE_PATH } from '../core/constants.js';
import { TemplateService } from '../services/rendering/template-service.js';
import { readQueryString } from '../utils/request-utils.js';

const DEFAULT_AUTH_ERROR_MESSAGE = 'Unable to complete sign in. Please try again.';

/**
 * Covers OAuth RFC errors, Better Auth callback errors and common provider-specific OAuth errors.
 */
const KNOWN_AUTH_ERROR_MESSAGES: Record<string, string> = {
  // OAuth/OIDC standard errors
  access_denied: 'Access was denied. Please try again and grant the required permissions.',
  invalid_request: 'The sign-in request is invalid. Please try again.',
  unauthorized_client: 'This application is not authorized for this sign-in request.',
  unsupported_response_type: 'The identity provider returned an unsupported response type.',
  invalid_scope: 'Requested permissions are invalid or unavailable.',
  server_error: 'The identity provider encountered an error. Please try again later.',
  temporarily_unavailable: 'Sign in is temporarily unavailable. Please try again later.',
  invalid_client: 'Authentication client configuration is invalid.',
  invalid_grant: 'The sign-in grant is invalid or has expired. Please try again.',
  interaction_required: 'Additional interaction is required to complete sign in.',
  login_required: 'Please sign in with your account to continue.',
  account_selection_required: 'Please select an account to continue.',
  consent_required: 'Additional consent is required to continue.',
  admin_consent_required: 'Administrator approval is required for this sign in.',
  invalid_resource: 'Requested resource is unavailable for this account.',

  // Better Auth callback errors
  signup_disabled: 'Sign up is currently disabled.',
  account_already_linked_to_different_user:
    'This social account is already linked to another user.',
  unable_to_link_account: 'Unable to link this social account. Please try again.',
  unable_to_get_user_info: 'Unable to get account data from the identity provider.',
  email_doesnt_match: 'The returned email does not match the expected account.',
  email_not_found: 'Email was not returned by the identity provider.',
  oauth_provider_not_found: 'Requested sign-in provider is not configured.',
  no_callback_url: 'Sign-in callback URL is missing.',
  no_code: 'Authorization code is missing from the callback.',
  state_mismatch: 'Sign-in state mismatch detected. Please try again.',
  state_not_found: 'Sign-in state was not found. Please restart sign in.',
  invalid_callback_request: 'OAuth callback request is invalid.',

  // Common Google and Microsoft provider error hints
  redirect_uri_mismatch: 'Authentication redirect URL configuration is incorrect.',
  org_internal: 'This sign-in is restricted to organization accounts.',
  admin_policy_enforced: 'Your organization policy blocked the requested access.',
  disallowed_useragent: 'This browser is not allowed for this sign-in flow.',
};

/**
 * Handles rendering of custom auth error page.
 */
export class AuthErrorController {
  constructor(private readonly gtmContainerId?: string) {}

  private resolveErrorMessage(errorCode: string | undefined): string {
    if (errorCode && KNOWN_AUTH_ERROR_MESSAGES[errorCode]) {
      return KNOWN_AUTH_ERROR_MESSAGES[errorCode];
    }
    return DEFAULT_AUTH_ERROR_MESSAGE;
  }

  async errorPage(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const errorCode = readQueryString(req, 'error');
    const errorMessage = this.resolveErrorMessage(errorCode);

    res.status(400).send(
      TemplateService.renderAuthError({
        heading: 'Sign in failed',
        errorMessage,
        homeHref: '/',
        homeLabel: 'Go to home',
        gtmContainerId: this.gtmContainerId,
      })
    );
  }

  registerRoutes(express: Express): void {
    express.get(`${AUTH_BASE_PATH}/error`, this.errorPage.bind(this));
  }
}
