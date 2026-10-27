import { ForbiddenException } from '@nestjs/common';
import { GetDataMartInputSourceChangeImpactCommand } from '../dto/domain/get-data-mart-input-source-change-impact.command';
import { Action, EntityType } from '../services/access-decision';
import { GetDataMartInputSourceChangeImpactService } from './get-data-mart-input-source-change-impact.service';

describe('GetDataMartInputSourceChangeImpactService', () => {
  const dataMart = { id: 'dm-orders', projectId: 'project-1', storage: { id: 'storage-1' } };
  const referencing = [
    { id: 'dm-retail', title: 'Retail orders' },
    { id: 'dm-hidden', title: 'Hidden' },
  ];

  const setup = (access: { canEdit?: boolean; visible?: string[] } = {}) => {
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(access.canEdit ?? true),
      canAccessMany: jest.fn(async (_u: string, _r: string[], _t: EntityType, ids: string[]) => {
        const visible = new Set(access.visible ?? ids);
        return new Map(ids.map(id => [id, visible.has(id)]));
      }),
    };
    const sqlReferenceResolver = {
      findReferencingDataMarts: jest.fn().mockResolvedValue(referencing),
    };
    const service = new GetDataMartInputSourceChangeImpactService(
      { getByIdAndProjectId: jest.fn().mockResolvedValue(dataMart) } as never,
      {
        findBySourceDataMartId: jest.fn().mockResolvedValue([{}, {}]),
        countByTargetDataMartId: jest.fn().mockResolvedValue(3),
      } as never,
      { countByDataMartIdAndProjectId: jest.fn().mockResolvedValue(5) } as never,
      accessDecisionService as never,
      sqlReferenceResolver as never
    );
    return { service, accessDecisionService, sqlReferenceResolver };
  };

  const command = (userId = 'user-1') =>
    new GetDataMartInputSourceChangeImpactCommand('dm-orders', 'project-1', userId, ['editor']);

  it('counts every dependent and names the referencing Data Marts the caller can see', async () => {
    const { service, accessDecisionService, sqlReferenceResolver } = setup({
      visible: ['dm-retail'],
    });

    const impact = await service.run(command());

    expect(sqlReferenceResolver.findReferencingDataMarts).toHaveBeenCalledWith(dataMart);
    expect(accessDecisionService.canAccessMany).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      EntityType.DATA_MART,
      ['dm-retail', 'dm-hidden'],
      Action.SEE,
      'project-1'
    );
    expect(impact).toEqual({
      outboundRelationshipsCount: 2,
      inboundRelationshipsCount: 3,
      reportsCount: 5,
      referencingDataMartsCount: 2,
      referencingDataMarts: [{ id: 'dm-retail', title: 'Retail orders' }],
    });
  });

  it('names every referencing Data Mart for a call without a user', async () => {
    const { service, accessDecisionService } = setup();

    const impact = await service.run(command(''));

    expect(accessDecisionService.canAccessMany).not.toHaveBeenCalled();
    expect(impact.referencingDataMarts).toEqual(referencing);
  });

  it('refuses a caller who cannot edit the Data Mart', async () => {
    const { service, sqlReferenceResolver } = setup({ canEdit: false });

    await expect(service.run(command())).rejects.toBeInstanceOf(ForbiddenException);
    expect(sqlReferenceResolver.findReferencingDataMarts).not.toHaveBeenCalled();
  });
});
