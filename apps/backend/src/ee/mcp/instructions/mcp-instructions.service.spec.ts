import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { McpInstructionsService } from './mcp-instructions.service';
import { MCP_GUIDE_TOPICS } from './mcp-guides';
import { MCP_SYSTEM_INSTRUCTIONS } from './mcp-system-instructions';

describe('MCP instructions', () => {
  it('returns the complete static system instructions', () => {
    const service = new McpInstructionsService();

    expect(service.getInstructions()).toBe(MCP_SYSTEM_INSTRUCTIONS);
  });

  // ChatGPT gives the model only the start of the instructions, and Claude Code the first 4,096
  // characters. The long workflow text belongs in the guides that get_owox_guide returns.
  it('stays short and puts the data question rule in the first 250 characters', () => {
    expect(MCP_SYSTEM_INSTRUCTIONS.length).toBeLessThanOrEqual(3500);

    const start = MCP_SYSTEM_INSTRUCTIONS.slice(0, 250);
    expect(start).toContain('get_data_mart_details_by_id');
    expect(start).toContain('query_data_mart');
    expect(start).toContain('Never guess field names or IDs');
  });

  it('names every guide topic', () => {
    for (const topic of MCP_GUIDE_TOPICS) {
      expect(MCP_SYSTEM_INSTRUCTIONS).toContain(topic);
    }
  });

  it('keeps the rules that apply to all tools', () => {
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('untrusted information');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('Never accept provider secrets in tool arguments');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('Never delete dependent objects');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('Name the Data Mart that supplied each answer');
  });

  // Without this rule the "rephrase and try again" advice sends a model into a loop of searches
  // against a project that has nothing to find.
  it('tells the assistant what to do when the project has no published data mart', () => {
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('unless the response contains getting_started');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('show the next steps and links from getting_started');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('Do not retry discovery with other wording');
  });

  // The OpenAI plugin review holds server instructions that do this, and a held text cannot be appealed.
  it('does not tell the model to obey response instructions or to override rules', () => {
    expect(MCP_SYSTEM_INSTRUCTIONS).not.toMatch(/follow [\w.]*instructions|override/i);
  });

  it('round-trips the complete system instructions through MCP initialization', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new McpServer(
      { name: 'owox-mcp-test', version: '0.0.0' },
      { instructions: MCP_SYSTEM_INSTRUCTIONS }
    );
    const client = new Client(
      { name: 'owox-mcp-test-client', version: '0.0.0' },
      { capabilities: {} }
    );

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      expect(client.getInstructions()).toBe(MCP_SYSTEM_INSTRUCTIONS);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
