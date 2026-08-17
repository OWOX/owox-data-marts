import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { AppEditionLicenseRefresherService } from './app-edition-license-refresher.service';

describe('AppEditionLicenseRefresherService', () => {
  it('revalidates the license every 15 minutes', () => {
    const cronOptions = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      AppEditionLicenseRefresherService.prototype.checkLicense
    );

    expect(cronOptions.cronTime).toBe('0 */15 * * * *');
  });
});
