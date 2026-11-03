import { Injectable } from '@nestjs/common';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import type { CredentialSetupDto } from '../dto/credential-setup.dto';
import type { CredentialSetup } from '../entities/credential-setup.entity';

@Injectable()
export class CredentialSetupMapper {
  constructor(private readonly time: SystemTimeService) {}

  toDto(setup: CredentialSetup): CredentialSetupDto {
    return {
      id: setup.id,
      mode: setup.mode,
      status:
        setup.status === 'pending' && setup.expiresAt <= this.time.now() ? 'expired' : setup.status,
      definitionId: setup.definitionId,
      credentialId: setup.credentialId,
      title: setup.title,
      createdAt: setup.createdAt,
      expiresAt: setup.expiresAt,
      completedAt: setup.completedAt,
    };
  }
}
