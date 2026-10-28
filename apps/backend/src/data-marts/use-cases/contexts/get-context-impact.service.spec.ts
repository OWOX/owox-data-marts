import { GetContextImpactService } from './get-context-impact.service';
import { GetContextImpactCommand } from '../../dto/domain/get-context-impact.command';

describe('GetContextImpactService', () => {
  const PROJECT_ID = 'project-1';
  const CONTEXT_ID = 'ctx-1';

  it('counts only current non-admin members', async () => {
    const impact = { contextId: CONTEXT_ID };
    const contexts = { getImpact: jest.fn().mockResolvedValue(impact) };
    const idpProjectionsFacade = {
      getProjectMembersOrThrow: jest.fn().mockResolvedValue([
        { userId: 'admin-1', role: 'admin', isOutbound: false },
        { userId: 'editor-1', role: 'editor', isOutbound: false },
        { userId: 'gone-1', role: 'viewer', isOutbound: true },
      ]),
    };
    const service = new GetContextImpactService(contexts as never, idpProjectionsFacade as never);

    const result = await service.run(new GetContextImpactCommand(CONTEXT_ID, PROJECT_ID));

    expect(result).toBe(impact);
    expect(contexts.getImpact).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID, new Set(['editor-1']));
  });
});
