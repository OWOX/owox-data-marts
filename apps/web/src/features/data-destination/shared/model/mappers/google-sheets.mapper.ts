import type { DestinationMapper } from './destination-mapper.interface.ts';
import type { DataDestinationResponseDto } from '../../services/types';
import type { GoogleSheetsDataDestination } from '../types';
import { DataDestinationType, GoogleSheetCredentialsType } from '../../enums';
import type { DataDestinationFormData } from '../../types';
import type {
  UpdateDataDestinationRequestDto,
  CreateDataDestinationRequestDto,
} from '../../services/types';
import type { GoogleServiceAccountCredentials } from '../../../../../shared/types';

export class GoogleSheetsMapper implements DestinationMapper {
  mapFromDto(dto: DataDestinationResponseDto): GoogleSheetsDataDestination {
    let serviceAccountJson = '';
    try {
      serviceAccountJson = JSON.stringify(dto.credentials.serviceAccountKey, null, 2);
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
      },
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
    };
  }

  mapToUpdateRequest(formData: Partial<DataDestinationFormData>): UpdateDataDestinationRequestDto {
    const googleSheetsFormData = formData;
    const result: UpdateDataDestinationRequestDto = {
      title: googleSheetsFormData.title ?? '',
    };

    if (googleSheetsFormData.credentials) {
      result.credentials = {
        serviceAccountKey: JSON.parse(
          (googleSheetsFormData.credentials as GoogleServiceAccountCredentials).serviceAccount
        ),
        type: GoogleSheetCredentialsType.GOOGLE_SHEETS_CREDENTIALS,
      };
    }

    return result;
  }

  mapToCreateRequest(formData: DataDestinationFormData): CreateDataDestinationRequestDto {
    const googleSheetsFormData = formData;
    return {
      title: googleSheetsFormData.title,
      type: DataDestinationType.GOOGLE_SHEETS,
      credentials: {
        serviceAccountKey: JSON.parse(
          (googleSheetsFormData.credentials as GoogleServiceAccountCredentials).serviceAccount
        ),
        type: GoogleSheetCredentialsType.GOOGLE_SHEETS_CREDENTIALS,
      },
    };
  }
}
