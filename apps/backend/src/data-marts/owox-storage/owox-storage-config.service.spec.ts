import { ConfigService } from '@nestjs/config';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { OwoxStorageConfigService } from './owox-storage-config.service';

const fakeConfig = (values: Record<string, unknown>) =>
  ({ get: (name: string) => values[name] }) as unknown as ConfigService;

describe('OwoxStorageConfigService', () => {
  it('reads numeric limits returned by the validated config', () => {
    const service = new OwoxStorageConfigService(
      fakeConfig({
        OWOX_STORAGE_ENGINE: 'bigquery',
        OWOX_STORAGE_GCP_PROJECT_ID: 'owox-storage',
        OWOX_STORAGE_FREE_QUERY_LIMIT_GIB_PER_DAY: 10,
        OWOX_STORAGE_PAID_QUERY_LIMIT_GIB_PER_DAY: 100,
      })
    );

    expect(service.isEnabled()).toBe(true);
    expect(service.getSettings()).toMatchObject({
      freeQueryLimitBytesPerDay: 10 * 2 ** 30,
      paidQueryLimitBytesPerDay: 100 * 2 ** 30,
    });
  });

  it('is disabled and refuses getSettings when the engine is unset', () => {
    const service = new OwoxStorageConfigService(fakeConfig({}));

    expect(service.isEnabled()).toBe(false);
    expect(() => service.getSettings()).toThrow(BusinessViolationException);
  });
});
