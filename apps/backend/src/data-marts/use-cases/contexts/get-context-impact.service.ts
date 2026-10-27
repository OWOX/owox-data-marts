import { Injectable } from '@nestjs/common';
import { ContextService } from '../../services/context/context.service';
import type { GetContextImpactCommand } from '../../dto/domain/get-context-impact.command';
import type { ContextImpactDto } from '../../dto/domain/context.dto';

@Injectable()
export class GetContextImpactService {
  constructor(private readonly contexts: ContextService) {}

  async run(command: GetContextImpactCommand): Promise<ContextImpactDto> {
    return this.contexts.getImpact(command.contextId, command.projectId);
  }
}
