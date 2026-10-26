import { Injectable } from '@nestjs/common';
import { ContextService } from '../../services/context/context.service';
import type { DeleteContextCommand } from '../../dto/domain/delete-context.command';

@Injectable()
export class DeleteContextService {
  constructor(private readonly contexts: ContextService) {}

  async run(command: DeleteContextCommand): Promise<void> {
    return this.contexts.delete(command.contextId, command.projectId);
  }
}
