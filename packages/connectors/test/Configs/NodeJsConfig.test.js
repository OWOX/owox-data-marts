import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';
import { describe, expect, it, vi } from 'vitest';
import { loadGasClass } from '../support/loadGasClass.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadGasClass(path.join(__dirname, '../../src/Core/AbstractConfig.js'));
loadGasClass(path.join(__dirname, '../../src/Configs/NodeJs/NodeJsConfig.js'));

// Plain `class X {}` declarations are global lexical bindings, not globalThis properties
const NodeJsConfig = vm.runInThisContext('NodeJsConfig');

const emit = (...args) => {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    NodeJsConfig.prototype.addWarningToCurrentStatus.call(null, ...args);
    return JSON.parse(spy.mock.calls[0][0]);
  } finally {
    spy.mockRestore();
  }
};

// The backend parses this envelope against MessageWarningSchema, which requires a
// `warning` string. Emitting anything else downgrades it to an unknown message, so the
// warning never reaches run history.
describe('addWarningToCurrentStatus', () => {
  it('emits the message under the field the backend schema requires', () => {
    const emitted = emit('2 out of 3 advertisers had errors');

    expect(emitted.type).toBe('addWarningToCurrentStatus');
    expect(emitted.warning).toBe('2 out of 3 advertisers had errors');
    expect(typeof emitted.at).toBe('string');
  });

  it('still produces a valid envelope when called without a message', () => {
    const emitted = emit();

    expect(typeof emitted.warning).toBe('string');
    expect(emitted.warning.length).toBeGreaterThan(0);
  });
});

// The edit form saves an unchecked box as boolean false. validate() used to treat any falsy
// value as "absent" and put the default back, so a saved false silently became true.
describe('validate() defaults', () => {
  const buildConfig = values =>
    new NodeJsConfig({
      source: { name: 'Src', config: values },
      storage: { name: 'Storage', config: {} },
    }).mergeParameters({
      ProcessShortLinks: { requiredType: 'boolean', default: true },
      Limit: { requiredType: 'number', default: 100 },
    });

  it('keeps a saved false instead of replacing it with the default', () => {
    const config = buildConfig({ ProcessShortLinks: { value: false } }).validate();

    expect(config.ProcessShortLinks.value).toBe(false);
  });

  it('still applies the default when the value is missing, null or empty', () => {
    expect(buildConfig({}).validate().ProcessShortLinks.value).toBe(true);
    expect(
      buildConfig({ ProcessShortLinks: { value: null } }).validate().ProcessShortLinks.value
    ).toBe(true);
    expect(buildConfig({ Limit: { value: '' } }).validate().Limit.value).toBe(100);
  });

  it('keeps a saved zero for a numeric parameter', () => {
    expect(buildConfig({ Limit: { value: 0 } }).validate().Limit.value).toBe(0);
  });
});
