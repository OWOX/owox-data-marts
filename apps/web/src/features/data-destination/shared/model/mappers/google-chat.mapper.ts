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
    const credentials: GoogleChatDataDestination['credentials'] =
      dto.credentials.type === DataDestinationCredentialsType.EMAIL_CREDENTIALS &&
      dto.credentials.to.length > 0
        ? { deliveryMethod: 'email', to: dto.credentials.to }
        : {
            deliveryMethod: 'webhook',
            configured:
              dto.credentials.type === DataDestinationCredentialsType.GOOGLE_CHAT_CREDENTIALS &&
              dto.credentials.configured,
          };

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
    const credentials =
      formData.type === DataDestinationType.GOOGLE_CHAT ? formData.credentials : undefined;

    if (credentials?.deliveryMethod === 'email') {
      result.credentials = {
        type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
        to: credentials.to,
      };
    } else if (credentials?.deliveryMethod === 'webhook' && credentials.webhookUrl?.trim()) {
      result.credentials = {
        type: DataDestinationCredentialsType.GOOGLE_CHAT_CREDENTIALS,
        webhookUrl: credentials.webhookUrl.trim(),
      };
    }

    return result;
  }

  mapToCreateRequest(formData: DataDestinationFormData): CreateDataDestinationRequestDto {
    if (formData.type !== DataDestinationType.GOOGLE_CHAT) {
      throw new Error('Invalid form data for Google Chat destination');
    }

    let credentials: Extract<
      CreateDataDestinationRequestDto,
      { type: DataDestinationType.GOOGLE_CHAT }
    >['credentials'];
    if (formData.credentials.deliveryMethod === 'email') {
      credentials = {
        type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
        to: formData.credentials.to,
      };
    } else {
      const webhookUrl = formData.credentials.webhookUrl?.trim();
      if (!webhookUrl) {
        throw new Error('Google Chat webhook URL is required');
      }
      credentials = {
        type: DataDestinationCredentialsType.GOOGLE_CHAT_CREDENTIALS,
        webhookUrl,
      };
    }

    return {
      title: formData.title,
      type: DataDestinationType.GOOGLE_CHAT,
      credentials,
    };
  }
}
