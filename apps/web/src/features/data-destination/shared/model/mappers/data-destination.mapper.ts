import type { DataDestinationResponseDto } from '../../services/types';
import type { DataDestination } from '../types';
import { DestinationMapperFactory } from './destination-mapper.factory.ts';
import type { DataDestinationFormData } from '../../types';
import type {
  CreateDataDestinationRequestDto,
  UpdateDataDestinationRequestDto,
} from '../../services/types';

export function mapDataDestinationFromDto(dto: DataDestinationResponseDto): DataDestination {
  const mapper = DestinationMapperFactory.getMapper(dto.type);
  return mapper.mapFromDto(dto);
}

export function mapToUpdateDataDestinationRequest(
  formData: DataDestinationFormData
): UpdateDataDestinationRequestDto {
  const mapper = DestinationMapperFactory.getMapper(formData.type);
  return mapper.mapToUpdateRequest(formData);
}

export function mapToCreateDataDestinationRequest(
  formData: DataDestinationFormData
): CreateDataDestinationRequestDto {
  const mapper = DestinationMapperFactory.getMapper(formData.type);
  return mapper.mapToCreateRequest(formData);
}
