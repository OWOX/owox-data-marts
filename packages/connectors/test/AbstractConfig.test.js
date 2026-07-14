import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/Core/AbstractConfig.js', import.meta.url), 'utf8');
const sandbox = vm.createContext({ console });
vm.runInContext(`${source}\nglobalThis.__AbstractConfig = AbstractConfig;`, sandbox);
const AbstractConfig = sandbox.__AbstractConfig;

test('preserves an explicit false boolean instead of replacing it with a true default', () => {
  const config = new AbstractConfig({
    ImportAllColumns: {
      value: false,
      default: true,
      requiredType: 'boolean',
      isRequired: true,
    },
  });

  config.validate();

  assert.equal(config.ImportAllColumns.value, false);
});

test('applies a default only when the configured value is missing', () => {
  const config = new AbstractConfig({
    ImportAllColumns: {
      default: true,
      requiredType: 'boolean',
      isRequired: true,
    },
  });

  config.validate();

  assert.equal(config.ImportAllColumns.value, true);
});
