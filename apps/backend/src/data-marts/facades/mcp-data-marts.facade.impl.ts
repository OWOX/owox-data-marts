import { Injectable } from '@nestjs/common';
import { ListDataMartsCommand } from '../dto/domain/list-data-marts.command';
import { ListDataMartsService } from '../use-cases/list-data-marts.service';
import {
  McpDataMartsFacade,
  McpListDataMartsRequest,
  McpListDataMartsResponse,
} from './mcp-data-marts.facade';

@Injectable()
export class McpDataMartsFacadeImpl implements McpDataMartsFacade {
  constructor(private readonly listDataMartsService: ListDataMartsService) {}

  async listDataMarts(request: McpListDataMartsRequest): Promise<McpListDataMartsResponse> {
    const result = await this.listDataMartsService.run(
      new ListDataMartsCommand(request.projectId, request.userId, request.roles)
    );

    return {
      dataMarts: result.items.map(item => ({
        id: item.id,
        title: item.title,
        description: null,
        status: item.status,
        updatedAt: item.modifiedAt.toISOString(),
      })),
    };
  }
}
