import { DataMartStatus } from '../enums';

export interface DataMartStatusInfo {
  code: DataMartStatus;
  displayName: string;
  description: string;
}

export const DataMartStatusModel = {
  statuses: {
    [DataMartStatus.DRAFT]: {
      code: DataMartStatus.DRAFT,
      displayName: 'Draft',
      description: 'Data mart is in draft mode and not yet published',
    },
    [DataMartStatus.PUBLISHED]: {
      code: DataMartStatus.PUBLISHED,
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
