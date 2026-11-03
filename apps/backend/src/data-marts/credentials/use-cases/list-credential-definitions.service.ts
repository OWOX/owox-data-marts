import { Injectable } from '@nestjs/common';
import type { ResolvedCredentialDefinition } from '../dto/credential-api.dto';
import { CredentialDefinitionService } from '../services/credential-definition.service';

@Injectable()
export class ListCredentialDefinitionsService {
  constructor(private readonly definitions: CredentialDefinitionService) {}

  run(): Promise<ResolvedCredentialDefinition[]> {
    return this.definitions.list();
  }
}
