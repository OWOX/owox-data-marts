import assert from 'node:assert';
import { describe, it, before, after } from 'node:test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConnectorBuilder } from '../../vite.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleDir = path.resolve(__dirname, '..', '..', 'src', 'Sources', '__DiscoveryProbe');

describe('ConnectorBuilder.discoverConnectors (declarative)', () => {
  before(async () => {
    await fs.mkdir(exampleDir, { recursive: true });
    await fs.writeFile(
      path.join(exampleDir, 'manifest.json'),
      JSON.stringify({
        version: '1.0',
        name: '__DiscoveryProbe',
        baseUrl: 'https://api.example.com',
        parameters: {},
        nodes: {
          n: { request: { method: 'GET', path: '/x' }, recordSelector: { recordPath: [] } },
        },
      })
    );
  });
  after(async () => {
    await fs.rm(exampleDir, { recursive: true, force: true });
  });

  it('discovers a manifest-only connector (no Source.js) and flags it declarative', async () => {
    const builder = new ConnectorBuilder();
    const connectors = await builder.discoverConnectors();
    const probe = connectors.find(c => c.name === '__DiscoveryProbe');
    assert.ok(probe, 'expected the manifest-only connector to be discovered');
    assert.strictEqual(probe.isDeclarative, true);
    assert.deepStrictEqual(probe.files, []);
    assert.ok(probe.manifest && probe.manifest.nodes, 'manifest with nodes should be attached');
  });
});
