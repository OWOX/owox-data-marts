import { Injectable } from '@nestjs/common';
import { GoogleOAuthFlowService } from '../../services/google-oauth/google-oauth-flow.service';
import { RedirectBackAllowlistService } from '../../services/google-oauth/redirect-back-allowlist.service';
import { DataDestinationCredentialService } from '../../services/data-destination-credential.service';
import { CreateDataDestinationService } from '../create-data-destination.service';
import { CreateDataDestinationCommand } from '../../dto/domain/create-data-destination.command';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { InvalidOAuthStateException } from '../../exceptions/google-oauth.exceptions';

export interface FinishMcpGoogleSheetsSetupResult {
  destinationId: string;
  redirectTo?: string;
}

/**
 * Finishes an MCP-initiated Google Sheets destination setup: exchanges the Google
 * authorization code, creates the destination, and returns a sanitized redirect target.
 * Unauthenticated by design — the state JWT signature (verified inside
 * GoogleOAuthFlowService) is the sole authorization; userId/projectId come from that
 * signed payload, never from caller-supplied input.
 */
@Injectable()
export class FinishMcpGoogleSheetsSetupService {
  constructor(
    private readonly googleOAuthFlowService: GoogleOAuthFlowService,
    private readonly createDataDestinationService: CreateDataDestinationService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    private readonly redirectBackAllowlist: RedirectBackAllowlistService
  ) {}

  async run(code: string, state: string): Promise<FinishMcpGoogleSheetsSetupResult> {
    const statePayload = this.googleOAuthFlowService.validateStateToken(state);
    if (!statePayload.mcpUserId) {
      throw new InvalidOAuthStateException('Not an MCP destination setup state token');
    }

    const exchangeResult = await this.googleOAuthFlowService.exchangeAuthorizationCode(
      code,
      state,
      statePayload.mcpUserId,
      statePayload.projectId
    );

    try {
      const destination = await this.createDataDestinationService.run(
        new CreateDataDestinationCommand(
          statePayload.projectId,
          statePayload.mcpTitle ?? 'Google Sheets MCP Destination',
          DataDestinationType.GOOGLE_SHEETS,
          statePayload.mcpUserId,
          undefined,
          exchangeResult.credentialId,
          undefined,
          undefined,
          []
        )
      );

      return {
        destinationId: destination.id,
        redirectTo: this.redirectBackAllowlist.sanitize(statePayload.mcpRedirectBack),
      };
    } catch (error) {
      // The credential row was already created by exchangeAuthorizationCode above.
      // Clean it up rather than leaving a dangling, never-referenced credential.
      await this.dataDestinationCredentialService.softDelete(exchangeResult.credentialId);
      throw error;
    }
  }
}
