import type { DataMartReport, DestinationConfig } from '../types/data-mart-report';
import type { DestinationConfigDto, ReportResponseDto } from '../../services';
import { mapDataDestinationFromDto } from '../../../../../data-destination/shared/model/mappers/data-destination.mapper';
import { DestinationConfigMapperFactory } from './destination-config-mapper.factory.ts';

/**
 * Maps a DestinationConfigDto object to a DestinationConfig entity using the appropriate mapper.
 *
 * @param destinationConfigDto The data transfer object containing destination configuration details.
 * @return The mapped DestinationConfig entity.
 */
export function mapDestinationConfigDtoToEntity(
  destinationConfigDto: DestinationConfigDto
): DestinationConfig {
  const mapper = DestinationConfigMapperFactory.getMapper(destinationConfigDto.type);
  return mapper.mapFromDto(destinationConfigDto);
}

/**
 * Maps a report DTO to a report entity
 */
export function mapReportDtoToEntity(reportDto: ReportResponseDto): DataMartReport {
  const destinationConfig = mapDestinationConfigDtoToEntity(reportDto.destinationConfig);

  return {
    id: reportDto.id,
    title: reportDto.title,
    dataMart: { id: reportDto.dataMart.id },
    dataDestination: mapDataDestinationFromDto(reportDto.dataDestinationAccess),
    destinationConfig,
    lastRunDate: reportDto.lastRunAt ? new Date(reportDto.lastRunAt) : null,
    lastRunStatus: reportDto.lastRunStatus,
    lastRunError: reportDto.lastRunError,
    runsCount: reportDto.runsCount,
    createdAt: new Date(reportDto.createdAt),
    modifiedAt: new Date(reportDto.modifiedAt),
  };
}
