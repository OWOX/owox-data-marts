import { describe, expect, it } from 'vitest';
import { buildDataMartSetupPrompt } from './data-mart-setup-prompt';

describe('Data Mart setup prompt', () => {
  it('asks to inspect and continue the existing draft in the matching MCP project', () => {
    const prompt = buildDataMartSetupPrompt({
      projectId: 'project-7118',
      dataMartId: 'mart-existing',
      mcpServerUrl: 'https://project-7118.mcp.owox.com/mcp',
    });

    expect(prompt).toContain('Project ID: project-7118');
    expect(prompt).toContain('Data Mart ID: mart-existing');
    expect(prompt).toContain('https://project-7118.mcp.owox.com/mcp');
    expect(prompt).toContain('get_project_context');
    expect(prompt).toContain('get_data_mart_configuration');
    expect(prompt).toContain('Do not create another Data Mart');
    expect(prompt).toContain('If the connected project differs');
    expect(prompt).toContain('OWOX Data Marts MCP');
  });

  it('helps choose an existing storage before creating a Data Mart', () => {
    const prompt = buildDataMartSetupPrompt({ projectId: 'project-new' });

    expect(prompt).toContain('Project ID: project-new');
    expect(prompt).toContain('list_data_storages');
    expect(prompt).toContain('data source and desired result');
    expect(prompt).not.toContain('Data Mart ID:');
    expect(prompt).not.toContain('undefined');
    expect(prompt).toContain('connect the OWOX Data Marts MCP');
  });
});
