import { ForbiddenException } from '@nestjs/common';
import { GetConnectorTargetConflictService } from './get-connector-target-conflict.service';
import { Action, EntityType } from '../services/access-decision';

const connectorDm = (id: string, title: string, fullyQualifiedName: string) => ({
  id,
  title,
  definition: { connector: { storage: { fullyQualifiedName } } },
});

describe('GetConnectorTargetConflictService', () => {
  const context = { projectId: 'project-1', userId: 'user-1', roles: ['editor'] } as never;
  const fqn = 'project.google_sheets_owox.plan';

  const createService = (options: { canEdit?: boolean; canSee?: boolean; others?: unknown[] }) => {
    const dataMartService = {
      getByIdAndProjectId: jest
        .fn()
        .mockResolvedValue({ id: 'dm-1', storage: { id: 'storage-1' } }),
      findConnectorTargetsByStorage: jest
        .fn()
        .mockResolvedValue(
          options.others ?? [
            connectorDm('dm-2', 'Plan 2026', '`Project`.google_sheets_owox."Plan"'),
          ]
        ),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(options.canEdit ?? true),
      canAccessMany: jest
        .fn()
        .mockImplementation((_u, _r, _t, ids: string[]) =>
          Promise.resolve(new Map(ids.map(id => [id, options.canSee ?? true])))
        ),
    };
    const service = new GetConnectorTargetConflictService(
      dataMartService as never,
      accessDecisionService as never
    );
    return { service, dataMartService, accessDecisionService };
  };

  it('names a visible Data Mart on the same storage whose target matches after quotes and case are removed', async () => {
    const { service, accessDecisionService } = createService({});

    await expect(service.run(context, 'dm-1', fqn)).resolves.toEqual({
      conflict: true,
      dataMart: { id: 'dm-2', title: 'Plan 2026' },
    });
    expect(accessDecisionService.canAccessMany).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      ['dm-2'],
      Action.SEE,
      'project-1'
    );
  });

  it('says another Data Mart when the caller cannot see the match', async () => {
    const { service } = createService({ canSee: false });

    await expect(service.run(context, 'dm-1', fqn)).resolves.toEqual({
      conflict: true,
      dataMart: null,
    });
  });

  it('never matches the Data Mart itself', async () => {
    const { service } = createService({ others: [connectorDm('dm-1', 'Self', fqn)] });

    await expect(service.run(context, 'dm-1', fqn)).resolves.toEqual({
      conflict: false,
      dataMart: null,
    });
  });

  it("reads only the Data Mart's own storage", async () => {
    const { service, dataMartService } = createService({});

    await service.run(context, 'dm-1', fqn);

    expect(dataMartService.findConnectorTargetsByStorage).toHaveBeenCalledWith(
      'project-1',
      'storage-1'
    );
  });

  it('refuses a member without EDIT on the Data Mart', async () => {
    const { service, dataMartService } = createService({ canEdit: false });

    await expect(service.run(context, 'dm-1', fqn)).rejects.toThrow(
      new ForbiddenException('You do not have permission to edit this Data Mart')
    );
    expect(dataMartService.findConnectorTargetsByStorage).not.toHaveBeenCalled();
  });
});
