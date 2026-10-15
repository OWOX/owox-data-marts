// Reads the oracle as text and runs it as a script: this Jest cannot load an ES module.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import {
  PluginActionExecutionStatus,
  isFinalPluginActionStatus,
} from '../enums/plugin-action-execution-status.enum';
import {
  PLUGIN_ACTION_ERROR_CODE_PATTERN,
  PLUGIN_ACTION_RESERVED_ERROR_CODE_PREFIX,
  PLUGIN_ACTION_RESERVED_ERROR_CODES,
} from './plugin-action-limits';

const CONTRACT_FILE = join(__dirname, '../../../../../test/contracts/plugin-action-contract.mjs');

function readContract(): Record<string, unknown> {
  const contract: Record<string, unknown> = {};
  runInNewContext(
    readFileSync(CONTRACT_FILE, 'utf8').replace(/^export const /gm, 'var '),
    contract
  );
  return contract;
}

describe('plugin action constants match the shared contract', () => {
  const contract = readContract();

  it('uses the same error-code pattern', () => {
    expect(PLUGIN_ACTION_ERROR_CODE_PATTERN).toEqual(
      new RegExp(contract.pluginActionErrorCodePatternSource as string)
    );
  });

  it('reserves the same error codes', () => {
    expect([...PLUGIN_ACTION_RESERVED_ERROR_CODES].sort()).toEqual(
      [...(contract.pluginActionReservedErrorCodes as string[])].sort()
    );
  });

  it('reserves the same error-code prefix', () => {
    expect(contract.pluginActionReservedErrorCodePrefix).toEqual(expect.any(String));
    expect(PLUGIN_ACTION_RESERVED_ERROR_CODE_PREFIX).toBe(
      contract.pluginActionReservedErrorCodePrefix
    );
  });

  // The status column holds enum values only, so the enum is every status there is.
  it('treats the same statuses as final', () => {
    expect(
      Object.values(PluginActionExecutionStatus).filter(isFinalPluginActionStatus).sort()
    ).toEqual([...(contract.pluginActionFinalStatuses as string[])].sort());
  });
});
