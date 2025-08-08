import { ScheduledTriggerType } from '../enums';
import type { ScheduledConnectorRunConfig, ScheduledReportRunConfig } from './trigger-config.types';
import { DataMartDefinitionType } from '../../shared/enums/data-mart-definition-type.enum';
import type { ConnectorDefinitionConfig } from '../../edit/model/types/connector-definition-config';

/**
 * DataMart interface for the scheduled trigger
 */
export interface DataMart {
  /**
   * Unique identifier of the data mart
   */
  id: string;

  /**
   * Title of the data mart
   */
  title: string;

  /**
   * Type of the data mart definition
   */
  definitionType?: DataMartDefinitionType;

  /**
   * Definition of the data mart
   * For connector runs, this will be a ConnectorDefinitionConfig
   */
  definition?: ConnectorDefinitionConfig;

  /**
   * Project ID
   */
  projectId: string;
}

/**
 * Scheduled Trigger model interface
 */
export interface ScheduledTrigger {
  /**
   * Unique identifier of the trigger
   */
  id: string;

  /**
   * Type of the scheduled trigger
   */
  type: ScheduledTriggerType;

  /**
   * Cron expression for scheduling
   */
  cronExpression: string;

  /**
   * Timezone for the trigger
   */
  timeZone: string;

  /**
   * Whether the trigger is active
   */
  isActive: boolean;

  /**
   * Next scheduled execution time
   */
  nextRun: Date | null;

  /**
   * Last execution time
   */
  lastRun: Date | null;

  /**
   * Configuration of the trigger
   */
  triggerConfig: TriggerConfigByType[ScheduledTriggerType];

  /**
   * The data mart associated with this trigger
   */
  dataMart?: DataMart;

  /**
   * ID of the user who created the trigger
   */
  createdById: string;

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last modification timestamp
   */
  modifiedAt: Date;
}

/**
 * Maps trigger types to their respective configuration types
 */
export interface TriggerConfigByType {
  [ScheduledTriggerType.REPORT_RUN]: ScheduledReportRunConfig;
  [ScheduledTriggerType.CONNECTOR_RUN]: ScheduledConnectorRunConfig;
}
