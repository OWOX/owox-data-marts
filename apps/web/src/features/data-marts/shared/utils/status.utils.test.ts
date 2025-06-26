import { describe, expect, it } from 'vitest';
import { getDataMartStatusType } from './status.utils';
import { DataMartStatus } from '../enums';
import { StatusTypeEnum } from '../../../../shared/components/StatusLabel';

describe('status.utils', () => {
  describe('getDataMartStatusType', () => {
    it('should return NEUTRAL for DRAFT status', () => {
      const result = getDataMartStatusType(DataMartStatus.DRAFT);
      expect(result).toBe(StatusTypeEnum.NEUTRAL);
    });

    it('should return SUCCESS for PUBLISHED status', () => {
      const result = getDataMartStatusType(DataMartStatus.PUBLISHED);
      expect(result).toBe(StatusTypeEnum.SUCCESS);
    });

    it('should return NEUTRAL for unknown status', () => {
      // @ts-expect-error Testing with invalid status
      const result = getDataMartStatusType('UNKNOWN_STATUS');
      expect(result).toBe(StatusTypeEnum.NEUTRAL);
    });

    it('should return NEUTRAL for undefined status', () => {
      // @ts-expect-error Testing with undefined status
      const result = getDataMartStatusType(undefined);
      expect(result).toBe(StatusTypeEnum.NEUTRAL);
    });
  });
});
