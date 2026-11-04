import { Injectable } from '@nestjs/common';
import type { GetCredentialSetupCommand } from '../dto/credential-setup-command.dto';
import type { CredentialSetupDto } from '../dto/credential-setup.dto';
import { CredentialSetupMapper } from '../mappers/credential-setup.mapper';
import { CredentialSetupService } from '../services/credential-setup.service';

@Injectable()
export class GetCredentialSetupService {
  constructor(
    private readonly setups: CredentialSetupService,
    private readonly mapper: CredentialSetupMapper
  ) {}

  async run({ id, context }: GetCredentialSetupCommand): Promise<CredentialSetupDto> {
    return this.mapper.toDto(await this.setups.getOwned(id, context));
  }
}
