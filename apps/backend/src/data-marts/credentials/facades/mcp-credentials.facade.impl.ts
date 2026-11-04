import { Injectable } from '@nestjs/common';
import { McpCredentialMapper } from '../mappers/mcp-credential.mapper';
import { ConsentCredentialDefinitionService } from '../use-cases/consent-credential-definition.service';
import { DeleteCredentialService } from '../use-cases/delete-credential.service';
import { GetCredentialService } from '../use-cases/get-credential.service';
import { ListCredentialDefinitionsService } from '../use-cases/list-credential-definitions.service';
import { ListCredentialsService } from '../use-cases/list-credentials.service';
import { StartCredentialSetupService } from '../use-cases/start-credential-setup.service';
import { UpdateCredentialService } from '../use-cases/update-credential.service';
import { ValidateCredentialService } from '../use-cases/validate-credential.service';
import { WaitCredentialSetupService } from '../use-cases/wait-credential-setup.service';
import type {
  McpCredentialsFacade,
  McpCredentialsActor,
  McpStartCredentialSetupInput,
  McpUpdateCredentialInput,
} from './mcp-credentials.facade';

@Injectable()
export class McpCredentialsFacadeImpl implements McpCredentialsFacade {
  constructor(
    private readonly listDefinitionsService: ListCredentialDefinitionsService,
    private readonly listCredentials: ListCredentialsService,
    private readonly getCredential: GetCredentialService,
    private readonly updateCredential: UpdateCredentialService,
    private readonly validateCredential: ValidateCredentialService,
    private readonly consentCredentialDefinition: ConsentCredentialDefinitionService,
    private readonly deleteCredential: DeleteCredentialService,
    private readonly startCredentialSetup: StartCredentialSetupService,
    private readonly waitCredentialSetup: WaitCredentialSetupService,
    private readonly mapper: McpCredentialMapper
  ) {}

  async listDefinitions() {
    return (await this.listDefinitionsService.run()).map(dto =>
      this.mapper.toResolvedDefinition(dto)
    );
  }

  async list(actor: McpCredentialsActor) {
    return (await this.listCredentials.run(this.mapper.toAuthorizationContext(actor))).map(dto =>
      this.mapper.toListItem(dto)
    );
  }

  async get(actor: McpCredentialsActor, id: string) {
    return this.mapper.toCredential(
      await this.getCredential.run(id, this.mapper.toAuthorizationContext(actor))
    );
  }

  async update(actor: McpCredentialsActor, id: string, input: McpUpdateCredentialInput) {
    return this.mapper.toCredential(
      await this.updateCredential.run(
        id,
        this.mapper.toAuthorizationContext(actor),
        this.mapper.toUpdateInput(input)
      )
    );
  }

  async validate(actor: McpCredentialsActor, id: string) {
    return this.mapper.toCredential(
      await this.validateCredential.run(id, this.mapper.toAuthorizationContext(actor))
    );
  }

  async consentDefinition(actor: McpCredentialsActor, id: string) {
    return this.mapper.toCredential(
      await this.consentCredentialDefinition.run(id, this.mapper.toAuthorizationContext(actor))
    );
  }

  async delete(actor: McpCredentialsActor, id: string): Promise<void> {
    await this.deleteCredential.run(id, this.mapper.toAuthorizationContext(actor));
  }

  startSetup(actor: McpCredentialsActor, input: McpStartCredentialSetupInput) {
    return this.startCredentialSetup.run(this.mapper.toStartSetupCommand(actor, input));
  }

  getSetupStatus(actor: McpCredentialsActor, id: string, waitSeconds = 0, signal?: AbortSignal) {
    return this.waitCredentialSetup.run({
      id,
      context: this.mapper.toAuthorizationContext(actor),
      waitSeconds,
      signal,
    });
  }
}
