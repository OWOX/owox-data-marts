import { z } from 'zod-v4';
import { adminMcpContext } from '../../../../../test/fixtures/mcp-auth-context';
import type { ProjectSettingsFacade } from '../../../../project-settings/facades/project-settings.facade';
import { UpdateProjectDescriptionTool } from './update-project-description.tool';

describe('UpdateProjectDescriptionTool', () => {
  const facade = { updateDescription: jest.fn() };
  const tool = new UpdateProjectDescriptionTool(facade as unknown as ProjectSettingsFacade);

  beforeEach(() => jest.resetAllMocks());

  it.each([
    { label: 'null', description: null, savedDescription: null },
    { label: 'text', description: '  Revenue goals  ', savedDescription: 'Revenue goals' },
    {
      label: 'maximum length',
      description: 'a'.repeat(10_000),
      savedDescription: 'a'.repeat(10_000),
    },
    {
      label: 'emoji length',
      description: '☕️'.repeat(10_000),
      savedDescription: '☕️'.repeat(10_000),
    },
  ])(
    'forwards the required nullable description and returns the saved value: $label',
    async ({ description, savedDescription }) => {
      facade.updateDescription.mockResolvedValue({
        projectId: 'project-1',
        description: savedDescription,
      });
      const output = { description: savedDescription };

      const result = await tool.handler({ description }, adminMcpContext);

      expect(facade.updateDescription).toHaveBeenCalledWith(adminMcpContext.projectId, {
        description,
      });
      expect(result).toEqual({
        structuredContent: output,
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      });
      expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(output);
    }
  );

  it.each([
    {},
    { description: '' },
    { description: 1 },
    { description: 'a'.repeat(10_001) },
    { description: '☕️'.repeat(10_001) },
    { description: null, project_id: 'foreign' },
    { description: null, user_id: 'foreign' },
    { description: null, roles: ['admin'] },
    { description: 'Revenue', extra: true },
  ])('rejects invalid updates on direct handler calls: %p', async input => {
    await expect(tool.handler(input as never, adminMcpContext)).rejects.toThrow(z.ZodError);
    expect(facade.updateDescription).not.toHaveBeenCalled();
  });

  it('propagates a settings write failure', async () => {
    const error = new Error('Database unavailable');
    facade.updateDescription.mockRejectedValue(error);

    await expect(tool.handler({ description: null }, adminMcpContext)).rejects.toBe(error);
  });

  it('declares the write scope and description annotations', () => {
    expect(tool.requiredScopes).toEqual(['mcp:write']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });
});
