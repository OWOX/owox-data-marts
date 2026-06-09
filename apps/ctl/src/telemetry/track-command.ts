import { emitTelemetry } from '@owox/internal-helpers';

import { CommandInvokedEvent } from './command-invoked.event.js';

const DOCS_URL = 'https://docs.owox.com/docs/editions/self-managed-editions/';
const FIRST_RUN_NOTICE =
  `OWOX collects anonymous usage telemetry (no personal data). ` +
  `Disable it with OWOX_TELEMETRY_DISABLED=1. Learn more: ${DOCS_URL}`;

export interface TrackCommandOptions {
  cliVersion: string;
  command: string;
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}

/** Fire-and-forget anonymous telemetry for an owox-ctl command invocation. Never throws. */
export function trackCommand(options: TrackCommandOptions): void {
  emitTelemetry({
    buildEvent: anonymousId =>
      new CommandInvokedEvent({
        anonymousId,
        cli_version: options.cliVersion,
        command: options.command,
        node_version: process.version,
        os_arch: process.arch,
        os_platform: process.platform,
      }),
    dataDir: options.dataDir,
    env: options.env,
    firstRunNotice: FIRST_RUN_NOTICE,
    log: options.log,
  });
}
