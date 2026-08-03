import { ScheduledTriggerType } from '../../enums';
import type { TriggerMapper } from './trigger-mapper.interface';
import { ReportRunTriggerMapper } from './report-run-trigger.mapper';
import { ConnectorRunTriggerMapper } from './connector-run-trigger.mapper';
import { DataQualityRunTriggerMapper } from './data-quality-run-trigger.mapper';

/**
 * Factory for creating trigger mappers based on trigger type
 */
export const TriggerMapperFactory = {
  /**
   * Gets the appropriate mapper for the given trigger type
   */
  getMapper(type: ScheduledTriggerType): TriggerMapper {
    switch (type) {
      case ScheduledTriggerType.REPORT_RUN:
        return new ReportRunTriggerMapper();
      case ScheduledTriggerType.CONNECTOR_RUN:
        return new ConnectorRunTriggerMapper();
      case ScheduledTriggerType.DATA_QUALITY_RUN:
        return new DataQualityRunTriggerMapper();
      default:
        throw new Error(`Unknown scheduled trigger type: ${String(type)}`);
    }
  },
};
