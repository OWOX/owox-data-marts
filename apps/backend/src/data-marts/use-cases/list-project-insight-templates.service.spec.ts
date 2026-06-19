import { ListProjectInsightTemplatesCommand } from '../dto/domain/list-project-insight-templates.command';
import type { InsightTemplateDto } from '../dto/domain/insight-template.dto';
import { RoleScope } from '../enums/role-scope.enum';
import { Action, EntityType } from '../services/access-decision';
import { ListProjectInsightTemplatesService } from './list-project-insight-templates.service';

describe('ListProjectInsightTemplatesService', () => {
  const insightTemplate = {
    id: 'insight-template-1',
    createdById: 'creator-1',
    dataMart: {
      id: 'dm-1',
      title: 'Marketing data mart',
    },
  };

  const insightTemplateDto = { id: 'insight-template-1' } as InsightTemplateDto;

  const createService = () => {
    const insightTemplateService = {
      listVisibleByProject: jest.fn().mockResolvedValue([insightTemplate]),
    };
    const contextAccessService = {
      getRoleScope: jest.fn().mockResolvedValue(RoleScope.SELECTED_CONTEXTS),
    };
    const userProjections = {
      getByUserId: jest.fn().mockReturnValue({ id: 'creator-1', name: 'Creator' }),
    };
    const userProjectionsFetcherService = {
      fetchRelevantUserProjections: jest.fn().mockResolvedValue(userProjections),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue(insightTemplateDto),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };

    const service = new ListProjectInsightTemplatesService(
      insightTemplateService as never,
      contextAccessService as never,
      userProjectionsFetcherService as never,
      mapper as never,
      accessDecisionService as never
    );

    return {
      service,
      insightTemplateService,
      contextAccessService,
      userProjections,
      mapper,
      accessDecisionService,
    };
  };

  it('passes selected-context scope to the visible insight-template query for non-admin users', async () => {
    const { service, insightTemplateService, contextAccessService, mapper, userProjections } =
      createService();

    const result = await service.run(
      new ListProjectInsightTemplatesCommand('project-1', 20, 40, 'user-1', ['viewer'])
    );

    expect(contextAccessService.getRoleScope).toHaveBeenCalledWith('user-1', 'project-1');
    expect(insightTemplateService.listVisibleByProject).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
      limit: 20,
      offset: 40,
    });
    expect(mapper.toDomainDto).toHaveBeenCalledWith(
      insightTemplate,
      null,
      userProjections.getByUserId('creator-1')
    );
    expect(result).toEqual([
      {
        insightTemplate: insightTemplateDto,
        dataMart: {
          id: 'dm-1',
          title: 'Marketing data mart',
        },
        canDelete: true,
      },
    ]);
  });

  it('uses entire-project scope without loading role scope for admin users', async () => {
    const { service, insightTemplateService, contextAccessService } = createService();

    await service.run(
      new ListProjectInsightTemplatesCommand('project-1', 10, 0, 'admin-1', ['admin'])
    );

    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(insightTemplateService.listVisibleByProject).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'admin-1',
      roles: ['admin'],
      roleScope: RoleScope.ENTIRE_PROJECT,
      limit: 10,
      offset: 0,
    });
  });

  it('marks project insights deletable only when the caller can edit the owning data mart', async () => {
    const { service, accessDecisionService } = createService();
    accessDecisionService.canAccess.mockResolvedValueOnce(false);

    const result = await service.run(
      new ListProjectInsightTemplatesCommand('project-1', 20, 0, 'user-1', ['viewer'])
    );

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      EntityType.DATA_MART,
      'dm-1',
      Action.EDIT,
      'project-1'
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        canDelete: false,
      })
    );
  });
});
