import { ConflictException, GoneException, Injectable } from '@nestjs/common';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import type { CancelCredentialSetupCommand } from '../dto/credential-setup-command.dto';
import type { CredentialSetupDto } from '../dto/credential-setup.dto';
import { CredentialSetupService } from '../services/credential-setup.service';
import { GetCredentialSetupService } from './get-credential-setup.service';

@Injectable()
export class CancelCredentialSetupService {
  constructor(
    private readonly setups: CredentialSetupService,
    private readonly getSetup: GetCredentialSetupService,
    private readonly time: SystemTimeService
  ) {}

  async run({ id, context }: CancelCredentialSetupCommand): Promise<CredentialSetupDto> {
    const setup = await this.getSetup.run({ id, context });
    if (setup.status === 'cancelled') return setup;
    if (setup.status === 'expired')
      throw new GoneException('The Credential setup request expired.');
    if (setup.status !== 'pending')
      throw new ConflictException('The Credential setup request has already finished.');
    await this.setups.finish(id, context, 'cancelled', setup.credentialId, this.time.now());
    const current = await this.getSetup.run({ id, context });
    if (current.status === 'expired')
      throw new GoneException('The Credential setup request expired.');
    if (current.status !== 'cancelled')
      throw new ConflictException('The Credential setup request has already finished.');
    return current;
  }
}
