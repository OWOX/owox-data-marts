import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { IssuedPickerTokenDto } from '../dto/domain/issued-picker-token.dto';
import { SourceCredentialBindingService } from '../connector-types/source-credential-binding.service';
import { sourceBindingFor } from '../connector-types/source-credential-definitions';
import { sourceFilePicking, type CredentialFilePicking } from '../credentials/credential.types';
import { CredentialService } from '../credentials/services/credential.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import {
  connectorSourceImplements,
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

const REFUSALS: Record<Exclude<CredentialFilePicking, 'allowed'>, string> = {
  reconnect: 'Reconnect this Credential to add spreadsheets.',
  'signer-without-edit': 'You need edit access to this Credential to add spreadsheets.',
  'other-signer':
    'Spreadsheets for this Credential are added by the person who connected its Google account. Connect your own Google account to add one.',
  'not-recorded': 'Ask a member who can edit this Credential to reconnect it.',
};

const noPicker = (credentialId: string) => `Credential ${credentialId} does not open Google Picker`;

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
  ): Promise<IssuedPickerTokenDto> {
    const { projectId, userId, roles = [] } = context;
    const credential = await this.credentials.getByIdAndProjectId(credentialId, projectId);
    const can = (action: Action) =>
      this.access.canAccess(userId, roles, EntityType.CREDENTIAL, credentialId, action, projectId);
    // One answer for a missing Credential and a hidden one, so its type stays hidden too.
    if (!(await can(Action.SEE))) {
      throw new NotFoundException(`Credential ${credentialId} was not found`);
    }
    if (
      !sourceBindingFor(connectorName, credential.definitionId)?.opensPicker ||
      !connectorSourceImplements(connectorName, 'getAccessToken')
    ) {
      throw new BadRequestException(noPicker(credentialId));
    }
    const canEdit = await can(Action.EDIT);
    // drive.file also writes to the picked files, so no one else may hold the signer's token.
    const refuse = (metadata: Parameters<typeof sourceFilePicking>[0]) => {
      const picking = sourceFilePicking(metadata, userId, canEdit);
      if (picking !== 'allowed') throw new ForbiddenException(REFUSALS[picking]);
    };
    refuse(credential.publicMetadata ?? null);
    const resolved = await this.sourceCredentials.resolveCredential(projectId, credentialId);
    // A reconnect between the two reads can change the signer of the grant read here.
    refuse(resolved.publicMetadata);
    try {
      const config = this.injector.previewBoundConfig({}, connectorName, resolved);
      const source = createConnectorPreviewSource(connectorName, config, this.logger);
      const accessToken = await withConnectorPreviewTimeout(async () => {
        if (!source.getAccessToken) throw new BadRequestException(noPicker(credentialId));
        return source.getAccessToken();
      }, PICKER_TOKEN_ERROR_MESSAGES.timeout);
      return new IssuedPickerTokenDto(accessToken);
    } catch (error) {
      throw mapConnectorPreviewError(error, this.logger, PICKER_TOKEN_ERROR_MESSAGES);
    }
  }
}
