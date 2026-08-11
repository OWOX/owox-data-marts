import assert from 'node:assert';
import { describe, it } from 'node:test';
import { DeclarativeSource } from '../../src/Core/Declarative/DeclarativeSource.js';
import { ManifestParser } from '../../src/Core/Declarative/ManifestParser.js';
import { TemplateEngine } from '../../src/Core/Declarative/TemplateEngine.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';

function ctx() {
  return new AbstractContext({
    source: { name: 'X', config: { AppId: { value: 'K' } } },
    storage: { name: 'MockStorage', config: {} },
    runConfig: { type: 'INCREMENTAL', data: [], state: {} },
    env: { datamartId: 'dm', runId: 'run' },
  });
}

describe('declarative security', () => {
  it('rejects fetch to a host outside the manifest allowlist', async () => {
    // baseUrl points at a metadata IP to prove the guard blocks private targets
    // even when "declared" in the manifest.
    const model = new ManifestParser().parse(
      JSON.stringify({
        version: '1.0',
        name: 'X',
        baseUrl: 'https://169.254.169.254',
        parameters: { AppId: { requiredType: 'string' } },
        nodes: {
          n: {
            destinationName: 'n',
            isTimeSeries: false,
            fields: { a: { apiName: 'a', type: 'string' } },
            request: { method: 'GET', path: '/latest/meta-data' },
            recordSelector: { recordPath: [] },
          },
        },
      })
    );
    const source = new DeclarativeSource(ctx(), model);
    await assert.rejects(
      () =>
        source.fetchData({
          nodeName: 'n',
          fields: ['a'],
          accountId: null,
          startDate: null,
          endDate: null,
        }),
      /blocked IP/
    );
  });

  it('template engine refuses access to process/global scopes', () => {
    const engine = new TemplateEngine();
    assert.throws(() => engine.render('{{ process.env.SECRET }}', {}), /not allowed/);
    assert.throws(() => engine.render('{{ globalThis.x }}', {}), /not allowed/);
  });
});
