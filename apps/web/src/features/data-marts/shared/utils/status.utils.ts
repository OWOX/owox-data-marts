import type { DataMartStatusInfo } from '../types';
import { StatusTypeEnum } from '../../../../shared/components/StatusLabel';
import { DataMartStatus } from '../enums';
import { DataMartRunStatus } from '../enums';
import { ReportStatusEnum } from '../../reports/shared';
import { TaskStatus } from '../../../../shared/types/task-status.enum.ts';

/**
 * Maps DataMart status to StatusTypeEnum for use with StatusLabel component
 * @param status The data mart status
 * @returns Equivalent StatusTypeEnum value
 */
export const getDataMartStatusType = (status: DataMartStatusInfo['code']): StatusTypeEnum => {
  switch (status) {
    case DataMartStatus.DRAFT:
      return StatusTypeEnum.NEUTRAL;
    case DataMartStatus.PUBLISHED:
      return StatusTypeEnum.SUCCESS;
    default:
      return StatusTypeEnum.NEUTRAL;
  }
};

/**
 * Maps DataMartRunStatus to StatusTypeEnum for use with StatusLabel component
 * This ensures consistent status display across the application
 * @param status The run status from DataMartRunItem
 * @returns Equivalent StatusTypeEnum value
 */
export const mapRunStatusToStatusType = (status: DataMartRunStatus): StatusTypeEnum => {
  switch (status) {
    case DataMartRunStatus.SUCCESS:
      return StatusTypeEnum.SUCCESS;
    case DataMartRunStatus.RUNNING:
      return StatusTypeEnum.INFO;
    case DataMartRunStatus.FAILED:
    case DataMartRunStatus.CANCELLED:
    case DataMartRunStatus.INTERRUPTED:
      return StatusTypeEnum.ERROR;
    case DataMartRunStatus.RESTRICTED:
      return StatusTypeEnum.WARNING;
    default:
      return StatusTypeEnum.NEUTRAL;
  }
};

/**
 * Maps ReportStatusEnum to StatusTypeEnum for use with StatusLabel component
 * This ensures consistent status display across the application
 * @param status The report status from DataMartReport
 * @returns Equivalent StatusTypeEnum value
 */
export const mapReportStatusToStatusType = (status: ReportStatusEnum): StatusTypeEnum => {
  switch (status) {
    case ReportStatusEnum.SUCCESS:
      return StatusTypeEnum.SUCCESS;
    case ReportStatusEnum.RUNNING:
      return StatusTypeEnum.INFO;
    case ReportStatusEnum.ERROR:
      return StatusTypeEnum.ERROR;
    case ReportStatusEnum.RESTRICTED:
      return StatusTypeEnum.WARNING;
    default:
      return StatusTypeEnum.NEUTRAL;
  }
};

/**
 * Gets the display text for a run status
 * @param status The run status from DataMartRunItem
 * @returns Human-readable status text
 */
export const getRunStatusText = (status: DataMartRunStatus): string => {
  switch (status) {
    case DataMartRunStatus.SUCCESS:
      return 'Success';
    case DataMartRunStatus.RUNNING:
      return 'Running';
    case DataMartRunStatus.FAILED:
      return 'Failed';
    case DataMartRunStatus.CANCELLED:
      return 'Cancelled';
    case DataMartRunStatus.INTERRUPTED:
      return 'Interrupted';
    case DataMartRunStatus.PENDING:
      return 'Pending';
    case DataMartRunStatus.RESTRICTED:
      return 'Restricted';
    default:
      return 'Unknown';
  }
};

/**
 * Gets the display text for a report status
 * @param status The report status from DataMartReport
 * @returns Human-readable status text
 */
export const getReportStatusText = (status: ReportStatusEnum): string => {
  switch (status) {
    case ReportStatusEnum.SUCCESS:
      return 'Success';
    case ReportStatusEnum.RUNNING:
      return 'Running';
    case ReportStatusEnum.ERROR:
      return 'Failed';
    case ReportStatusEnum.RESTRICTED:
      return 'Restricted';
    default:
      return 'Unknown';
  }
};

/**
 * Checks if the DataMart run status is in a final state (completed, failed, or cancelled).
 * @param status The DataMart run status
 * @returns True if the status indicates the run has finished
 */
export const isDataMartRunFinalStatus = (status?: DataMartRunStatus): boolean => {
  if (!status) return true;

  const finalStatuses = [
    DataMartRunStatus.SUCCESS,
    DataMartRunStatus.FAILED,
    DataMartRunStatus.CANCELLED,
    DataMartRunStatus.INTERRUPTED,
    DataMartRunStatus.RESTRICTED,
  ];

  return finalStatuses.includes(status);
};

/**
 * Checks if the Task status is in a final state.
 * @param status The Task status
 * @returns True if the status indicates the task has finished
 */
export const isTaskFinalStatus = (status?: TaskStatus): boolean => {
  if (!status) return true;
  const finalStatuses = [TaskStatus.SUCCESS, TaskStatus.ERROR, TaskStatus.CANCELLED];
  return finalStatuses.includes(status);
};
