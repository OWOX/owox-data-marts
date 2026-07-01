import type { DestinationMapper } from './destination-mapper.interface.ts';
import type { DataDestinationResponseDto } from '../../services/types';
import type { GoogleSheetsDataDestination } from '../types';
import { DataDestinationCredentialsType, DataDestinationType } from '../../enums';
import type { DataDestinationFormData } from '../../types';
import type {
  UpdateDataDestinationRequestDto,
  CreateDataDestinationRequestDto,
} from '../../services/types';
import { buildDriveFolderUrl } from '../../utils/drive-folder-url.utils.ts';

interface GoogleSheetsFormCredentials {
  serviceAccount?: string;
  credentialId?: string | null;
}

interface GoogleSheetsFormConfig {
  folderId?: string;
  folderUrl?: string;
}

export class GoogleSheetsMapper implements DestinationMapper {
  mapFromDto(dto: DataDestinationResponseDto): GoogleSheetsDataDestination {
    let serviceAccountJson = '';
    try {
      if (dto.credentials.type === DataDestinationCredentialsType.GOOGLE_SHEETS_CREDENTIALS) {
        serviceAccountJson = JSON.stringify(dto.credentials.serviceAccountKey, null, 2);
      }
    } catch (error) {
      console.error(error, 'Error parsing service account key');
    }

    return {
      id: dto.id,
      title: dto.title,
      type: DataDestinationType.GOOGLE_SHEETS,
      projectId: dto.projectId,
      credentials: {
        serviceAccount: serviceAccountJson,
        credentialId: dto.credentialId,
        identity:
          dto.credentials.type === DataDestinationCredentialsType.GOOGLE_SHEETS_OAUTH_CREDENTIALS
            ? dto.credentials.identity
            : null,
      },
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
      // Prefer the stored folderUrl; synthesize one from a legacy folderId so the
      // clickable link still works for destinations created before the URL field.
      config: (() => {
        const folderUrl =
          dto.config?.folderUrl ??
          (dto.config?.folderId ? buildDriveFolderUrl(dto.config.folderId) : undefined);
        return folderUrl ? { folderUrl } : undefined;
      })(),
    };
  }

  mapToUpdateRequest(formData: Partial<DataDestinationFormData>): UpdateDataDestinationRequestDto {
    const result: UpdateDataDestinationRequestDto = {
      title: formData.title ?? '',
    };

    if (formData.credentials) {
      const creds = formData.credentials as GoogleSheetsFormCredentials;
      const serviceAccount = creds.serviceAccount;
      if (serviceAccount?.trim()) {
        try {
          result.credentials = {
            serviceAccountKey: JSON.parse(serviceAccount) as Record<string, unknown>,
            type: DataDestinationCredentialsType.GOOGLE_SHEETS_CREDENTIALS,
          };
        } catch {
          throw new Error('Invalid Service Account JSON');
        }
      }
      // null = user explicitly disconnected OAuth; pass it so backend can revoke
      if (creds.credentialId === null) {
        result.credentialId = null;
      }
    }

    const folderUrl = (formData as { config?: GoogleSheetsFormConfig }).config?.folderUrl;
    if (folderUrl !== undefined) {
      result.config = { folderUrl: folderUrl.trim() || null };
    }

    return result;
  }

  mapToCreateRequest(formData: DataDestinationFormData): CreateDataDestinationRequestDto {
    const creds = formData.credentials as GoogleSheetsFormCredentials;
    const serviceAccount = creds.serviceAccount;

    let credentials: CreateDataDestinationRequestDto['credentials'];
    if (serviceAccount?.trim()) {
      try {
        credentials = {
          serviceAccountKey: JSON.parse(serviceAccount) as Record<string, unknown>,
          type: DataDestinationCredentialsType.GOOGLE_SHEETS_CREDENTIALS,
        };
      } catch {
        throw new Error('Invalid Service Account JSON');
      }
    } else {
      credentials = { type: DataDestinationCredentialsType.GOOGLE_SHEETS_CREDENTIALS };
    }

    const result: CreateDataDestinationRequestDto = {
      title: formData.title,
      type: DataDestinationType.GOOGLE_SHEETS,
      credentials,
    };

    // Pass pre-created OAuth credential ID if available
    if (creds.credentialId) {
      result.credentialId = creds.credentialId;
    }

    const folderUrl = (formData as { config?: GoogleSheetsFormConfig }).config?.folderUrl?.trim();
    if (folderUrl) {
      result.config = { folderUrl };
    }

    return result;
  }
}
