import { ListProjectScheduledTriggersCommand } from '../dto/domain/list-project-scheduled-triggers.command';
import type { ScheduledTriggerDto } from '../dto/domain/scheduled-trigger.dto';
import { RoleScope } from '../enums/role-scope.enum';
import { ScheduledReportRunConfigType } from '../scheduled-trigger-types/scheduled-report-run/schemas/scheduled-report-run-config.schema';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ListProjectScheduledTriggersService } from './list-project-scheduled-triggers.service';

describe('ListProjectScheduledTriggersService', () => {
  const trigger = {
    id: 'trigger-1',
    type: ScheduledTriggerType.REPORT_RUN,
    triggerConfig: {
      type: ScheduledReportRunConfigType,
      reportId: 'report-1',
    },
    createdById: 'creator-1',
    dataMart: {
      id: 'dm-1',
      title: 'Marketing data mart',
    },
  };

  const triggerDto = { id: 'trigger-1' } as ScheduledTriggerDto;

  const createService = () => {
    const scheduledTriggerService = {
      listVisibleByProject: jest.fn().mockResolvedValue([trigger]),
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
      toDomainDto: jest.fn().mockReturnValue(triggerDto),
    };
    const report = { id: 'report-1' };
    const reportDto = { id: 'report-1', title: 'Report target' };
    const reportResponse = { id: 'report-1', title: 'Report target' };
    const reportService = {
      getByIdsAndProjectIdAndDataMartIds: jest.fn().mockResolvedValue([report]),
    };
    const reportMapper = {
      toDomainDto: jest.fn().mockReturnValue(reportDto),
      toResponse: jest.fn().mockResolvedValue(reportResponse),
    };
    const connectorSecretService = {
      mask: jest.fn(async definition => definition),
    };

    const service = new ListProjectScheduledTriggersService(
      scheduledTriggerService as never,
      contextAccessService as never,
      userProjectionsFetcherService as never,
      mapper as never,
      reportService as never,
      reportMapper as never,
      connectorSecretService as never
    );

    return {
      service,
      scheduledTriggerService,
      contextAccessService,
      userProjections,
      mapper,
      reportService,
      reportMapper,
      connectorSecretService,
      reportResponse,
    };
  };

  it('passes selected-context scope to the visible-triggers query for non-admin users', async () => {
    const { service, scheduledTriggerService, contextAccessService, mapper, userProjections } =
      createService();

    const result = await service.run(
      new ListProjectScheduledTriggersCommand('project-1', 20, 40, 'user-1', ['viewer'])
    );

    expect(contextAccessService.getRoleScope).toHaveBeenCalledWith('user-1', 'project-1');
    expect(scheduledTriggerService.listVisibleByProject).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'user-1',
      roles: ['viewer'],
      roleScope: RoleScope.SELECTED_CONTEXTS,
      limit: 20,
      offset: 40,
    });
    expect(mapper.toDomainDto).toHaveBeenCalledWith(
      expect.objectContaining({
        id: trigger.id,
        triggerConfig: expect.objectContaining({
          report: expect.objectContaining({ id: 'report-1' }),
        }),
      }),
      userProjections.getByUserId('creator-1')
    );
    expect(result).toEqual([
      {
        trigger: triggerDto,
        dataMart: {
          id: 'dm-1',
          title: 'Marketing data mart',
        },
      },
    ]);
  });

  it('uses entire-project scope without loading role scope for admin users', async () => {
    const { service, scheduledTriggerService, contextAccessService } = createService();

    await service.run(
      new ListProjectScheduledTriggersCommand('project-1', 10, 0, 'admin-1', ['admin'])
    );

    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(scheduledTriggerService.listVisibleByProject).toHaveBeenCalledWith({
      projectId: 'project-1',
      userId: 'admin-1',
      roles: ['admin'],
      roleScope: RoleScope.ENTIRE_PROJECT,
      limit: 10,
      offset: 0,
    });
  });

  it('adds hydrated report data to project report-run trigger configs', async () => {
    const { service, mapper, reportService, reportMapper, reportResponse } = createService();

    await service.run(new ListProjectScheduledTriggersCommand('project-1', 20, 0, 'user-1', []));

    expect(reportService.getByIdsAndProjectIdAndDataMartIds).toHaveBeenCalledWith(
      ['report-1'],
      'project-1',
      ['dm-1']
    );
    expect(reportMapper.toResponse).toHaveBeenCalledWith({
      id: 'report-1',
      title: 'Report target',
    });
    expect(mapper.toDomainDto).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerConfig: {
          type: ScheduledReportRunConfigType,
          reportId: 'report-1',
          report: reportResponse,
        },
      }),
      expect.anything()
    );
  });

  it('adds masked connector definition data to project connector-run trigger configs', async () => {
    const connectorDefinition = {
      connector: {
        source: {
          name: 'FacebookMarketing',
          configuration: [{ accountId: '123' }],
          node: 'ads',
          fields: ['campaign'],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };
    const maskedConnectorDefinition = {
      connector: {
        source: {
          name: 'FacebookMarketing',
          configuration: [{ accountId: '123', apiKey: '**********' }],
          node: 'ads',
          fields: ['campaign'],
        },
        storage: { fullyQualifiedName: 'dataset.table' },
      },
    };
    const { service, scheduledTriggerService, mapper, connectorSecretService } = createService();
    connectorSecretService.mask.mockResolvedValueOnce(maskedConnectorDefinition);
    scheduledTriggerService.listVisibleByProject.mockResolvedValueOnce([
      {
        ...trigger,
        id: 'trigger-2',
        type: ScheduledTriggerType.CONNECTOR_RUN,
        triggerConfig: undefined,
        dataMart: {
          id: 'dm-2',
          title: 'Connector data mart',
          definition: connectorDefinition,
        },
      },
    ]);

    await service.run(new ListProjectScheduledTriggersCommand('project-1', 20, 0, 'user-1', []));

    expect(connectorSecretService.mask).toHaveBeenCalledWith(connectorDefinition);
    expect(mapper.toDomainDto).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerConfig: {
          type: 'scheduled-connector-run-config',
          connector: maskedConnectorDefinition,
        },
      }),
      expect.anything()
    );
  });
});
