import { Injectable } from '@nestjs/common';
import { DataDestination } from '../../../entities/data-destination.entity';
import { DataDestinationCredentialService } from '../../../services/data-destination-credential.service';
import { DestinationCredentialType } from '../../../enums/destination-credential-type.enum';
import { FolderAccessFailure, GoogleSheetsApiAdapter } from '../adapters/google-sheets-api.adapter';
import { GoogleSheetsCredentialsSchema } from '../schemas/google-sheets-credentials.schema';
import { DestinationFolderAccessException } from '../../../exceptions/google-oauth.exceptions';

/**
 * Validates, at destination save time, that a Google Sheets destination's
 * configured Drive folder is usable for Service-Account auto-creation.
 *
 * No-op when: no folder is configured, or the destination is not a Service
 * Account (OAuth folder selection is handled via the Drive Picker, not a typed
 * folder ID). When it does run, the folder must be a folder, in a Shared Drive,
 * that the service account can add files to — otherwise it throws so the save
 * fails fast.
 */
@Injectable()
export class GoogleSheetsFolderValidator {
  constructor(private readonly credentialService: DataDestinationCredentialService) {}

  async validateConfiguredFolder(destination: DataDestination): Promise<void> {
    const folderId = destination.config?.folderId?.trim();
    if (!folderId || !destination.credentialId) {
      return;
    }

    const credential = await this.credentialService.getById(destination.credentialId);
    if (!credential || credential.type !== DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT) {
      return;
    }

    const parsed = GoogleSheetsCredentialsSchema.safeParse(credential.credentials);
    const serviceAccountKey = parsed.success ? parsed.data.serviceAccountKey : undefined;
    if (!serviceAccountKey) {
      return;
    }

    const jwt = GoogleSheetsApiAdapter.createServiceAccountClient(
      serviceAccountKey,
      GoogleSheetsApiAdapter.SERVICE_ACCOUNT_DRIVE_CREATE_SCOPES
    );
    const adapter = new GoogleSheetsApiAdapter(undefined, jwt);
    const access = await adapter.getFolderAccess(folderId);
    const saEmail = serviceAccountKey.client_email;

    if (!access.accessible) {
      throw new DestinationFolderAccessException(
        GoogleSheetsFolderValidator.describeFailure(
          access.failure,
          saEmail,
          serviceAccountKey.project_id
        ),
        { folderId, reason: access.failure?.reason }
      );
    }
    if (!access.isFolder) {
      throw new DestinationFolderAccessException(
        'The provided Google Drive folder ID does not point to a folder.',
        { folderId }
      );
    }
    if (!access.isSharedDrive) {
      throw new DestinationFolderAccessException(
        'The folder must be located in a Shared Drive. My Drive folders are not supported for service-account auto-creation.',
        { folderId }
      );
    }
    if (!access.canAddChildren) {
      throw new DestinationFolderAccessException(
        `The service account (${saEmail}) cannot create files in this folder. Add it as a Shared Drive member with the Content Manager role (Viewer/Commenter is not enough).`,
        { folderId }
      );
    }
  }

  /**
   * Turns a lookup failure into remediation the user can act on. Each reason gets
   * its own message: the three causes look identical from the outside (Drive just
   * says "no"), so a single message would send users to re-check sharing even
   * when sharing was never the problem.
   */
  private static describeFailure(
    failure: FolderAccessFailure | undefined,
    saEmail: string,
    projectId: string
  ): string {
    if (failure?.reason === 'drive_api_disabled') {
      const url =
        failure.activationUrl ??
        `https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${projectId}`;
      return (
        `The Google Drive API is not enabled in the service account's Google Cloud project (${projectId}), ` +
        `so OWOX cannot place documents in a Drive folder. Enable it at ${url}, wait a minute for it to take effect, then save again. ` +
        `Note that having the Google Sheets API enabled is not enough — folder placement needs the Drive API as well.`
      );
    }
    if (failure?.reason === 'forbidden') {
      return (
        `Google Drive denied the service account (${saEmail}) access to this folder. ` +
        `Add it as a member of the Shared Drive with the Content Manager role (a sharing link alone is not enough), ` +
        `and check that no Drive sharing policy in your organization blocks this account.`
      );
    }
    return (
      `The Drive folder was not found, or the service account (${saEmail}) is not a member of it. ` +
      `Check that the folder URL is correct, and add this account as a member of the Shared Drive with the Content Manager role (a sharing link alone is not enough).`
    );
  }
}
