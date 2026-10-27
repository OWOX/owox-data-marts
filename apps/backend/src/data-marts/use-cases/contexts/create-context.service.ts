import { Injectable } from '@nestjs/common';
import { ContextService } from '../../services/context/context.service';
import type { CreateContextCommand } from '../../dto/domain/create-context.command';
import type { ContextDto } from '../../dto/domain/context.dto';

@Injectable()
export class CreateContextService {
  constructor(private readonly contexts: ContextService) {}

  async run(command: CreateContextCommand): Promise<ContextDto> {
    return this.contexts.create(
      command.projectId,
      command.userId,
      command.name,
      command.description,
      command.icon ?? null
    );
  }
}
