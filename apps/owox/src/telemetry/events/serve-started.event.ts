import { TelemetryEvent } from '@owox/internal-helpers';

export interface ServeStartedPayload {
  /** Stable anonymous id; used as the PostHog distinct_id (not sent as a property). */
  anonymousId: string;
  cli_version: string;
  idp_provider: string;
  is_docker: boolean;
  node_version: string;
  os_arch: string;
  os_platform: string;
  web_enabled: boolean;
}

/** Emitted once per successful `owox serve` startup. */
export class ServeStartedEvent extends TelemetryEvent<ServeStartedPayload> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(payload: ServeStartedPayload) {
    super(payload);
  }

  override get name(): string {
    return 'cli.serve.started';
  }
}
