import { emitTelemetry } from '@owox/internal-helpers';

import { ServeStartedEvent, type ServeStartedPayload } from './events/serve-started.event.js';

const DOCS_URL = 'https://docs.owox.com/docs/editions/self-managed-editions/';
const FIRST_RUN_NOTICE =
  `OWOX collects anonymous usage telemetry (no personal data). ` +
  `Disable it with OWOX_TELEMETRY_DISABLED=1. Learn more: ${DOCS_URL}`;

export interface TrackServeStartedOptions {
  dataDir?: string;
  env?: NodeJS.ProcessEnv;
  log: (message: string) => void;
  payload: Omit<ServeStartedPayload, 'anonymousId'>;
}

/** Fire-and-forget anonymous telemetry for `owox serve`. Never throws, never blocks startup. */
export function trackServeStarted(options: TrackServeStartedOptions): void {
  emitTelemetry({
    buildEvent: anonymousId => new ServeStartedEvent({ anonymousId, ...options.payload }),
    dataDir: options.dataDir,
    env: options.env,
    firstRunNotice: FIRST_RUN_NOTICE,
    log: options.log,
  });
}
