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
