import { DataMartStatus } from '../enums/data-mart-status.enum';

export interface DataMartStatusInfo {
  status: DataMartStatus;
  displayName: string;
  description: string;
}

export const DataMartStatusModel = {
  statuses: {
    [DataMartStatus.DRAFT]: {
      status: DataMartStatus.DRAFT,
      displayName: 'Draft',
      description: 'Data mart is in draft mode and not yet published',
    },
    [DataMartStatus.PUBLISHED]: {
      status: DataMartStatus.PUBLISHED,
      displayName: 'Published',
      description: 'Data mart is published and available for use',
    },
  },

  getInfo(status: DataMartStatus): DataMartStatusInfo {
    return this.statuses[status];
  },

  getAllStatuses(): DataMartStatusInfo[] {
    return Object.values(this.statuses);
  },
} as const;
