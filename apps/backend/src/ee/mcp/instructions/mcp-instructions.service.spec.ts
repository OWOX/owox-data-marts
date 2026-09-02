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

  it('instructs the assistant to use add_report automatic-run outcomes safely', () => {
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('add_report runs');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('run_immediately=false');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('initial_run.status="queued"');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('initial_run.status="failed_to_queue"');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('Never call add_report again');
  });

  // Without this rule the step-2 "rephrase and try again" advice sends a model into a loop of
  // searches against a project that has nothing to find.
  it('tells the assistant what to do when the project has no published data mart', () => {
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('Empty project:');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('returns getting_started');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('Follow getting_started.instructions');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain('do not rephrase and retry discovery tools');
    expect(MCP_SYSTEM_INSTRUCTIONS).toContain(
      'A Data Mart cannot be created or published through MCP'
    );
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
