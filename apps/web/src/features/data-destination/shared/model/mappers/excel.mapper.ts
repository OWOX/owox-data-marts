import type { DestinationMapper } from './destination-mapper.interface.ts';
import type { DataDestinationResponseDto } from '../../services/types';
import type { DataDestinationFormData } from '../../types';
import type { ExcelDataDestination } from '../types';
import { DataDestinationType } from '../../enums';
import type {
  UpdateDataDestinationRequestDto,
  CreateDataDestinationRequestDto,
} from '../../services/types';

/**
 * An ordinary destination in every respect except one: it has no credentials to send. The
 * add-in resolves one automatically when a user has none available, and a user can also add
 * one by hand — which is what will be needed once a destination points at a specific OneDrive
 * account and a project wants more than one.
 */
export class ExcelMapper implements DestinationMapper {
  mapFromDto(dto: DataDestinationResponseDto): ExcelDataDestination {
    return {
      id: dto.id,
      title: dto.title,
      type: DataDestinationType.EXCEL,
      projectId: dto.projectId,
      credentials: {},
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
    };
  }

  mapToUpdateRequest(formData: Partial<DataDestinationFormData>): UpdateDataDestinationRequestDto {
    return { title: formData.title ?? '' };
  }

  mapToCreateRequest(formData: DataDestinationFormData): CreateDataDestinationRequestDto {
    return { title: formData.title, type: DataDestinationType.EXCEL };
  }
}
