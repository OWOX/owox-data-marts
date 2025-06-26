import type { DataMartStatusInfo } from '../types';
import { StatusTypeEnum } from '../../../../shared/components/StatusLabel';
import { DataMartStatus } from '../enums';

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
