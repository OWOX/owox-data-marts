import type { DataDestinationResponseDto } from '../../services/types';
import type { DataDestination } from '../types';
import type { DataDestinationFormData } from '../../types';
import type { UpdateDataDestinationRequestDto } from '../../services/types';
import type { CreateDataDestinationRequestDto } from '../../services/types';

export interface DestinationMapper {
  mapFromDto(dto: DataDestinationResponseDto): DataDestination;
  mapToUpdateRequest(formData: Partial<DataDestinationFormData>): UpdateDataDestinationRequestDto;
  mapToCreateRequest(formData: DataDestinationFormData): CreateDataDestinationRequestDto;
}
