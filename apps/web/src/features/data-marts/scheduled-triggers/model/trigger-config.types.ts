import { TRIGGER_CONFIG_TYPES } from '../enums';
import type { DataMartReport } from '../../reports/shared/model/types/data-mart-report.ts';

/**
 * Configuration for a scheduled report run trigger
 */
export interface ScheduledReportRunConfig {
  /**
   * Type identifier for the configuration
   */
  type: typeof TRIGGER_CONFIG_TYPES.SCHEDULED_REPORT_RUN;

  /**
   * ID of the report to run
   */
  reportId: string;

  /**
   * Represents a report object containing data from a DataMart.
   */
  report: DataMartReport;
}

/**
 * Configuration for a scheduled connector run trigger
 */
export type ScheduledConnectorRunConfig = null;

/**
 * Union type of all possible trigger configurations
 */
export type ScheduledTriggerConfig = ScheduledReportRunConfig | ScheduledConnectorRunConfig;
