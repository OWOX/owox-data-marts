import { z } from 'zod-v4';
import { adminMcpContext } from '../../../../../test/fixtures/mcp-auth-context';
import type { ProjectSettingsFacade } from '../../../../project-settings/facades/project-settings.facade';
import { GetProjectSettingsTool } from './get-project-settings.tool';

describe('GetProjectSettingsTool', () => {
  const facade = { getSettings: jest.fn() };
  const tool = new GetProjectSettingsTool(facade as unknown as ProjectSettingsFacade);

  beforeEach(() => jest.resetAllMocks());

  it.each([null, 'Revenue goals'])(
    'reads the settings for the trusted current project: %p',
    async description => {
      facade.getSettings.mockResolvedValue({ projectId: 'project-1', description });

      const result = await tool.handler({}, adminMcpContext);

      expect(facade.getSettings).toHaveBeenCalledWith(adminMcpContext.projectId);
      expect(result).toEqual({
        structuredContent: { description },
        content: [{ type: 'text', text: JSON.stringify({ description }, null, 2) }],
      });
      expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual({ description });
    }
  );

  it.each([
    null,
    [],
    { extra: true },
    { project_id: 'foreign' },
    { user_id: 'foreign' },
    { roles: ['admin'] },
  ])(
    'rejects invalid input and trusted-context overrides on direct handler calls: %p',
    async input => {
      await expect(tool.handler(input as never, adminMcpContext)).rejects.toThrow(z.ZodError);
      expect(facade.getSettings).not.toHaveBeenCalled();
    }
  );

  it('propagates a settings read failure', async () => {
    const error = new Error('Database unavailable');
    facade.getSettings.mockRejectedValue(error);

    await expect(tool.handler({}, adminMcpContext)).rejects.toBe(error);
  });

  it('declares the read scope and settings annotations', () => {
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });
});
