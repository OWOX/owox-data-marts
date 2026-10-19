jest.mock('snowflake-sdk', () => ({ __esModule: true, default: {} }));
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { PreviewDataMartTool } from './preview-data-mart.tool';
import { previewOutput } from './preview-data-mart.schemas';
import { DataMartStatus } from '../../../../../data-marts/enums/data-mart-status.enum';

const id = '00000000-0000-4000-8000-000000000001';
const actor = { userId: 'user', projectId: 'project', roles: ['editor'] };
const output = {
  dataMartId: id,
  revision: 3,
  observedModifiedAt: '2026-10-19T09:00:00.000Z',
  observedStatus: DataMartStatus.DRAFT,
  observedDefinitionType: null,
  currentness: 'not-guaranteed',
  schema: { freshness: 'current', inputRevision: 2, actualizedAt: null },
  columns: [{ name: 'field' }],
  rows: [['value']],
  rowCount: 1,
  limit: 10,
  truncated: false,
  payloadTruncated: false,
  warehouseChargesApply: true,
  warehouseTimeout: 'provider-dependent',
  reportRunCreated: false,
  owoxConsumptionRecorded: false,
};

describe('PreviewDataMartTool', () => {
  it('authorizes every direct invocation with both scopes, forwards cancellation and validates output', async () => {
    const authorization = { authorize: jest.fn().mockResolvedValue(actor) };
    const model = { preview: jest.fn().mockResolvedValue(output) };
    const tool = new PreviewDataMartTool(authorization as never, model as never);
    const context = {} as McpAuthContext;
    const signal = new AbortController().signal;
    const result = await tool.handler({ dataMartId: id }, context, signal);
    expect(authorization.authorize).toHaveBeenCalledWith(context, 'live');
    expect(model.preview).toHaveBeenCalledWith({ dataMartId: id, limit: 10, ...actor }, signal);
    expect(result.structuredContent).toEqual(previewOutput.parse(output));
    expect(tool.requiredScopes).toEqual(['mcp:read', 'mcp:write']);
    expect(tool.annotations.readOnlyHint).toBe(false);
    authorization.authorize.mockRejectedValue(new Error('revoked'));
    await expect(tool.handler({ dataMartId: id }, context)).rejects.toThrow('revoked');
    expect(model.preview).toHaveBeenCalledTimes(1);
  });

  it.each([
    { projectId: 'foreign' },
    { userId: 'other' },
    { roles: ['admin'] },
    { limit: 0 },
    { limit: 1001 },
    { limit: 2.5 },
    { filters: [] },
    { expectedRevision: 'fake' },
  ])('rejects unsafe or unsupported input %p before domain work', async extra => {
    const model = { preview: jest.fn() };
    const tool = new PreviewDataMartTool(
      { authorize: jest.fn().mockResolvedValue(actor) } as never,
      model as never
    );
    await expect(
      tool.handler({ dataMartId: id, ...extra } as never, {} as McpAuthContext)
    ).rejects.toThrow();
    expect(model.preview).not.toHaveBeenCalled();
  });

  it('uses real admission to reject read-only grants and changed current membership', async () => {
    const projects = {
      getProjectForUser: jest.fn().mockResolvedValue({ id: 'project', roles: ['editor'] }),
    };
    const model = { preview: jest.fn().mockResolvedValue(output) };
    const tool = new PreviewDataMartTool(
      new SetupAuthorizationService(projects as never),
      model as never
    );
    const context = {
      userId: 'user',
      projectId: 'project',
      roles: ['admin'],
      scopes: ['mcp:read'],
    } as McpAuthContext;
    await expect(tool.handler({ dataMartId: id }, context)).rejects.toThrow(
      'Insufficient MCP scopes'
    );
    expect(model.preview).not.toHaveBeenCalled();
    const writeContext = { ...context, scopes: ['mcp:read', 'mcp:write'] } as McpAuthContext;
    await tool.handler({ dataMartId: id }, writeContext);
    projects.getProjectForUser.mockResolvedValue({ id: 'project', roles: ['viewer'] });
    await expect(tool.handler({ dataMartId: id }, writeContext)).rejects.toThrow('current project');
    expect(model.preview).toHaveBeenCalledTimes(1);
  });

  it('rejects secret-bearing or non-JSON output from a broken facade contract', async () => {
    const model = { preview: jest.fn().mockResolvedValue({ ...output, credentials: 'secret' }) };
    const tool = new PreviewDataMartTool(
      { authorize: jest.fn().mockResolvedValue(actor) } as never,
      model as never
    );
    await expect(tool.handler({ dataMartId: id }, {} as McpAuthContext)).rejects.toThrow();
  });
});
