import { Injectable } from '@nestjs/common';
import { ContextService } from '../../services/context/context.service';
import type { UpdateContextMetadataCommand } from '../../dto/domain/update-context-metadata.command';
import type { ContextDto } from '../../dto/domain/context.dto';

@Injectable()
export class UpdateContextMetadataService {
  constructor(private readonly contexts: ContextService) {}

  async run(command: UpdateContextMetadataCommand): Promise<ContextDto> {
    return this.contexts.update(
      command.contextId,
      command.projectId,
      command.name,
      command.description,
      command.icon
    );
  }
}
