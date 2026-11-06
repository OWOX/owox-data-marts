import type { McpAuthContext } from '../../auth/mcp-auth-context';
import type { McpDataMartManagementFacade } from '../../../../data-marts/facades/mcp-data-mart-management.facade';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import { dataMartToolCall } from './data-mart-tool-error';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ListSetupDataMartsTool } from './list-setup-data-marts.tool';
import { GetDataMartSetupTool } from './get-data-mart-setup.tool';
import { CreateDataMartTool } from './create-data-mart.tool';
import { UpdateDataMartTitleTool } from './update-data-mart-title.tool';
import { UpdateDataMartDescriptionTool } from './update-data-mart-description.tool';
import { UpdateDataMartIconTool } from './update-data-mart-icon.tool';
import { UpdateDataMartDefinitionTool } from './update-data-mart-definition.tool';
import { ValidateDataMartTool } from './validate-data-mart.tool';
import { GetDataMartChangeImpactTool } from './get-data-mart-change-impact.tool';
import { PublishDataMartTool } from './publish-data-mart.tool';
import { DeleteDataMartTool } from './delete-data-mart.tool';
import { ActualizeDataMartSchemaTool } from './actualize-data-mart-schema.tool';
import { UpdateDataMartSchemaTool } from './update-data-mart-schema.tool';
import { SetDataMartOwnersTool } from './set-data-mart-owners.tool';
import { SetDataMartContextsTool } from './set-data-mart-contexts.tool';
import { SetDataMartSharingTool } from './set-data-mart-sharing.tool';
const classes = [
  ListSetupDataMartsTool,
  GetDataMartSetupTool,
  CreateDataMartTool,
  UpdateDataMartTitleTool,
  UpdateDataMartDescriptionTool,
  UpdateDataMartIconTool,
  UpdateDataMartDefinitionTool,
  ValidateDataMartTool,
  GetDataMartChangeImpactTool,
  PublishDataMartTool,
  DeleteDataMartTool,
  ActualizeDataMartSchemaTool,
  UpdateDataMartSchemaTool,
  SetDataMartOwnersTool,
  SetDataMartContextsTool,
  SetDataMartSharingTool,
];
describe('Data Mart management tools', () => {
  const context = {
    projectId: 'project',
    userId: 'member',
    roles: ['admin'],
    scopes: ['mcp:read', 'mcp:write'],
  } as McpAuthContext;
  const facade = {
    create: jest.fn(),
    get: jest.fn(),
    updateDefinition: jest.fn(),
    delete: jest.fn(),
    setSharing: jest.fn(),
  };
  const origin = { getPublicOrigin: () => 'https://app.owox.com' } as PublicOriginService;
  const summary = {
    id: 'mart',
    title: 'Orders',
    status: 'DRAFT',
    definitionType: null,
    createdAt: 'now',
    modifiedAt: 'now',
  };
  beforeEach(() => jest.resetAllMocks());
  it.each(classes)('%p registers a complete strict schema', Tool => {
    const tool = new Tool(facade as unknown as McpDataMartManagementFacade, origin);
    expect(tool.zodSchema.safeParse({ project_id: 'other' }).success).toBe(false);
  });
  it('creates with the authenticated actor and returns a Data Mart URL', async () => {
    facade.create.mockResolvedValue(summary);
    const tool = new CreateDataMartTool(facade as unknown as McpDataMartManagementFacade, origin);
    const result = await tool.handler({ title: 'Orders', storage_id: 'storage' }, context);
    expect(facade.create).toHaveBeenCalledWith(
      { projectId: 'project', userId: 'member', roles: ['admin'] },
      { title: 'Orders', storageId: 'storage' }
    );
    expect(result.structuredContent).toMatchObject({
      data_mart_id: 'mart',
      status: 'DRAFT',
      url: expect.stringContaining('mart'),
    });
  });
  it('keeps HTTP role parity for sharing and schema refresh', () => {
    expect(
      new SetDataMartSharingTool(facade as unknown as McpDataMartManagementFacade).requiredRole
    ).toBe('viewer');
    expect(
      new ActualizeDataMartSchemaTool(facade as unknown as McpDataMartManagementFacade, origin)
        .requiredRole
    ).toBe('viewer');
  });
  it('does not return success when a mutation fails', async () => {
    facade.delete.mockRejectedValue(new ForbiddenException('private provider details'));
    await expect(
      new DeleteDataMartTool(facade as unknown as McpDataMartManagementFacade).handler(
        { data_mart_id: 'mart' },
        context
      )
    ).rejects.toThrow('You do not have permission');
  });
  it('does not expose provider exception payloads', async () => {
    await expect(
      dataMartToolCall(async () => {
        throw new BadRequestException({
          message: 'private-value-7136',
          password: 'private-value-7136',
        });
      })
    ).rejects.not.toThrow('private-value-7136');
  });
});
