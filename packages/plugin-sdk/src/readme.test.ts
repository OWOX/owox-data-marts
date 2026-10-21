// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pluginScheduleErrorCodes } from '../../../test/contracts/plugin-action-contract.mjs';

// Outside actions.test.ts: the contract typecheck has no Node types.
describe('README', () => {
  // The SDK holds no code list: its README is the catalogue, so a renamed code must change it.
  it.each(pluginScheduleErrorCodes)('names the schedule code %s', code => {
    expect(readFileSync(new URL('../README.md', import.meta.url), 'utf8')).toContain(code);
  });
});
