import type {
  ScheduledTriggerResponseApiDto,
  CreateScheduledTriggerRequestApiDto,
  UpdateScheduledTriggerRequestApiDto,
  ScheduledTriggerListResponseApiDto,
} from '../api';
import type { ScheduledTrigger } from '../scheduled-trigger.model';
import { TriggerMapperFactory } from './trigger-mapper.factory';
import { ScheduledTriggerType } from '../../enums';
import { ReportRunTriggerMapper } from './report-run-trigger.mapper';

/**
 * General mapper for scheduled triggers
 */
export const ScheduledTriggerMapper = {
  /**
   * Maps a ScheduledTriggerResponseApiDto object to a ScheduledTrigger object using a relevant mapper.
   *
   * @param {ScheduledTriggerResponseApiDto} dto - The data transfer object containing the information to be mapped.
   * @return {ScheduledTrigger} The mapped ScheduledTrigger object.
   */
  mapFromDto(dto: ScheduledTriggerResponseApiDto): ScheduledTrigger {
    const mapper = TriggerMapperFactory.getMapper(dto.type);
    return mapper.mapFromDto(dto);
  },

  /**
   * Maps a list of DTO objects to a list of domain model objects.
   *
   * @param {ScheduledTriggerListResponseApiDto} dtoList - The list of DTO objects to be mapped.
   * @return {ScheduledTrigger[]} The list of mapped domain model objects.
   */
  mapFromDtoList(dtoList: ScheduledTriggerListResponseApiDto): ScheduledTrigger[] {
    return dtoList.map(dto => this.mapFromDto(dto));
  },

  /**
   * Maps a ScheduledTriggerResponseApiDto object to a ScheduledTrigger object and enhances it with report data.
   *
   * @param {ScheduledTriggerResponseApiDto} dto - The data transfer object containing the information to be mapped.
   * @return {Promise<ScheduledTrigger>} The mapped and enhanced ScheduledTrigger object.
   */
  async mapFromDtoWithReportData(dto: ScheduledTriggerResponseApiDto): Promise<ScheduledTrigger> {
    const trigger = this.mapFromDto(dto);

    if (trigger.type === ScheduledTriggerType.REPORT_RUN) {
      const reportRunMapper = new ReportRunTriggerMapper();
      return reportRunMapper.enhanceWithReportData(trigger);
    }

    return trigger;
  },

  /**
   * Maps a list of DTO objects to a list of domain model objects and enhances them with report data.
   *
   * @param {ScheduledTriggerListResponseApiDto} dtoList - The list of DTO objects to be mapped.
   * @return {Promise<ScheduledTrigger[]>} The list of mapped and enhanced domain model objects.
   */
  async mapFromDtoListWithReportData(
    dtoList: ScheduledTriggerListResponseApiDto
  ): Promise<ScheduledTrigger[]> {
    const triggers = this.mapFromDtoList(dtoList);

    // Filter out REPORT_RUN triggers
    const reportRunTriggers = triggers.filter(
      trigger => trigger.type === ScheduledTriggerType.REPORT_RUN
    );

    // Enhance REPORT_RUN triggers with report data
    if (reportRunTriggers.length > 0) {
      const reportRunMapper = new ReportRunTriggerMapper();
      const enhancedReportRunTriggers =
        await reportRunMapper.enhanceTriggersWithReportData(reportRunTriggers);

      // Replace the original triggers with the enhanced ones
      return triggers.map(trigger => {
        if (trigger.type === ScheduledTriggerType.REPORT_RUN) {
          return enhancedReportRunTriggers.find(t => t.id === trigger.id) ?? trigger;
        }
        return trigger;
      });
    }

    return triggers;
  },

  /**
   * Maps a ScheduledTrigger model to a CreateScheduledTriggerRequestApiDto.
   *
   * @param {ScheduledTrigger} model - The ScheduledTrigger model that needs to be transformed.
   * @return {CreateScheduledTriggerRequestApiDto} The resulting CreateScheduledTriggerRequestApiDto after mapping.
   */
  mapToCreateRequest(model: ScheduledTrigger): CreateScheduledTriggerRequestApiDto {
    const mapper = TriggerMapperFactory.getMapper(model.type);
    return mapper.mapToCreateRequest(model);
  },

  /**
   * Maps the given ScheduledTrigger model to an UpdateScheduledTriggerRequestApiDto object.
   *
   * @param {ScheduledTrigger} model - The ScheduledTrigger model to be transformed into an API update request DTO.
   * @return {UpdateScheduledTriggerRequestApiDto} The API update request DTO created from the provided model.
   */
  mapToUpdateRequest(model: ScheduledTrigger): UpdateScheduledTriggerRequestApiDto {
    const mapper = TriggerMapperFactory.getMapper(model.type);
    return mapper.mapToUpdateRequest(model);
  },
};
