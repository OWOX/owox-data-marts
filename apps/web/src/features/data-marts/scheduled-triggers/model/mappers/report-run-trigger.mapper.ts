import type { TriggerMapper } from './trigger-mapper.interface';
import type { ScheduledTrigger } from '../scheduled-trigger.model';
import { ScheduledTriggerType } from '../../enums';
import type {
  CreateScheduledTriggerRequestApiDto,
  ScheduledTriggerResponseApiDto,
  UpdateScheduledTriggerRequestApiDto,
} from '../api';
import { reportService, mapReportDtoToEntity } from '../../../reports/shared';

/**
 * Mapper for report run triggers
 */
export class ReportRunTriggerMapper implements TriggerMapper {
  /**
   * Maps from API DTO to model
   */
  mapFromDto(dto: ScheduledTriggerResponseApiDto): ScheduledTrigger {
    return {
      id: dto.id,
      type: dto.type,
      cronExpression: dto.cronExpression,
      timeZone: dto.timeZone,
      isActive: dto.isActive,
      nextRun: dto.nextRunTimestamp ? new Date(dto.nextRunTimestamp) : null,
      lastRun: dto.lastRunTimestamp ? new Date(dto.lastRunTimestamp) : null,
      triggerConfig: dto.triggerConfig,
      createdById: dto.createdById,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
    };
  }

  /**
   * Enhances a trigger with report data
   * @param trigger The trigger to enhance
   * @returns Promise with the enhanced trigger
   */
  async enhanceWithReportData(trigger: ScheduledTrigger): Promise<ScheduledTrigger> {
    if (trigger.type !== ScheduledTriggerType.REPORT_RUN) {
      return trigger;
    }

    const config = trigger.triggerConfig;

    if (!config?.reportId) {
      return trigger;
    }

    try {
      const reportDto = await reportService.getReportById(config.reportId);
      const report = mapReportDtoToEntity(reportDto);
      return {
        ...trigger,
        triggerConfig: {
          ...config,
          report,
        },
      };
    } catch (error) {
      console.error(`Failed to fetch report data for trigger ${trigger.id}:`, error);
      return trigger;
    }
  }

  /**
   * Enhances multiple triggers with report data
   * @param triggers The triggers to enhance
   * @returns Promise with the enhanced triggers
   */
  async enhanceTriggersWithReportData(triggers: ScheduledTrigger[]): Promise<ScheduledTrigger[]> {
    return Promise.all(triggers.map(trigger => this.enhanceWithReportData(trigger)));
  }

  /**
   * Maps from model to create request DTO
   */
  mapToCreateRequest(model: ScheduledTrigger): CreateScheduledTriggerRequestApiDto {
    return {
      type: ScheduledTriggerType.REPORT_RUN,
      cronExpression: model.cronExpression,
      timeZone: model.timeZone,
      isActive: model.isActive,
      triggerConfig: model.triggerConfig,
    };
  }

  /**
   * Maps from model to update request DTO
   */
  mapToUpdateRequest(model: ScheduledTrigger): UpdateScheduledTriggerRequestApiDto {
    return {
      cronExpression: model.cronExpression,
      timeZone: model.timeZone,
      isActive: model.isActive,
    };
  }
}
