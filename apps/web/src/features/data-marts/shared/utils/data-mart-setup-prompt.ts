export interface DataMartSetupPromptOptions {
  projectId: string;
  dataMartId?: string;
  mcpServerUrl?: string;
}

export function buildDataMartSetupPrompt({
  projectId,
  dataMartId,
  mcpServerUrl,
}: DataMartSetupPromptOptions): string {
  return [
    dataMartId
      ? 'Help me continue setting up my existing OWOX Data Mart draft.'
      : 'Help me create and configure an OWOX Data Mart.',
    `Project ID: ${projectId}`,
    ...(dataMartId ? [`Data Mart ID: ${dataMartId}`] : []),
    'Use the OWOX Data Marts MCP tools. First call get_project_context and verify that the connected project matches the Project ID above. If the connected project differs, help me connect the correct project before making changes.',
    `If the tools are unavailable, help me connect the OWOX Data Marts MCP${mcpServerUrl ? ` at ${mcpServerUrl}` : ''} using https://docs.owox.com/docs/getting-started/setup-guide/mcp/ and wait until it is connected.`,
    dataMartId
      ? 'Call get_data_mart_configuration for this Data Mart ID and continue from its current configuration. Do not create another Data Mart.'
      : 'Ask about my data source and desired result, then call list_data_storages to help me choose an existing storage before creating the Data Mart.',
    'Guide me through the remaining setup, using the tools and their next_steps. When authorization or a file picker is needed, give me the setup_url to complete that step in OWOX, then read the saved configuration and continue.',
  ].join('\n\n');
}
