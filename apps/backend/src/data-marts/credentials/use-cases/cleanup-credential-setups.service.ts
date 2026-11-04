import { Injectable } from '@nestjs/common';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { CredentialSetupService } from '../services/credential-setup.service';
import { CREDENTIAL_SETUP_RETENTION_MS } from '../credential-setup.constants';

@Injectable()
export class CleanupCredentialSetupsService {
  constructor(
    private readonly setups: CredentialSetupService,
    private readonly time: SystemTimeService
  ) {}

  async run(signal?: AbortSignal): Promise<number> {
    const now = this.time.now();
    const createdBefore = new Date(now.getTime() - CREDENTIAL_SETUP_RETENTION_MS);
    let deleted = 0;
    while (!signal?.aborted) {
      const count = await this.setups.deleteCreatedBeforeBatch(createdBefore);
      if (count === 0) break;
      deleted += count;
    }
    return deleted;
  }
}
