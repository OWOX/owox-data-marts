import type { ProjectSettingsFacade } from '../../../project-settings/facades/project-settings.facade';
import { McpInstructionsService } from './mcp-instructions.service';
import { composeMcpInstructions, MCP_SYSTEM_INSTRUCTIONS } from './mcp-system-instructions';

describe('MCP instructions', () => {
  it('returns only system instructions when the project description is empty', () => {
    expect(composeMcpInstructions(null)).toBe(MCP_SYSTEM_INSTRUCTIONS);
    expect(composeMcpInstructions('   ')).toBe(MCP_SYSTEM_INSTRUCTIONS);
  });

  it('appends project context after the system instructions', () => {
    const instructions = composeMcpInstructions('  Revenue means net revenue.  ');

    expect(instructions.startsWith(MCP_SYSTEM_INSTRUCTIONS)).toBe(true);
    expect(instructions).toContain('Project context:');
    expect(instructions.endsWith('Revenue means net revenue.')).toBe(true);
    expect(instructions.indexOf('Project context:')).toBeGreaterThan(
      instructions.indexOf('Project-specific context')
    );
  });

  it('loads the description for the authenticated project', async () => {
    const projectSettings = {
      getDescription: jest.fn().mockResolvedValue('Use fiscal weeks.'),
    } as unknown as jest.Mocked<ProjectSettingsFacade>;
    const service = new McpInstructionsService(projectSettings);

    await expect(service.getInstructions('project-1')).resolves.toContain('Use fiscal weeks.');
    expect(projectSettings.getDescription).toHaveBeenCalledWith('project-1');
  });
});
