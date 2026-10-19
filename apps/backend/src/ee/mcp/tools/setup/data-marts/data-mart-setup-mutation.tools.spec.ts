jest.mock('../../../setup/setup-authorization.service', () => ({
  SetupAuthorizationService: jest.fn(),
}));
import { ForbiddenException } from '@nestjs/common';
import {
  CreateDataMartTool,
  UpdateDataMartDefinitionTool,
  UpdateDataMartMetadataTool,
  PublishDataMartTool,
  DeleteDataMartTool,
} from './data-mart-setup-mutation.tools';
const id = '2c970b00-6954-43bd-ac05-c89b9ca9043f';
const cases = [
  [CreateDataMartTool, 'create', { storageId: id, title: 'Revenue', operationId: 'logical' }],
  [
    UpdateDataMartDefinitionTool,
    'updateDefinition',
    {
      dataMartId: id,
      expectedRevision: 1,
      operationId: 'logical',
      definition: { type: 'SQL', sqlQuery: 'SELECT 1' },
    },
  ],
  [
    UpdateDataMartMetadataTool,
    'updateMetadata',
    { dataMartId: id, expectedRevision: 1, operationId: 'logical', description: null },
  ],
  [PublishDataMartTool, 'publish', { dataMartId: id, expectedRevision: 1, operationId: 'logical' }],
  [
    DeleteDataMartTool,
    'delete',
    { dataMartId: id, expectedRevision: 1, operationId: 'logical', impactDigest: 'reviewed' },
  ],
] as const;
const actor = { projectId: 'project', userId: 'editor', roles: ['editor'] };
describe.each(cases)('%s', (Tool, method, input) => {
  it('requires mutation admission and passes current actor plus stable operation identity on retry', async () => {
    const authorization = { authorize: jest.fn().mockResolvedValue(actor) };
    const facade = {
      [method]: jest.fn().mockResolvedValue({ state: 'completed', resourceId: id, revision: 2 }),
    };
    const tool = new Tool(authorization as never, facade as never);
    await tool.handler(input as never, {} as never);
    await tool.handler(input as never, {} as never);
    expect(authorization.authorize).toHaveBeenCalledWith({}, 'mutation');
    expect(facade[method]).toHaveBeenNthCalledWith(1, { ...input, ...actor });
    expect(facade[method]).toHaveBeenNthCalledWith(2, { ...input, ...actor });
    expect(tool.requiredScopes).toEqual(['mcp:read', 'mcp:write']);
  });
  it('does not call the domain when current project membership or scopes are denied', async () => {
    const authorization = { authorize: jest.fn().mockRejectedValue(new ForbiddenException()) };
    const facade = { [method]: jest.fn() };
    await expect(
      new Tool(authorization as never, facade as never).handler(input as never, {} as never)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(facade[method]).not.toHaveBeenCalled();
  });
  it('rejects actor injection, empty operation identity, and raw connector configuration', async () => {
    const authorization = { authorize: jest.fn().mockResolvedValue(actor) };
    const facade = { [method]: jest.fn() };
    const tool = new Tool(authorization as never, facade as never);
    await expect(
      tool.handler({ ...input, userId: 'other' } as never, {} as never)
    ).rejects.toThrow();
    await expect(
      tool.handler({ ...input, operationId: '' } as never, {} as never)
    ).rejects.toThrow();
    expect(facade[method]).not.toHaveBeenCalled();
  });
});
