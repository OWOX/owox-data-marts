import type { DataMart } from '../types';
import type { DataMartResponseDto } from '../../../shared/types/api';

/**
 * Maps a data mart response DTO to a domain model
 */
export function mapDataMartFromDto(dto: DataMartResponseDto): DataMart {
  return {
    id: dto.id,
    title: dto.title,
    storageType: dto.storageType,
    createdAt: new Date(dto.createdAt),
    modifiedAt: new Date(dto.modifiedAt),
  };
}

/**
 * Maps a limited data mart response (after creation) to a domain model
 * Contains only id and title fields
 */
export function mapLimitedDataMartFromDto(dto: {
  id: string;
  title: string;
}): Pick<DataMart, 'id' | 'title'> {
  return {
    id: dto.id,
    title: dto.title,
  };
}
