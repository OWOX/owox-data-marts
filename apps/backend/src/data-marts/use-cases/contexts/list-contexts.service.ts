import { Injectable } from '@nestjs/common';
import type { ContextDto } from '../../dto/domain/context.dto';
import { ListContextsCommand } from '../../dto/domain/list-contexts.command';
import { ContextService } from '../../services/context/context.service';

@Injectable()
export class ListContextsService {
  constructor(private readonly contexts: ContextService) {}

  async run(command: ListContextsCommand): Promise<ContextDto[]> {
    return this.contexts.list(command.projectId);
  }
}
