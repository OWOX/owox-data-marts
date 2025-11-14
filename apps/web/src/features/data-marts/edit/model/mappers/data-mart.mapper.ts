import { mapDataStorageFromDto } from '../../../../data-storage/shared/model/mappers';
import type { DataMartResponseDto } from '../../../shared';
import { DataMartStatusModel } from '../../../shared';
import type { DataMart } from '../types';

import { mapDefinitionFromDto } from './definition-mappers';
import { canActualizeSchema } from '../helpers';

/**
 * Maps a data mart response DTO to a domain model
 */
export async function mapDataMartFromDto(dataMartDto: DataMartResponseDto): Promise<DataMart> {
  const dataMart: DataMart = {
    id: dataMartDto.id,
    title: dataMartDto.title,
    description: dataMartDto.description,
    status: DataMartStatusModel.getInfo(dataMartDto.status),
    storage: mapDataStorageFromDto(dataMartDto.storage),
    definitionType: dataMartDto.definitionType,
    definition: await mapDefinitionFromDto(dataMartDto.definitionType, dataMartDto.definition),
    schema: dataMartDto.schema,
    connectorState: dataMartDto.connectorState ?? null,
    createdAt: new Date(dataMartDto.createdAt),
    modifiedAt: new Date(dataMartDto.modifiedAt),
    canPublish: false,
    canActualizeSchema: false,
    validationErrors: [],
  };

  dataMart.canActualizeSchema = canActualizeSchema(dataMart.definitionType, dataMart.schema);
  return dataMart;
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
