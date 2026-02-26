import type { DestinationMapper } from './destination-mapper.interface.ts';
import type { DataDestinationResponseDto } from '../../services/types';
import type { GoogleSheetsDataDestination } from '../types';
import { DataDestinationCredentialsType, DataDestinationType } from '../../enums';
import type { DataDestinationFormData } from '../../types';
import type {
  UpdateDataDestinationRequestDto,
  CreateDataDestinationRequestDto,
} from '../../services/types';

interface GoogleSheetsFormCredentials {
  serviceAccount?: string;
  credentialId?: string | null;
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
      },
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
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

    return result;
  }
}
