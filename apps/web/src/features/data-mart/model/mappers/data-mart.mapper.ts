import type { DataMartResponseDto } from '../../../../shared';
import type { DataMart } from '../types';

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
