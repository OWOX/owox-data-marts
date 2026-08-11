import { ConnectorTestService } from 'src/data-marts/services/connector/connector-test.service';

/**
 * Connector Builder "Test" action — real network integration test.
 *
 * Proves the declarative connector engine, driven through the SAME service the
 * builder's "Test" button uses (ConnectorTestService.runTest), fetches REAL rows
 * from a REAL public API: https://api.sampleapis.com/switch/games (a free, no-auth
 * JSON array of Nintendo Switch games).
 *
 * runTest() spawns the built @owox/connectors runner, so the package must be built
 * (the integration workflow runs `npm run build --workspaces`). No NestJS app, DB,
 * or credentials are needed — only outbound network.
 *
 * Gated by RUN_SAMPLEAPIS_INTEGRATION=1 so an offline `npm run test:integration`
 * (with no pattern) does not fail locally; the test-integration workflow sets it.
 */

const NETWORK_ENABLED = process.env.RUN_SAMPLEAPIS_INTEGRATION === '1';

if (!NETWORK_ENABLED) {
  console.log(
    'Skipping sampleapis connector-builder integration test: set RUN_SAMPLEAPIS_INTEGRATION=1 to enable (needs outbound network)'
  );
}

const describeIfNetwork = NETWORK_ENABLED ? describe : describe.skip;

// A minimal declarative manifest pointing at the public Switch-games endpoint.
// Mirrors the shipped RatesDeclarative manifest shape: top-level version/name/
// baseUrl/parameters/nodes; the node carries request + recordSelector + fields.
// The endpoint returns a root-level JSON array, so recordPath is [].
const manifest = {
  title: 'Sample APIs — Switch Games (Declarative)',
  version: '1.0',
  name: 'SampleApisSwitchGames',
  baseUrl: 'https://api.sampleapis.com',
  parameters: {},
  nodes: {
    games: {
      overview: 'Nintendo Switch games catalogue',
      destinationName: 'switch_games',
      isTimeSeries: false,
      uniqueKeys: ['id'],
      defaultFields: ['id', 'name'],
      fields: {
        id: { apiName: 'id', type: 'integer' },
        name: { apiName: 'name', type: 'string' },
      },
      request: {
        method: 'GET',
        path: '/switch/games',
      },
      recordSelector: { recordPath: [] },
    },
  },
};

describeIfNetwork('Connector Builder Test action — real sampleapis.com fetch', () => {
  const service = new ConnectorTestService();

  it('fetches real Switch-game rows through ConnectorTestService.runTest', async () => {
    const result = await service.runTest({
      projectId: 'integration-test',
      manifest,
      node: 'games',
      configuration: {},
      maxRows: 5,
      maxPages: 1,
      timeoutMs: 45000,
    });

    // No engine/transport error.
    expect(result.error).toBeNull();

    // Real records came back (capped at maxRows=5).
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows.length).toBeLessThanOrEqual(5);

    // Each row carries the two declared fields, typed as the API returns them.
    for (const row of result.rows) {
      expect(row).toHaveProperty('id');
      expect(typeof row.id).toBe('number');
      expect(row).toHaveProperty('name');
      expect(typeof row.name).toBe('string');
      expect((row.name as string).length).toBeGreaterThan(0);
    }
  }, 60000);

  it('rejects an invalid manifest before spawning the runner', async () => {
    // A node with no request is structurally invalid; runTest validates via
    // Core.ManifestParser and must throw BEFORE spawning any child process.
    const brokenManifest = {
      ...manifest,
      nodes: { games: { ...manifest.nodes.games, request: undefined } },
    };

    await expect(
      service.runTest({
        projectId: 'integration-test',
        manifest: brokenManifest as unknown as Record<string, unknown>,
        node: 'games',
        configuration: {},
        timeoutMs: 45000,
      })
    ).rejects.toThrow(/Invalid manifest/i);
  }, 60000);
});
