import type { DataMartStatusInfo } from '../types';
import { StatusTypeEnum } from '../../../../shared/components/StatusLabel';
import { DataMartStatus } from '../enums';
import { RunStatus } from '../../edit/components/DataMartRunHistoryView';
import { ReportStatusEnum } from '../../reports/shared';

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
 * Maps RunStatus to StatusTypeEnum for use with StatusLabel component
 * This ensures consistent status display across the application
 * @param status The run status from DataMartRunItem
 * @returns Equivalent StatusTypeEnum value
 */
export const mapRunStatusToStatusType = (status: RunStatus): StatusTypeEnum => {
  switch (status) {
    case RunStatus.SUCCESS:
      return StatusTypeEnum.SUCCESS;
    case RunStatus.RUNNING:
      return StatusTypeEnum.INFO;
    case RunStatus.FAILED:
    case RunStatus.CANCELLED:
    case RunStatus.INTERRUPTED:
      return StatusTypeEnum.ERROR;
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
    default:
      return StatusTypeEnum.NEUTRAL;
  }
};

/**
 * Gets the display text for a run status
 * @param status The run status from DataMartRunItem
 * @returns Human-readable status text
 */
export const getRunStatusText = (status: RunStatus): string => {
  switch (status) {
    case RunStatus.SUCCESS:
      return 'Success';
    case RunStatus.RUNNING:
      return 'Running';
    case RunStatus.FAILED:
      return 'Failed';
    case RunStatus.CANCELLED:
      return 'Cancelled';
    case RunStatus.INTERRUPTED:
      return 'Interrupted';
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
    default:
      return 'Unknown';
  }
};
