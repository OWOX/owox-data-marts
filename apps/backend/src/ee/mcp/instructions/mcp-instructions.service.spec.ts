import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpInstructionsService } from './mcp-instructions.service';
import { MCP_SYSTEM_INSTRUCTIONS } from './mcp-system-instructions';
import { hasUniqueCountFieldCandidate } from '../tools/query-data-mart.input';

const UNIQUE_COUNT_EXAMPLE_FIELD = 'orders__unique_count';
const DISPLAY_FORM_NON_EXAMPLES = ['Orders Unique Count', '<Prefix> Unique Count'];

describe('MCP instructions', () => {
  it('returns the complete static system instructions', () => {
    const service = new McpInstructionsService();

    expect(service.getInstructions()).toBe(MCP_SYSTEM_INSTRUCTIONS);
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
