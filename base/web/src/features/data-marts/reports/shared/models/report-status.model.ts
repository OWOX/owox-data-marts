import { CircleCheck, XCircle, Loader2 } from 'lucide-react';
import { ReportStatusEnum } from '../enums';
import type { AppIcon } from '../../../../../shared';

interface ReportStatusInfo {
  status: ReportStatusEnum;
  displayName: string;
  icon: AppIcon;
  color: string;
}

export const ReportStatusModel = {
  statuses: {
    [ReportStatusEnum.SUCCESS]: {
      status: ReportStatusEnum.SUCCESS,
      displayName: 'Success',
      icon: CircleCheck,
      color: 'text-green-500',
    },
    [ReportStatusEnum.RUNNING]: {
      status: ReportStatusEnum.RUNNING,
      displayName: 'In progress',
      icon: Loader2,
      color: 'text-primary animate-spin',
    },
    [ReportStatusEnum.ERROR]: {
      status: ReportStatusEnum.ERROR,
      displayName: 'Fail',
      icon: XCircle,
      color: 'text-red-500',
    },
  },

  getInfo(status: ReportStatusEnum): ReportStatusInfo {
    return this.statuses[status];
  },

  getAllStatuses(): ReportStatusInfo[] {
    return Object.values(this.statuses);
  },
} as const;
