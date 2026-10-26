import { Injectable } from '@nestjs/common';
import { GetDataMartContextsCommand } from '../../dto/domain/get-data-mart-contexts.command';
import type { McpContextSummary } from '../../facades/mcp-contexts.facade';
import { ContextService } from '../../services/context/context.service';

@Injectable()
export class GetDataMartContextsService {
  constructor(private readonly contexts: ContextService) {}

  async run(command: GetDataMartContextsCommand): Promise<Record<string, McpContextSummary[]>> {
    return this.contexts.getDataMartContextSummaries(command.projectId, command.dataMartIds);
  }
}
