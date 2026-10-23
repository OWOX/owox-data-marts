import { ForbiddenException } from '@nestjs/common';
import { z } from 'zod-v4';
import { mcpContext, setupContext } from '../../../../../test/fixtures/mcp-configuration';
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

      const result = await tool.handler({}, mcpContext);

      expect(facade.getSettings).toHaveBeenCalledWith(setupContext);
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
    'rejects invalid input and trusted-context overrides before calling the facade: %p',
    async input => {
      await expect(tool.handler(input as never, mcpContext)).rejects.toThrow();
      expect(facade.getSettings).not.toHaveBeenCalled();
    }
  );

  it('propagates the facade authorization error', async () => {
    const error = new ForbiddenException('Project access required');
    facade.getSettings.mockRejectedValue(error);

    await expect(tool.handler({}, mcpContext)).rejects.toBe(error);
  });

  it('declares the read scope and settings annotations', () => {
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });
});
