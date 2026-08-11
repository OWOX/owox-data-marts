// packages/connectors/tests/AbstractContext.test.js
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { AbstractContext } from '../src/Core/AbstractContext.js';

function createMinimalContext(overrides = {}) {
  return new AbstractContext({
    source: { name: 'TestSource', config: {} },
    storage: { name: 'TestStorage', config: {} },
    runConfig: {},
    env: { datamartId: 'dm-1', runId: 'run-1' },
    ...overrides,
  });
}

describe('AbstractContext', () => {
  describe('constructor', () => {
    it('creates with valid config', () => {
      const ctx = createMinimalContext();
      assert.strictEqual(ctx.sourceName, 'TestSource');
      assert.strictEqual(ctx.storageName, 'TestStorage');
      assert.strictEqual(ctx.runConfig.type, 'INCREMENTAL');
      assert.strictEqual(ctx.env.datamartId, 'dm-1');
    });

    it('throws without source.name', () => {
      assert.throws(
        () =>
          new AbstractContext({
            source: { config: {} },
            storage: { name: 'S', config: {} },
          }),
        /source\.name is required/
      );
    });

    it('throws without storage.config', () => {
      assert.throws(
        () =>
          new AbstractContext({
            source: { name: 'S', config: {} },
            storage: { name: 'S' },
          }),
        /storage\.config is required/
      );
    });
  });

  describe('registerParameters + validate', () => {
    it('validates required parameters, pinning the generic message verbatim', () => {
      // This is the ONLY assertion on the full generic wording. Everything else
      // matches a fragment of it -- connector-fields.e2e-spec asserts the
      // substring "parameter 'AuthType' is required", the connector tests use
      // partial regexes -- so neither the "Unable to load the configuration."
      // prefix nor the "but was provided with an empty value" suffix is covered
      // anywhere else. The message is user-facing (it reaches the run log and
      // the API error body), and it already drifted once unnoticed; assert the
      // whole string so the next drift fails here.
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ ApiKey: { isRequired: true, type: 'string' } });
      assert.throws(() => ctx.validate(), {
        message:
          "Unable to load the configuration. The parameter 'ApiKey' is required but was provided with an empty value",
      });
    });

    it('G12a regression: throws the param-defined errorMessage instead of the generic message', () => {
      // main's AbstractConfig.validate() threw `parameter.errorMessage` when
      // present (falling back to the generic message otherwise). Several
      // bundled connectors (MicrosoftAds, OpenExchangeRates, Shopify) rely on
      // this to surface an actionable, source-specific message instead of the
      // generic "Unable to load the configuration ..." wording.
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({
        AppId: {
          isRequired: true,
          type: 'string',
          errorMessage:
            'You need to add App Id first. Go to Google Sheets Menu > OWOX > Manage Credentials',
        },
      });
      assert.throws(
        () => ctx.validate(),
        /You need to add App Id first\. Go to Google Sheets Menu > OWOX > Manage Credentials/
      );
    });

    it('passes with required parameter present', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { ApiKey: { value: 'abc123' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ ApiKey: { isRequired: true, type: 'string' } });
      ctx.validate(); // no throw
    });

    it('applies default values', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ MaxRetries: { type: 'number', default: 3 } });
      assert.strictEqual(ctx.getParameter('MaxRetries').value, 3);
    });

    it('deliberate divergence from main: an explicit boolean false survives, it is NOT replaced by the default', () => {
      // main's empty/required check was `!value && value !== 0`, so a JSON
      // boolean `false` counted as missing: validate() re-applied
      // `default: true` and the run created the empty table the user had
      // explicitly opted out of. This engine checks
      // `value === undefined || value === null || value === ''`, so `false`
      // stands. That is deliberate and more correct -- do NOT "restore" main's
      // predicate here; CreateEmptyTables: false must reach
      // AbstractConnector as false.
      const ctx = new AbstractContext({
        source: { name: 'S', config: { CreateEmptyTables: { value: false } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ CreateEmptyTables: { type: 'boolean', default: true } });
      ctx.validate();
      assert.strictEqual(ctx.getParameter('CreateEmptyTables').value, false);
    });

    it('deliberate divergence from main: a required param holding NaN is present, not missing', () => {
      // Same predicate change as above: `!NaN` is true, so main treated NaN as
      // a missing required value and threw. Here NaN is a present value and
      // validation is left to the type check (a `number`-typed param would
      // still be rejected, with the accurate "must be a number" message).
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Threshold: { value: NaN } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ Threshold: { isRequired: true } });
      ctx.validate();
      assert.ok(Number.isNaN(ctx.getParameter('Threshold').value));
    });

    it('a numeric 0 is a present value: required passes and the default is not re-applied', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Offset: { value: 0 } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ Offset: { isRequired: true, type: 'number', default: 100 } });
      ctx.validate();
      assert.strictEqual(ctx.getParameter('Offset').value, 0);
    });

    it('an empty string still falls back to the default', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { PageSize: { value: '' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ PageSize: { type: 'number', default: 50 } });
      ctx.validate();
      assert.strictEqual(ctx.getParameter('PageSize').value, 50);
    });

    it('converts number types', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Limit: { value: '100' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ Limit: { type: 'number' } });
      ctx.validate();
      assert.strictEqual(ctx.getParameter('Limit').value, 100);
    });

    it('trims string values', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Name: { value: '  hello  ' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ Name: { type: 'string' } });
      ctx.validate();
      assert.strictEqual(ctx.getParameter('Name').value, 'hello');
    });

    it('G11a regression: trims an untyped string param value at registration time, not just typed ones', () => {
      // main's AbstractConfig.addParameter trimmed EVERY string value at
      // ingestion. The redesigned engine only trims inside
      // _validateParameterType('string'), which only runs when the param
      // declares requiredType/type -- so an untyped param (e.g. an AccountId
      // with no declared type) kept its surrounding whitespace all the way
      // through to the API request. Assert immediately after
      // registerParameters, without calling validate(), since the trim must
      // happen at ingestion regardless of whether validate() ever runs.
      const ctx = new AbstractContext({
        source: { name: 'S', config: { AccountId: { value: '  12345  ' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ AccountId: {} }); // no requiredType/type declared
      assert.strictEqual(ctx.getParameter('AccountId').value, '12345');
    });
  });

  describe('getParameter', () => {
    it('finds source params', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Token: { value: 'abc' } } },
        storage: { name: 'S', config: {} },
      });
      assert.strictEqual(ctx.getParameter('Token').value, 'abc');
    });

    it('finds storage params', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: { Dataset: { value: 'my_ds' } } },
      });
      assert.strictEqual(ctx.getParameter('Dataset').value, 'my_ds');
    });

    it('returns null for missing params', () => {
      const ctx = createMinimalContext();
      assert.strictEqual(ctx.getParameter('Nonexistent'), null);
    });
  });

  describe('emit', () => {
    it('writes JSON to stdout', () => {
      const ctx = createMinimalContext();
      const written = [];
      const originalWrite = process.stdout.write;
      process.stdout.write = data => {
        written.push(data);
        return true;
      };
      try {
        ctx.log('info', 'test message');
        assert.strictEqual(written.length, 1);
        const parsed = JSON.parse(written[0].trim());
        assert.strictEqual(parsed.type, 'LOG');
        assert.strictEqual(parsed.level, 'info');
        assert.strictEqual(parsed.message, 'test message');
      } finally {
        process.stdout.write = originalWrite;
      }
    });
  });

  describe('updateCredentials', () => {
    it('emits a CREDENTIALS event to stdout (the host persists the fields)', () => {
      const ctx = createMinimalContext();
      const written = [];
      const originalWrite = process.stdout.write;
      process.stdout.write = data => {
        written.push(data);
        return true;
      };
      try {
        ctx.updateCredentials({ generated_refresh_token: 'rotated-token' });
        assert.strictEqual(written.length, 1);
        assert.ok(written[0].endsWith('\n'));
        const parsed = JSON.parse(written[0].trim());
        assert.strictEqual(parsed.type, 'CREDENTIALS');
        assert.strictEqual(typeof parsed.timestamp, 'string');
        assert.deepStrictEqual(parsed.credentials, { generated_refresh_token: 'rotated-token' });
      } finally {
        process.stdout.write = originalWrite;
      }
    });

    it('rejects non-object credentials', () => {
      const ctx = createMinimalContext();
      assert.throws(() => ctx.updateCredentials('not-an-object'), /must be an object/);
    });
  });

  describe('* suffix required parameters', () => {
    it('treats * suffix as isRequired', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ 'ApiKey*': { type: 'string' } });
      assert.throws(() => ctx.validate(), /The parameter 'ApiKey' is required/);
    });

    it('strips * from registered name (getParameter works without star)', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { ApiKey: { value: 'abc' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ 'ApiKey*': { type: 'string' } });
      assert.strictEqual(ctx.getParameter('ApiKey').value, 'abc');
    });
  });

  describe('runConfig validation', () => {
    it('MANUAL_BACKFILL throws on empty data', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
        runConfig: { type: 'MANUAL_BACKFILL', data: [] },
      });
      assert.throws(() => ctx.validate(), /Manual backfill requires data items/);
    });

    it('MANUAL_BACKFILL throws when item missing configField', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
        runConfig: { type: 'MANUAL_BACKFILL', data: [{ value: 'x' }] },
      });
      assert.throws(() => ctx.validate(), /must have configField and value/);
    });

    it('MANUAL_BACKFILL throws when item missing value', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
        runConfig: { type: 'MANUAL_BACKFILL', data: [{ configField: 'StartDate' }] },
      });
      assert.throws(() => ctx.validate(), /must have configField and value/);
    });

    it('MANUAL_BACKFILL rejects param without MANUAL_BACKFILL attribute', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
        runConfig: {
          type: 'MANUAL_BACKFILL',
          data: [{ configField: 'StartDate', value: '2024-01-01' }],
        },
      });
      ctx.registerParameters({ StartDate: { type: 'date', attributes: ['SECRET'] } });
      assert.throws(() => ctx.validate(), /does not support manual backfill/);
    });

    it('MANUAL_BACKFILL accepts param with MANUAL_BACKFILL attribute', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
        runConfig: {
          type: 'MANUAL_BACKFILL',
          data: [{ configField: 'StartDate', value: '2024-01-01' }],
        },
      });
      ctx.registerParameters({ StartDate: { type: 'date', attributes: ['MANUAL_BACKFILL'] } });
      ctx.validate(); // should not throw
    });

    it('INCREMENTAL skips MANUAL_BACKFILL validation', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
        runConfig: { type: 'INCREMENTAL' },
      });
      ctx.validate(); // no throw
    });

    it('G6 regression: MANUAL_BACKFILL rejects a registered param that declares NO `attributes` at all', () => {
      // main's _validateManualBackfill required the field to exist AND
      // attributes.includes(MANUAL_BACKFILL), else throw. The redesigned
      // engine only enforced the exclusion case (attributes present but
      // missing MANUAL_BACKFILL) -- when `attributes` was simply undefined
      // (the normal shape for most params), the guard was skipped entirely,
      // so ANY field became overridable via backfill. Restore the strict
      // "must opt in" check.
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
        runConfig: {
          type: 'MANUAL_BACKFILL',
          data: [{ configField: 'ApiKey', value: 'attacker-controlled' }],
        },
      });
      ctx.registerParameters({ ApiKey: { type: 'string' } }); // no `attributes` at all
      assert.throws(() => ctx.validate(), /does not support manual backfill/);
    });

    it('G6 regression: MANUAL_BACKFILL rejects a configField with no registered param definition at all', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
        runConfig: {
          type: 'MANUAL_BACKFILL',
          data: [{ configField: 'NeverRegistered', value: 'x' }],
        },
      });
      assert.throws(() => ctx.validate(), /does not support manual backfill/);
    });
  });

  describe('type validation', () => {
    it('parses boolean strings', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Flag: { value: 'true' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ Flag: { type: 'boolean' } });
      ctx.validate();
      assert.strictEqual(ctx.getParameter('Flag').value, true);
    });

    it('boolean string false', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Flag: { value: 'False' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ Flag: { type: 'boolean' } });
      ctx.validate();
      assert.strictEqual(ctx.getParameter('Flag').value, false);
    });

    it('accepts valid date string', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Date: { value: '2024-01-15' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ Date: { type: 'date' } });
      ctx.validate(); // no throw
    });

    it('G11b regression: reassigns a valid YYYY-MM-DD date string to a Date instance', () => {
      // main's AbstractConfig._validateParameterType('date') cast the string
      // to a Date and reassigned it back to parameter.value. The redesigned
      // engine only NaN-checked `new Date(value)` without ever reassigning,
      // so getParameter(...).value stayed a plain string.
      const ctx = new AbstractContext({
        source: { name: 'S', config: { StartDate: { value: '2024-01-15' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ StartDate: { requiredType: 'date' } });
      ctx.validate();
      const value = ctx.getParameter('StartDate').value;
      assert.ok(value instanceof Date, `expected a Date instance, got: ${typeof value}`);
      assert.strictEqual(value.toISOString().slice(0, 10), '2024-01-15');
    });

    it('G11b regression: rejects a Date-parseable but non-YYYY-MM-DD format', () => {
      // main only accepted the strict `^\d{4}-\d{2}-\d{2}$` format (or an
      // already-constructed Date). The redesigned engine's plain
      // `new Date(value)` + NaN-check accepted ANY Date-parseable string
      // (e.g. "01/15/2024"), silently widening what main rejected.
      const ctx = new AbstractContext({
        source: { name: 'S', config: { StartDate: { value: '01/15/2024' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ StartDate: { requiredType: 'date' } });
      assert.throws(() => ctx.validate(), /must be a valid date/);
    });

    it('throws on invalid date', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Date: { value: 'not-a-date' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ Date: { type: 'date' } });
      assert.throws(() => ctx.validate(), /must be a valid date/);
    });

    it('parses object JSON string', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Cfg: { value: '{"a":1}' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ Cfg: { type: 'object' } });
      ctx.validate();
      assert.deepStrictEqual(ctx.getParameter('Cfg').value, { a: 1 });
    });

    it('throws on invalid JSON for object type', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { Cfg: { value: 'not json' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ Cfg: { type: 'object' } });
      assert.throws(() => ctx.validate(), /must be valid JSON/);
    });

    it('throws on non-numeric for number type', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: { N: { value: 'abc' } } },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ N: { type: 'number' } });
      assert.throws(() => ctx.validate(), /must be a number/);
    });
  });

  describe('emitAnalytics', () => {
    it('emits an ANALYTICS event with metric, value and tags', () => {
      const ctx = createMinimalContext();
      const written = [];
      const originalWrite = process.stdout.write;
      process.stdout.write = data => {
        written.push(data);
        return true;
      };
      try {
        ctx.emitAnalytics('rows_written', 1234, { node: 'campaigns' });
        assert.strictEqual(written.length, 1);
        const parsed = JSON.parse(written[0].trim());
        assert.strictEqual(parsed.type, 'ANALYTICS');
        assert.strictEqual(parsed.metric, 'rows_written');
        assert.strictEqual(parsed.value, 1234);
        assert.deepStrictEqual(parsed.tags, { node: 'campaigns' });
      } finally {
        process.stdout.write = originalWrite;
      }
    });
  });

  describe('registerParameters owner', () => {
    it('applies storage defaults to storageConfig when owner=storage', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ MaxBuffer: { type: 'number', default: 250 } }, 'storage');
      assert.strictEqual(ctx.storageConfig.MaxBuffer.value, 250);
      assert.strictEqual(ctx.sourceConfig.MaxBuffer, undefined);
    });

    it('applies source defaults to sourceConfig when owner=source', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
      });
      ctx.registerParameters({ MaxRetries: { type: 'number', default: 3 } }, 'source');
      assert.strictEqual(ctx.sourceConfig.MaxRetries.value, 3);
      assert.strictEqual(ctx.storageConfig.MaxRetries, undefined);
    });

    it('throws on invalid owner', () => {
      const ctx = new AbstractContext({
        source: { name: 'S', config: {} },
        storage: { name: 'S', config: {} },
      });
      assert.throws(
        () => ctx.registerParameters({ X: { default: 1 } }, 'invalid'),
        /owner must be 'source' or 'storage'/
      );
    });
  });
});
