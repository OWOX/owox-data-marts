import { Injectable } from '@nestjs/common';
import { ValidateContextIdsCommand } from '../../dto/domain/validate-context-ids.command';
import { ContextService } from '../../services/context/context.service';

@Injectable()
export class ValidateContextIdsService {
  constructor(private readonly contexts: ContextService) {}

  async run(command: ValidateContextIdsCommand): Promise<void> {
    await this.contexts.validateContextIds([...new Set(command.contextIds)], command.projectId);
  }
}
