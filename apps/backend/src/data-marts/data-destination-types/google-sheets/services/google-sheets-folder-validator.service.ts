import { Injectable } from '@nestjs/common';
import { DataDestination } from '../../../entities/data-destination.entity';
import { DataDestinationCredentialService } from '../../../services/data-destination-credential.service';
import { DestinationCredentialType } from '../../../enums/destination-credential-type.enum';
import { GoogleSheetsApiAdapter } from '../adapters/google-sheets-api.adapter';
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
        `The Drive folder was not found or is not shared with the service account (${saEmail}). Share the folder with this account as Editor.`,
        { folderId }
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
        `The service account (${saEmail}) cannot create files in this folder. Share it as Editor (Content manager).`,
        { folderId }
      );
    }
  }
}
