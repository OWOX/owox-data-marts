import type { McpDataMartSetupFacade } from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import { z } from 'zod-v4';
import {
  dataMartConfiguration as dataMart,
  mcpContext as context,
} from '../../../../../test/fixtures/mcp-configuration';
import { UpdateDataMartMetadataTool } from './update-data-mart-metadata.tool';

describe('UpdateDataMartMetadataTool', () => {
  let facade: { updateDataMartMetadata: jest.Mock };
  let tool: UpdateDataMartMetadataTool;

  beforeEach(() => {
    facade = { updateDataMartMetadata: jest.fn().mockResolvedValue(dataMart) };
    tool = new UpdateDataMartMetadataTool(facade as unknown as McpDataMartSetupFacade);
  });

  it.each([
    { title: 'Revenue' },
    { description: 'Business description' },
    { icon: 'lucide:chart-bar' },
    { description: null, icon: null },
    { title: 'Revenue', description: 'Notes', icon: 'purchases' },
  ])('forwards only the supplied metadata %j with the authenticated actor', async properties => {
    const result = await tool.handler({ data_mart_id: 'mart-1', ...properties } as never, context);
    expect(facade.updateDataMartMetadata).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'user-1', roles: ['editor'] },
      { dataMartId: 'mart-1', ...properties }
    );
    expect(result.structuredContent).toEqual({ data_mart: dataMart });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(
      result.structuredContent
    );
  });

  it.each([
    ['empty patch', {}],
    ['undefined fields only', { title: undefined }],
    ['null title', { title: null }],
    ['empty title', { title: '' }],
    ['empty description', { description: '' }],
    ['non-string description', { description: 42 }],
    ['empty icon', { icon: '' }],
    ['unknown icon', { icon: 'unknown-icon' }],
    ['invalid Lucide name', { icon: 'lucide:Invalid_Name' }],
    ['overlong icon', { icon: `lucide:${'a'.repeat(128)}` }],
    ['overlong UTF-8 description', { title: 'Revenue', description: '€'.repeat(21846) }],
    ['project override', { title: 'Revenue', project_id: 'other-project' }],
    ['actor override', { title: 'Revenue', user_id: 'other-user' }],
    ['unrelated field', { title: 'Revenue', available_for_reporting: true }],
  ] as const)('rejects %s before any mutation', async (_name, properties) => {
    await expect(
      tool.handler({ data_mart_id: 'mart-1', ...properties } as never, context)
    ).rejects.toThrow();
    expect(facade.updateDataMartMetadata).not.toHaveBeenCalled();
  });

  it('accepts descriptions at the UTF-8 byte boundary', () => {
    const description = '€'.repeat(21845);
    expect(tool.parseInput({ data_mart_id: 'mart-1', description }).description).toBe(description);
  });

  it('propagates domain permission and update failures', async () => {
    const error = new Error('Edit denied');
    facade.updateDataMartMetadata.mockRejectedValue(error);
    await expect(tool.handler({ data_mart_id: 'mart-1', title: 'Revenue' }, context)).rejects.toBe(
      error
    );
  });
});
