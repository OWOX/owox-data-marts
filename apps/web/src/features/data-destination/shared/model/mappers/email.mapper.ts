import type { EmailCredentials } from '../types/email-credentials.ts';
import type { DestinationMapper } from './destination-mapper.interface.ts';
import type { DataDestinationResponseDto } from '../../services/types';
import type { DataDestination, EmailDataDestination } from '../types';
import { DataDestinationCredentialsType, DataDestinationType } from '../../enums';
import type { DataDestinationFormData } from '../../types';
import type {
  UpdateDataDestinationRequestDto,
  CreateDataDestinationRequestDto,
} from '../../services/types';

export class EmailMapper<T extends DataDestination> implements DestinationMapper {
  constructor(
    private readonly type:
      | DataDestinationType.EMAIL
      | DataDestinationType.SLACK
      | DataDestinationType.MS_TEAMS
      | DataDestinationType.GOOGLE_CHAT
  ) {}

  mapFromDto(dto: DataDestinationResponseDto): T {
    const credentials = this.extractCredentials(dto.credentials);
    return {
      id: dto.id,
      title: dto.title,
      type: this.type,
      projectId: dto.projectId,
      credentials,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
    } as T;
  }

  mapToUpdateRequest(formData: Partial<DataDestinationFormData>): UpdateDataDestinationRequestDto {
    const emailFormData = formData;

    const result: UpdateDataDestinationRequestDto = {
      title: emailFormData.title ?? '',
    };

    // Include credentials only if the form provided them (field was dirty)
    if (emailFormData.credentials !== undefined) {
      const emails = (emailFormData as EmailDataDestination).credentials.to;
      result.credentials = {
        type: DataDestinationCredentialsType.EMAIL_CREDENTIALS,
        to: emails,
      };
    }

    return result;
  }

  mapToCreateRequest(formData: DataDestinationFormData): CreateDataDestinationRequestDto {
    const emailFormData = formData;
    const emails = (emailFormData as EmailDataDestination).credentials.to;

    return {
      title: emailFormData.title,
      type: this.type,
      credentials: { type: DataDestinationCredentialsType.EMAIL_CREDENTIALS, to: emails },
    };
  }

  private extractCredentials(
    credentials: DataDestinationResponseDto['credentials']
  ): EmailCredentials {
    if (credentials.type === DataDestinationCredentialsType.EMAIL_CREDENTIALS) {
      return {
        to: credentials.to,
      };
    }

    return {
      to: [],
    };
  }
}
