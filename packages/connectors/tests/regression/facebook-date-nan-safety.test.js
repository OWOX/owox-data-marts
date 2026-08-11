// packages/connectors/tests/regression/facebook-date-nan-safety.test.js
//
// Regression test for G11c: FacebookMarketingSource.castRecordFields()
// (Source.js ~394-419) casts DATE/DATETIME fields with a bare
// `new Date(record[field] + "T00:00:00Z")` / `new Date(record[field])`. An
// unparseable value (a malformed date string from a flaky API response)
// yields an Invalid Date object -- not null -- which can throw downstream
// during serialization/storage (e.g. `date.toISOString()`). main used
// `DateUtils.parseDate(...)`, which returns null for anything unparseable,
// so a bad date field degrades to a null column instead of blowing up the
// whole row/import.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { withBuildLock, buildBundle } from '../buildBundleOnce.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..', '..');

let OWOX;

before(() => {
  withBuildLock(() => {
    buildBundle(pkgRoot);
    OWOX = require(path.join(pkgRoot, 'dist', 'index.cjs'));
  });
});

// Minimal fake context -- the constructor only touches registerParameters;
// castRecordFields() doesn't touch the context at all.
function fakeContext() {
  return {
    emit() {},
    log() {},
    getParameter() {
      return null;
    },
    registerParameters() {},
  };
}

test('castRecordFields() casts a malformed DATE field to null instead of an Invalid Date', () => {
  const { FacebookMarketing } = OWOX;
  const source = new FacebookMarketing.FacebookMarketingSource(fakeContext());
  source.fieldsSchema = {
    testNode: {
      fields: {
        badDate: { type: 'DATE' },
      },
    },
  };

  const record = source.castRecordFields('testNode', { badDate: 'not-a-real-date' });

  assert.strictEqual(record.badDate, null, `expected null, got: ${record.badDate}`);
});

test('castRecordFields() casts a malformed DATETIME field to null instead of an Invalid Date', () => {
  const { FacebookMarketing } = OWOX;
  const source = new FacebookMarketing.FacebookMarketingSource(fakeContext());
  source.fieldsSchema = {
    testNode: {
      fields: {
        badDatetime: { type: 'DATETIME' },
      },
    },
  };

  const record = source.castRecordFields('testNode', { badDatetime: 'not-a-real-date' });

  assert.strictEqual(record.badDatetime, null, `expected null, got: ${record.badDatetime}`);
});

test('castRecordFields() still casts a valid DATE field to a real Date', () => {
  const { FacebookMarketing } = OWOX;
  const source = new FacebookMarketing.FacebookMarketingSource(fakeContext());
  source.fieldsSchema = {
    testNode: {
      fields: {
        goodDate: { type: 'DATE' },
      },
    },
  };

  const record = source.castRecordFields('testNode', { goodDate: '2024-01-15' });

  assert.ok(record.goodDate instanceof Date, `expected a Date instance, got: ${record.goodDate}`);
  assert.strictEqual(record.goodDate.toISOString().slice(0, 10), '2024-01-15');
});
