import { ListProjectDataMartRunsCommand } from '../dto/domain/list-project-data-mart-runs.command';
import type { DataMartRunDto } from '../dto/domain/data-mart-run.dto';
import { RoleScope } from '../enums/role-scope.enum';
import { ListProjectDataMartRunsService } from './list-project-data-mart-runs.service';

describe('ListProjectDataMartRunsService', () => {
  const run = {
    id: 'run-1',
    createdById: 'creator-1',
    dataMart: {
      id: 'dm-1',
      title: 'Marketing data mart',
    },
  };

  const runDto = { id: 'run-1', dataMartId: 'dm-1' } as DataMartRunDto;

  const createService = () => {
    const dataMartRunService = {
      listVisibleByProject: jest.fn().mockResolvedValue([run]),
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
      toDataMartRunDto: jest.fn().mockReturnValue(runDto),
    };

    const service = new ListProjectDataMartRunsService(
      dataMartRunService as never,
      contextAccessService as never,
      userProjectionsFetcherService as never,
      mapper as never
    );

    return {
      service,
      dataMartRunService,
      contextAccessService,
      userProjectionsFetcherService,
      userProjections,
      mapper,
    };
  };

  it('passes selected-context scope to the visible-runs query for non-admin users', async () => {
    const { service, dataMartRunService, contextAccessService, mapper, userProjections } =
      createService();

    const result = await service.run(
      new ListProjectDataMartRunsCommand('project-1', 20, 40, 'user-1', ['editor'])
    );

    expect(contextAccessService.getRoleScope).toHaveBeenCalledWith('user-1', 'project-1');
    expect(dataMartRunService.listVisibleByProject).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['editor'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
      limit: 20,
      offset: 40,
    });
    expect(mapper.toDataMartRunDto).toHaveBeenCalledWith(
      run,
      userProjections.getByUserId('creator-1')
    );
    expect(result).toEqual([
      {
        run: runDto,
        dataMart: {
          id: 'dm-1',
          title: 'Marketing data mart',
        },
      },
    ]);
  });

  it('uses entire-project scope without loading role scope for admin users', async () => {
    const { service, dataMartRunService, contextAccessService } = createService();

    await service.run(new ListProjectDataMartRunsCommand('project-1', 10, 0, 'admin-1', ['admin']));

    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(dataMartRunService.listVisibleByProject).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'admin-1',
      roles: ['admin'],
      roleScope: RoleScope.ENTIRE_PROJECT,
      limit: 10,
      offset: 0,
    });
  });
});
