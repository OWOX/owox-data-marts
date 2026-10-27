import { Injectable } from '@nestjs/common';
import { CreateContextCommand } from '../dto/domain/create-context.command';
import { UpdateContextMetadataCommand } from '../dto/domain/update-context-metadata.command';
import { GetContextImpactCommand } from '../dto/domain/get-context-impact.command';
import { DeleteContextCommand } from '../dto/domain/delete-context.command';
import { SetContextMembersCommand } from '../dto/domain/set-context-members.command';
import { ListContextsCommand } from '../dto/domain/list-contexts.command';
import { ValidateContextIdsCommand } from '../dto/domain/validate-context-ids.command';
import { GetDataMartContextsCommand } from '../dto/domain/get-data-mart-contexts.command';
import type { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';
import type { DataMartIconValue } from '../enums/data-mart-icon.enum';
import { ContextMapper } from '../mappers/context.mapper';
import { CreateContextService } from '../use-cases/contexts/create-context.service';
import { UpdateContextMetadataService } from '../use-cases/contexts/update-context-metadata.service';
import { GetContextImpactService } from '../use-cases/contexts/get-context-impact.service';
import { DeleteContextService } from '../use-cases/contexts/delete-context.service';
import { SetContextMembersService } from '../use-cases/contexts/set-context-members.service';
import { ListContextsService } from '../use-cases/contexts/list-contexts.service';
import { ValidateContextIdsService } from '../use-cases/contexts/validate-context-ids.service';
import { GetDataMartContextsService } from '../use-cases/contexts/get-data-mart-contexts.service';
import type {
  McpContextsFacade,
  McpProjectActor,
  McpContext,
  McpContextSummary,
} from './mcp-contexts.facade';

@Injectable()
export class McpContextsFacadeImpl implements McpContextsFacade {
  constructor(
    private readonly createContextService: CreateContextService,
    private readonly updateContextMetadataService: UpdateContextMetadataService,
    private readonly getContextImpactService: GetContextImpactService,
    private readonly deleteContextService: DeleteContextService,
    private readonly setContextMembersService: SetContextMembersService,
    private readonly listContextsService: ListContextsService,
    private readonly validateContextIdsService: ValidateContextIdsService,
    private readonly getDataMartContextsService: GetDataMartContextsService,
    private readonly mapper: ContextMapper
  ) {}

  createContext(
    actor: McpProjectActor,
    input: { name: string; description?: string | null; icon?: DataMartIconValue | null }
  ): Promise<ContextDto> {
    return this.createContextService.run(
      new CreateContextCommand(
        actor.projectId,
        actor.userId,
        input.name,
        input.description,
        input.icon
      )
    );
  }

  updateContextMetadata(
    actor: McpProjectActor,
    input: {
      contextId: string;
      name?: string;
      description?: string | null;
      icon?: DataMartIconValue | null;
    }
  ): Promise<ContextDto> {
    return this.updateContextMetadataService.run(
      new UpdateContextMetadataCommand(
        input.contextId,
        actor.projectId,
        input.name,
        input.description,
        input.icon
      )
    );
  }

  getContextImpact(
    actor: McpProjectActor,
    input: { contextId: string }
  ): Promise<ContextImpactDto> {
    return this.getContextImpactService.run(
      new GetContextImpactCommand(input.contextId, actor.projectId)
    );
  }

  deleteContext(actor: McpProjectActor, input: { contextId: string }): Promise<void> {
    return this.deleteContextService.run(
      new DeleteContextCommand(input.contextId, actor.projectId)
    );
  }

  setContextMembers(
    actor: McpProjectActor,
    input: { contextId: string; assignedUserIds: string[] }
  ): Promise<{ assignedUserIds: string[]; droppedAdminIds: string[] }> {
    return this.setContextMembersService.run(
      new SetContextMembersCommand(input.contextId, actor.projectId, input.assignedUserIds)
    );
  }

  async listContexts(projectId: string): Promise<McpContext[]> {
    const contexts = await this.listContextsService.run(new ListContextsCommand(projectId));
    return contexts.map(context => this.mapper.toMcpContext(context));
  }

  validateContextIds(projectId: string, contextIds: string[]): Promise<void> {
    return this.validateContextIdsService.run(new ValidateContextIdsCommand(projectId, contextIds));
  }

  getDataMartContexts(
    projectId: string,
    dataMartIds: string[]
  ): Promise<Record<string, McpContextSummary[]>> {
    return this.getDataMartContextsService.run(
      new GetDataMartContextsCommand(projectId, dataMartIds)
    );
  }
}
