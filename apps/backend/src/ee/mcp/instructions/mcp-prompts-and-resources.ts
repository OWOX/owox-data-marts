import { MCP_SERVER_GUIDE_URL } from '../tools/mcp-docs-urls';
import { MCP_GUIDES, MCP_GUIDE_TOPICS, type McpGuideTopic } from './mcp-guides';

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

// Tool descriptions tell the model to call get_owox_guide first, so the prompt says that it has the guide.
const withGuide = (task: string, topic: McpGuideTopic): string =>
  `${task} The guide for this task follows, so do not call get_owox_guide({topic: "${topic}"}).\n\n${MCP_GUIDES[topic]}`;

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
    text: withGuide(
      'Help me create an OWOX report from a Data Mart. If I did not name the Data Mart, the fields or the Destination, ask me.',
      'reporting'
    ),
  },
  {
    name: 'set_up_data_mart',
    title: 'Set up a Data Mart',
    description: 'Create a Data Mart from a connector, SQL, a table or a view, then publish it.',
    text: withGuide(
      'Help me set up an OWOX Data Mart. If I did not name the source and the Storage, ask me.',
      'data_mart_setup'
    ),
  },
  {
    name: 'check_data_mart_runs',
    title: 'Check Data Mart runs',
    description: 'Find failed or stuck runs of a Data Mart and explain the cause.',
    // list_data_mart_runs reads one Data Mart, so without a name the model would read every Data Mart.
    text: withGuide(
      'Check the recent runs of my OWOX Data Mart. If I did not name the Data Mart, ask me. Find failed or stuck runs and explain the cause.',
      'data_mart_runs'
    ),
  },
];

// The claude.ai menu cuts a title after about 34 characters.
const GUIDE_TITLES: Record<McpGuideTopic, string> = {
  reporting: 'Reporting guide',
  data_mart_setup: 'Data Mart setup guide',
  data_mart_runs: 'Data Mart runs guide',
  credentials: 'Credentials guide',
  storages_destinations: 'Storages and Destinations guide',
  custom_connectors: 'Custom connectors guide',
};

export const MCP_RESOURCES: McpTextResource[] = [
  ...MCP_GUIDE_TOPICS.map(topic => ({
    name: `guide_${topic}`,
    uri: `owox://guides/${topic}`,
    title: GUIDE_TITLES[topic],
    mimeType: 'text/markdown',
    text: MCP_GUIDES[topic],
  })),
  {
    name: 'mcp_documentation',
    uri: 'owox://docs/mcp',
    title: 'MCP documentation',
    mimeType: 'text/plain',
    text: `The OWOX Data Marts MCP documentation is at ${MCP_SERVER_GUIDE_URL}. It tells how to connect a client, which tools need which scope, what costs credits, and how to fix common errors.`,
  },
];
