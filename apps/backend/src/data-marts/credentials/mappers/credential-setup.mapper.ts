import { Injectable } from '@nestjs/common';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import type { AuthorizationContext } from '../../../idp';
import type {
  CompleteCredentialSetupApiDto,
  CredentialSetupResponseApiDto,
  StartCredentialSetupApiDto,
} from '../dto/credential-setup-api.dto';
import type {
  CancelCredentialSetupCommand,
  CompleteCredentialSetupCommand,
  GetCredentialSetupCommand,
  StartCredentialSetupCommand,
} from '../dto/credential-setup-command.dto';
import type { CredentialSetupDto } from '../dto/credential-setup.dto';
import type { CredentialSetup } from '../entities/credential-setup.entity';

@Injectable()
export class CredentialSetupMapper {
  constructor(private readonly time: SystemTimeService) {}

  toStartCommand(
    context: AuthorizationContext,
    input: StartCredentialSetupApiDto
  ): StartCredentialSetupCommand {
    return {
      context,
      input: {
        definitionId: input.definitionId,
        credentialId: input.credentialId,
        title: input.title,
      },
    };
  }

  toGetCommand(context: AuthorizationContext, id: string): GetCredentialSetupCommand {
    return { id, context };
  }

  toCompleteCommand(
    context: AuthorizationContext,
    id: string,
    input: CompleteCredentialSetupApiDto
  ): CompleteCredentialSetupCommand {
    return { id, context, credentialId: input.credentialId };
  }

  toCancelCommand(context: AuthorizationContext, id: string): CancelCredentialSetupCommand {
    return { id, context };
  }

  toResponse(dto: CredentialSetupDto): CredentialSetupResponseApiDto {
    return {
      id: dto.id,
      mode: dto.mode,
      status: dto.status,
      definitionId: dto.definitionId,
      credentialId: dto.credentialId,
      title: dto.title,
      createdAt: dto.createdAt,
      expiresAt: dto.expiresAt,
      completedAt: dto.completedAt,
    };
  }

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
