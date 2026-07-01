import { Injectable } from '@nestjs/common';
import { ListProjectInsightTemplatesCommand } from '../dto/domain/list-project-insight-templates.command';
import { ProjectInsightTemplateDto } from '../dto/domain/project-insight-template.dto';
import { RoleScope } from '../enums/role-scope.enum';
import { InsightTemplateMapper } from '../mappers/insight-template.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { ContextAccessService } from '../services/context/context-access.service';
import { InsightTemplateService } from '../services/insight-template.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListProjectInsightTemplatesService {
  constructor(
    private readonly insightTemplateService: InsightTemplateService,
    private readonly contextAccessService: ContextAccessService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: InsightTemplateMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: ListProjectInsightTemplatesCommand): Promise<ProjectInsightTemplateDto[]> {
    const isAdmin = command.roles.includes('admin');
    const roleScope = isAdmin
      ? RoleScope.ENTIRE_PROJECT
      : await this.contextAccessService.getRoleScope(command.userId, command.projectId);

    const insightTemplates = await this.insightTemplateService.listVisibleByProject({
      projectId: command.projectId,
      userId: command.userId,
      roles: command.roles,
      roleScope,
      limit: command.limit,
      offset: command.offset,
    });

    const userProjections =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(insightTemplates);

    return Promise.all(
      insightTemplates.map(async insightTemplate => {
        const createdByUser = insightTemplate.createdById
          ? (userProjections.getByUserId(insightTemplate.createdById) ?? null)
          : null;
        const canDelete = await this.accessDecisionService.canAccess(
          command.userId,
          command.roles,
          EntityType.DATA_MART,
          insightTemplate.dataMart.id,
          Action.EDIT,
          command.projectId
        );

        return new ProjectInsightTemplateDto(
          this.mapper.toDomainDto(insightTemplate, null, createdByUser),
          {
            id: insightTemplate.dataMart.id,
            title: insightTemplate.dataMart.title,
          },
          canDelete
        );
      })
    );
  }
}
