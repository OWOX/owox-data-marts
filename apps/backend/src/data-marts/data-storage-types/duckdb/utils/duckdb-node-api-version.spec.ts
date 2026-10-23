import * as fs from 'node:fs';
import * as path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../../../../../../..');

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
}

// The backend reads the files the connector writes: both must load the same DuckDB engine.
it('pins the same @duckdb/node-api version in the backend, the connectors and the DuckDB manifest', () => {
  const backendVersion = readJson('apps/backend/package.json').dependencies['@duckdb/node-api'];
  const connectorsVersion = readJson('packages/connectors/package.json').dependencies[
    '@duckdb/node-api'
  ];
  const manifestVersion = readJson(
    'packages/connectors/src/Storages/DuckDB/manifest.json'
  ).environment.node.dependencies.find(
    (dependency: { name: string }) => dependency.name === '@duckdb/node-api'
  )?.version;

  expect(backendVersion).toMatch(/^\d+\.\d+\.\d+/);
  expect(connectorsVersion).toBe(backendVersion);
  expect(manifestVersion).toBe(backendVersion);
});
