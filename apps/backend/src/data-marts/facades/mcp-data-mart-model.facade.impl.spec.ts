jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import { McpDataMartModelFacadeImpl } from './mcp-data-mart-model.facade.impl';
import { DataMartModelService } from '../use-cases/data-mart-model.service';

it('delegates the authenticated request and cancellation to the domain use case', async () => {
  const domain = { preview: jest.fn().mockResolvedValue({ result: 'preview' }) };
  const facade = new McpDataMartModelFacadeImpl(
    domain as unknown as DataMartModelService,
    {} as never
  );
  const request = { projectId: 'project', userId: 'user', roles: [], dataMartId: 'mart' };
  const signal = new AbortController().signal;
  await expect(facade.preview(request, signal)).resolves.toEqual({ result: 'preview' });
  expect(domain.preview).toHaveBeenCalledWith(request, signal);
  domain.preview.mockRejectedValue(new Error('denied'));
  await expect(facade.preview(request, signal)).rejects.toThrow('denied');
});

it.each(['actualizeSchema', 'updateSchema', 'setRelationships', 'setAccess'] as const)(
  'delegates %s to the domain with its actor and revision',
  async method => {
    const mutations = {
      [method]: jest
        .fn()
        .mockResolvedValue({ state: 'completed', dataMartId: 'mart', revision: 2 }),
    };
    const facade = new McpDataMartModelFacadeImpl({} as never, mutations as never);
    const request = {
      projectId: 'project',
      userId: 'actor',
      roles: ['editor'],
      dataMartId: 'mart',
      expectedRevision: 1,
    };
    await expect(facade[method](request as never)).resolves.toMatchObject({ revision: 2 });
    expect(mutations[method]).toHaveBeenCalledWith(request);
    mutations[method].mockRejectedValue(new Error('forbidden'));
    await expect(facade[method](request as never)).rejects.toThrow('forbidden');
  }
);
