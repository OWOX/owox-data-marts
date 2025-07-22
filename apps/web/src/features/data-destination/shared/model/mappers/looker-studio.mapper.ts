import type { DestinationMapper } from './destination-mapper.interface.ts';
import type { DataDestinationResponseDto } from '../../services/types';
import type { LookerStudioDataDestination } from '../types';
import { DataDestinationCredentialsType, DataDestinationType } from '../../enums';
import type { DataDestinationFormData } from '../../types';
import type {
  UpdateDataDestinationRequestDto,
  CreateDataDestinationRequestDto,
} from '../../services/types';
import type { LookerStudioCredentials } from '../types/looker-studio-credentials.ts';

export class LookerStudioMapper implements DestinationMapper {
  mapFromDto(dto: DataDestinationResponseDto): LookerStudioDataDestination {
    let urlHost = '';
    let secretKey = '';
    try {
      // Check if credentials are of type LookerStudioCredentialsResponse
      if (dto.credentials.type === DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS) {
        urlHost = dto.credentials.urlHost;
        secretKey = dto.credentials.secretKey;
      }
    } catch (error) {
      console.error(error, 'Error parsing Looker Studio credentials');
    }

    return {
      id: dto.id,
      title: dto.title,
      type: DataDestinationType.LOOKER_STUDIO,
      projectId: dto.projectId,
      credentials: {
        urlHost,
        secretKey,
      },
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
    };
  }

  mapToUpdateRequest(formData: DataDestinationFormData): UpdateDataDestinationRequestDto {
    const lookerStudioFormData = formData;
    return {
      title: lookerStudioFormData.title,
      credentials: {
        urlHost: (lookerStudioFormData.credentials as LookerStudioCredentials).urlHost,
        type: DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS,
      },
    };
  }

  mapToCreateRequest(formData: DataDestinationFormData): CreateDataDestinationRequestDto {
    const lookerStudioFormData = formData;
    return {
      title: lookerStudioFormData.title,
      type: DataDestinationType.LOOKER_STUDIO,
      credentials: {
        urlHost: (lookerStudioFormData.credentials as LookerStudioCredentials).urlHost,
        type: DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS,
      },
    };
  }
}
