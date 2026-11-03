import { BadRequestException, Injectable } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import type { AuthorizationContext } from '../../../idp';
import type { CredentialSetupDto } from '../dto/credential-setup.dto';
import { GetCredentialSetupService } from './get-credential-setup.service';

@Injectable()
export class WaitCredentialSetupService {
  constructor(private readonly getSetup: GetCredentialSetupService) {}

  async run(
    id: string,
    context: AuthorizationContext,
    waitSeconds = 0,
    signal?: AbortSignal
  ): Promise<CredentialSetupDto> {
    if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 25) {
      throw new BadRequestException('waitSeconds must be an integer between 0 and 25');
    }
    const deadline = Date.now() + waitSeconds * 1000;
    for (;;) {
      signal?.throwIfAborted();
      const setup = await this.getSetup.run(id, context);
      const remaining = deadline - Date.now();
      if (setup.status !== 'pending' || remaining <= 0) return setup;
      await setTimeout(Math.min(1000, remaining), undefined, { signal });
    }
  }
}
