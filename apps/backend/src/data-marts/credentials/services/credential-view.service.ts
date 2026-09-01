import { Injectable } from '@nestjs/common';
import type { CredentialDto } from '../dto/credential.dto';
import type { Credential } from '../entities/credential.entity';
import { CredentialMapper } from '../mappers/credential.mapper';
import { CredentialDefinitionService } from './credential-definition.service';
import { CredentialService } from './credential.service';
import type { CredentialValidationResult } from '../credential.types';

@Injectable()
export class CredentialViewService {
  constructor(
    private readonly definitions: CredentialDefinitionService,
    private readonly credentials: CredentialService,
    private readonly mapper: CredentialMapper
  ) {}

  async build(
    credential: Credential,
    validation?: CredentialValidationResult
  ): Promise<CredentialDto> {
    const [definition, bindings, lastUsedAt] = await Promise.all([
      this.definitions.getForView(credential),
      this.credentials.listBindings(credential.id),
      this.credentials.getLastUsedAt(credential.id),
    ]);
    return this.mapper.toDto(credential, definition, bindings, lastUsedAt, validation);
  }
}
