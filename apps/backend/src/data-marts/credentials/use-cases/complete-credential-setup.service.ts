import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
} from '@nestjs/common';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import type { CompleteCredentialSetupCommand } from '../dto/credential-setup-command.dto';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import type { CredentialSetupDto } from '../dto/credential-setup.dto';
import { CredentialSetupService } from '../services/credential-setup.service';
import { GetCredentialService } from './get-credential.service';
import { GetCredentialSetupService } from './get-credential-setup.service';

@Injectable()
export class CompleteCredentialSetupService {
  constructor(
    private readonly setups: CredentialSetupService,
    private readonly getCredential: GetCredentialService,
    private readonly access: AccessDecisionService,
    private readonly getSetup: GetCredentialSetupService,
    private readonly time: SystemTimeService
  ) {}

  async run({
    id,
    context,
    credentialId,
  }: CompleteCredentialSetupCommand): Promise<CredentialSetupDto> {
    const setup = await this.getSetup.run({ id, context });
    if (setup.status === 'expired')
      throw new GoneException('The Credential setup request expired.');
    if (setup.status === 'completed' && setup.credentialId === credentialId) return setup;
    if (setup.status !== 'pending')
      throw new ConflictException('The Credential setup request has already finished.');
    if (setup.mode === 'update' && setup.credentialId !== credentialId) {
      throw new BadRequestException('This setup request is for a different Credential');
    }
    const credential = await this.getCredential.run(credentialId, context);
    if (setup.definitionId && setup.definitionId !== credential.definition.id) {
      throw new BadRequestException('The saved Credential uses a different provider');
    }
    if (
      !(await this.access.canAccess(
        context.userId,
        context.roles ?? [],
        EntityType.CREDENTIAL,
        credentialId,
        Action.EDIT,
        context.projectId
      ))
    ) {
      throw new ForbiddenException('You do not have permission to maintain this Credential');
    }
    await this.setups.finish(id, context, 'completed', credentialId, this.time.now());
    const current = await this.getSetup.run({ id, context });
    if (current.status === 'expired')
      throw new GoneException('The Credential setup request expired.');
    if (current.status !== 'completed' || current.credentialId !== credentialId) {
      throw new ConflictException('The Credential setup request has already finished.');
    }
    return current;
  }
}
