import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { ListDataStoragesTool } from './list-data-storages.tool';

describe('ListDataStoragesTool', () => {
  const facade = { listDataStorages: jest.fn() };
  const tool = new ListDataStoragesTool(facade as unknown as McpDataMartSetupFacade);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('discovers storage identities using only the trusted project and actor', async () => {
    const storages = [
      { id: 'storage-1', title: 'Warehouse', type: 'GOOGLE_BIGQUERY' },
      { id: 'storage-2', title: 'Orders', type: 'SNOWFLAKE' },
    ];
    facade.listDataStorages.mockResolvedValue(storages);

    const result = await tool.handler({}, mcpContext);

    expect(facade.listDataStorages).toHaveBeenCalledWith(setupContext);
    expect(result.structuredContent).toEqual({ storages });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({ storages });
  });

  it('returns an empty storage list', async () => {
    facade.listDataStorages.mockResolvedValue([]);

    const result = await tool.handler({}, mcpContext);

    expect(result.structuredContent).toEqual({ storages: [] });
  });

  it.each([
    { project_id: 'foreign-project' },
    { projectId: 'foreign-project' },
    { user_id: 'other-user' },
    { userId: 'other-user' },
    { roles: ['admin'] },
  ])('rejects untrusted context override %j before discovery', async override => {
    await expect(tool.handler(override as never, mcpContext)).rejects.toThrow();
    expect(facade.listDataStorages).not.toHaveBeenCalled();
  });

  it('propagates access errors', async () => {
    const error = new ForbiddenException('Storage discovery is not allowed');
    facade.listDataStorages.mockRejectedValueOnce(error);

    await expect(tool.handler({}, mcpContext)).rejects.toBe(error);
  });

  it('advertises serializable raw shapes with read access', () => {
    const inputJson = z.toJSONSchema(z.object(tool.zodSchema), { io: 'input' });
    const outputJson = z.toJSONSchema(z.object(tool.outputSchema));

    expect(inputJson.properties).toEqual({});
    expect(outputJson.properties).toHaveProperty('storages');
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });
});
