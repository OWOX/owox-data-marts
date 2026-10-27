import type { DestinationMapper } from './destination-mapper.interface.ts';
import type { DataDestinationResponseDto } from '../../services/types';
import type { GoogleChatDataDestination } from '../types';
import { DataDestinationCredentialsType, DataDestinationType } from '../../enums';
import type { DataDestinationFormData } from '../../types';
import type {
  UpdateDataDestinationRequestDto,
  CreateDataDestinationRequestDto,
} from '../../services/types';

export class GoogleChatMapper implements DestinationMapper {
  mapFromDto(dto: DataDestinationResponseDto): GoogleChatDataDestination {
    // Webhook delivery returns no credentials; email delivery returns its recipients.
    const credentials: GoogleChatDataDestination['credentials'] =
      dto.credentials?.type === DataDestinationCredentialsType.EMAIL_CREDENTIALS &&
      dto.credentials.to.length > 0
        ? { deliveryMethod: 'email', to: dto.credentials.to }
        : { deliveryMethod: 'webhook' };

    return {
      id: dto.id,
      title: dto.title,
      type: DataDestinationType.GOOGLE_CHAT,
      projectId: dto.projectId,
      credentials,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
    };
  }

  mapToUpdateRequest(formData: Partial<DataDestinationFormData>): UpdateDataDestinationRequestDto {
    const result: UpdateDataDestinationRequestDto = {
      title: formData.title ?? '',
    };
    if (formData.type !== DataDestinationType.GOOGLE_CHAT) return result;

    // The backend refuses both together: email recipients switch to email, a Credential to webhook.
    if (formData.credentials?.deliveryMethod === 'email') {
      result.credentials = {
        type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
        to: formData.credentials.to,
      };
    } else if (formData.reusableCredentialId) {
      result.reusableCredentialId = formData.reusableCredentialId;
    }
    return result;
  }

  mapToCreateRequest(formData: DataDestinationFormData): CreateDataDestinationRequestDto {
    if (formData.type !== DataDestinationType.GOOGLE_CHAT) {
      throw new Error('Invalid form data for Google Chat destination');
    }
    if (formData.credentials.deliveryMethod === 'email') {
      return {
        title: formData.title,
        type: DataDestinationType.GOOGLE_CHAT,
        credentials: {
          type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
          to: formData.credentials.to,
        },
      };
    }
    if (!formData.reusableCredentialId) {
      throw new Error('Select a Credential');
    }
    return {
      title: formData.title,
      type: DataDestinationType.GOOGLE_CHAT,
      reusableCredentialId: formData.reusableCredentialId,
    };
  }
}
