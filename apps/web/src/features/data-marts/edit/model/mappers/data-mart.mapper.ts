import type { DataMart } from '../types';
import type { DataMartResponseDto } from '../../../shared';
import { DataMartStatusModel } from '../../../shared';
import { mapDataStorageFromDto } from '../../../../data-storage/shared/model/mappers';

import { mapDefinitionFromDto } from './definition-mappers';

/**
 * Maps a data mart response DTO to a domain model
 */
export function mapDataMartFromDto(dataMartDto: DataMartResponseDto): DataMart {
  return {
    id: dataMartDto.id,
    title: dataMartDto.title,
    description: dataMartDto.description,
    status: DataMartStatusModel.getInfo(dataMartDto.status),
    storage: mapDataStorageFromDto(dataMartDto.storage),
    definitionType: dataMartDto.definitionType,
    definition: mapDefinitionFromDto(dataMartDto.definitionType, dataMartDto.definition),
    connectorInfo: null,
    schema: dataMartDto.schema,
    createdAt: new Date(dataMartDto.createdAt),
    modifiedAt: new Date(dataMartDto.modifiedAt),
    canPublish: false,
    validationErrors: [],
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
