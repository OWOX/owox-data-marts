import { MCP_SERVER_GUIDE_URL } from '../tools/mcp-docs-urls';
import { MCP_GUIDES, MCP_GUIDE_TOPICS } from './mcp-guides';

// claude.ai lists these under "Add from OWOX Data Marts". Claude Code shows prompts as slash
// commands and resources as @ mentions. A prompt carries its guide, so the model gets the rules
// without a get_owox_guide call.

export interface McpPrompt {
  name: string;
  title: string;
  description: string;
  text: string;
}

export interface McpTextResource {
  name: string;
  uri: string;
  title: string;
  mimeType: string;
  text: string;
}

export const MCP_PROMPTS: McpPrompt[] = [
  {
    name: 'explore_data',
    title: 'Explore my data',
    description: 'Summarize the Data Marts in this project and suggest questions about them.',
    text: 'Show me what data my OWOX Data Marts project has. Call summarize_data_catalog. Then suggest questions that I can ask about this data.',
  },
  {
    name: 'create_report',
    title: 'Create a report',
    description:
      'Export Data Mart data to Google Sheets, Looker Studio, email, Slack, Microsoft Teams or Google Chat.',
    text: `Help me create an OWOX report from a Data Mart. If I did not name the Data Mart, the fields or the Destination, ask me.\n\n${MCP_GUIDES.reporting}`,
  },
  {
    name: 'set_up_data_mart',
    title: 'Set up a Data Mart',
    description: 'Create a Data Mart from a connector, SQL, a table or a view, then publish it.',
    text: `Help me set up an OWOX Data Mart. If I did not name the source and the Storage, ask me.\n\n${MCP_GUIDES.data_mart_setup}`,
  },
  {
    name: 'check_data_mart_runs',
    title: 'Check Data Mart runs',
    description: 'Find failed or stuck Data Mart runs and explain the cause.',
    text: `Check the recent runs of my OWOX Data Marts. Find failed or stuck runs and explain the cause. If I named a Data Mart, check only that Data Mart.\n\n${MCP_GUIDES.data_mart_runs}`,
  },
];

export const MCP_RESOURCES: McpTextResource[] = [
  ...MCP_GUIDE_TOPICS.map(topic => ({
    name: `guide_${topic}`,
    uri: `owox://guides/${topic}`,
    title: MCP_GUIDES[topic].split('\n', 1)[0],
    mimeType: 'text/markdown',
    text: MCP_GUIDES[topic],
  })),
  {
    name: 'mcp_documentation',
    uri: 'owox://docs/mcp',
    title: 'OWOX Data Marts MCP documentation',
    mimeType: 'text/plain',
    text: `The OWOX Data Marts MCP documentation is at ${MCP_SERVER_GUIDE_URL}. It tells how to connect a client, which tools need which scope, what costs credits, and how to fix common errors.`,
  },
];
