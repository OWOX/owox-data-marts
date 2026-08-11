import { Logger } from '@nestjs/common';
import type { ProjectSettingsFacade } from '../../../project-settings/facades/project-settings.facade';
import { McpInstructionsService } from './mcp-instructions.service';
import { composeMcpInstructions, MCP_SYSTEM_INSTRUCTIONS } from './mcp-system-instructions';
import { hasUniqueCountFieldCandidate } from '../tools/query-data-mart.input';

const UNIQUE_COUNT_EXAMPLE_FIELD = 'orders__unique_count';
const DISPLAY_FORM_NON_EXAMPLES = ['Orders Unique Count', '<Prefix> Unique Count'];

describe('MCP instructions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns only system instructions when the project description is empty', () => {
    expect(composeMcpInstructions(null)).toBe(MCP_SYSTEM_INSTRUCTIONS);
    expect(composeMcpInstructions('   ')).toBe(MCP_SYSTEM_INSTRUCTIONS);
  });

  // The rule the tool ENFORCES (UniqueCountFieldUnsupportedClauseError): a model that reads only
  // half of it retries the same rejected call, since the error tells it to drop the clause rather
  // than to add the field back to "fields". Both halves have to survive an instructions edit.
  it('states where a joined Unique Count field may and may not be used', () => {
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('Unique Count field');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain(
      'It can be selected in query_data_mart\'s "fields" and ordered by in its "sort" (using the same exact name), but never placed in filters, slices, aggregations, or date_buckets'
    );
    // The report tools have no Unique Count parameter, and their `fields` reaches the projection
    // verbatim — so a pseudo-field there saves a report that fails every run.
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('never in add_report/update_report');
  });

  // A model copies the documented example verbatim into `fields`, so the instructions must show the
  // SQL name — the display form is recognised only to reach the purpose-written
  // UnmatchedUniqueCountFieldError instead of the generic field_not_found (#6792).
  it('illustrates the joined Unique Count field with a name the tool recognises', () => {
    expect(hasUniqueCountFieldCandidate([UNIQUE_COUNT_EXAMPLE_FIELD])).toBe(true);
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain(`"${UNIQUE_COUNT_EXAMPLE_FIELD}"`);
    for (const displayForm of DISPLAY_FORM_NON_EXAMPLES) {
      expect(MCP_SYSTEM_INSTRUCTIONS).not.toContain(`"${displayForm}"`);
    }
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

  it('falls back to system instructions when the project description cannot be loaded', async () => {
    const error = new Error('settings unavailable');
    const projectSettings = {
      getDescription: jest.fn().mockRejectedValue(error),
    } as unknown as jest.Mocked<ProjectSettingsFacade>;
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const service = new McpInstructionsService(projectSettings);

    await expect(service.getInstructions('project-1')).resolves.toBe(MCP_SYSTEM_INSTRUCTIONS);
    expect(warn).toHaveBeenCalledWith('Failed to load project-specific MCP instructions', {
      projectId: 'project-1',
      error: 'settings unavailable',
    });
  });
});
