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
    const credentials = this.extractLookerStudioCredentials(dto.credentials);
    return {
      id: dto.id,
      title: dto.title,
      type: DataDestinationType.LOOKER_STUDIO,
      projectId: dto.projectId,
      credentials,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
    };
  }

  mapToUpdateRequest(formData: Partial<DataDestinationFormData>): UpdateDataDestinationRequestDto {
    const lookerStudioFormData = formData;
    const updateRequest: UpdateDataDestinationRequestDto = {
      title: lookerStudioFormData.title ?? '',
    };
    if (lookerStudioFormData.credentials) {
      updateRequest.credentials = {
        deploymentUrl: (lookerStudioFormData.credentials as LookerStudioCredentials).deploymentUrl,
        type: DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS,
      };
    }
    return updateRequest;
  }

  mapToCreateRequest(formData: DataDestinationFormData): CreateDataDestinationRequestDto {
    const lookerStudioFormData = formData;
    return {
      title: lookerStudioFormData.title,
      type: DataDestinationType.LOOKER_STUDIO,
      credentials: {
        deploymentUrl: (lookerStudioFormData.credentials as LookerStudioCredentials).deploymentUrl,
        type: DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS,
      },
    };
  }

  private extractLookerStudioCredentials(
    credentials: DataDestinationResponseDto['credentials']
  ): LookerStudioCredentials {
    if (credentials.type === DataDestinationCredentialsType.LOOKER_STUDIO_CREDENTIALS) {
      return {
        deploymentUrl: credentials.deploymentUrl,
        destinationId: credentials.destinationId,
        destinationSecretKey: credentials.destinationSecretKey,
      };
    }

    return {
      deploymentUrl: '',
      destinationId: '',
      destinationSecretKey: '',
    };
  }
}
