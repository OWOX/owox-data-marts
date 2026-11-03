import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { SourceCredentialBindingService } from '../connector-types/source-credential-binding.service';
import { sourceBindingFor } from '../connector-types/source-credential-definitions';
import { sourceFilePicking } from '../credentials/credential.types';
import { CredentialService } from '../credentials/services/credential.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import {
  createConnectorPreviewSource,
  mapConnectorPreviewError,
  withConnectorPreviewTimeout,
} from '../services/connector/connector-preview-support';
import { SourceCredentialInjectorService } from '../services/connector/source-credential-injector.service';

const PICKER_TOKEN_ERROR_MESSAGES = {
  timeout: 'Google Picker token request timed out',
  unexpected: 'Unable to issue a Google Picker token',
  unexpectedLog: 'Unexpected Google Picker token failure',
};

const OTHER_SIGNER =
  'Spreadsheets for this Credential are added by the person who connected its Google account. Connect your own Google account to add one.';

/** A fresh Google Picker token from a Credential's refresh token, for the member who signed it in. */
@Injectable()
export class IssueSourcePickerTokenService {
  private readonly logger = new Logger(IssueSourcePickerTokenService.name);

  constructor(
    private readonly credentials: CredentialService,
    private readonly access: AccessDecisionService,
    private readonly sourceCredentials: SourceCredentialBindingService,
    private readonly injector: SourceCredentialInjectorService
  ) {}

  async run(
    context: AuthorizationContext,
    connectorName: string,
    credentialId: string
  ): Promise<{ accessToken: string }> {
    const { projectId, userId, roles = [] } = context;
    const credential = await this.credentials.getByIdAndProjectId(credentialId, projectId);
    if (!sourceBindingFor(connectorName, credential.definitionId)?.opensPicker) {
      throw new BadRequestException(`Credential ${credentialId} does not open Google Picker`);
    }
    const canEdit = await this.access.canAccess(
      userId,
      roles,
      EntityType.CREDENTIAL,
      credentialId,
      Action.EDIT,
      projectId
    );
    // drive.file also writes to the picked files, so no one else may hold the signer's token.
    if (sourceFilePicking(credential.publicMetadata ?? null, userId, canEdit) !== 'allowed') {
      throw new ForbiddenException(OTHER_SIGNER);
    }
    const resolved = await this.sourceCredentials.resolveCredential(projectId, credentialId);
    try {
      const config = this.injector.previewBoundConfig({}, connectorName, resolved);
      const source = createConnectorPreviewSource(connectorName, config, this.logger);
      const accessToken = await withConnectorPreviewTimeout(
        () => source.getAccessToken!(),
        PICKER_TOKEN_ERROR_MESSAGES.timeout
      );
      return { accessToken };
    } catch (error) {
      throw mapConnectorPreviewError(error, this.logger, PICKER_TOKEN_ERROR_MESSAGES);
    }
  }
}
