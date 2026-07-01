import { TelemetryEvent } from '@owox/internal-helpers';

export interface CommandInvokedPayload {
  /** Stable anonymous id; used as the PostHog distinct_id (not sent as a property). */
  anonymousId: string;
  cli_version: string;
  /** oclif command id, e.g. "data-marts:list". Never includes arguments. */
  command: string;
  node_version: string;
  os_arch: string;
  os_platform: string;
}

/** Emitted once per owox-ctl command invocation. */
export class CommandInvokedEvent extends TelemetryEvent<CommandInvokedPayload> {
  constructor(payload: CommandInvokedPayload) {
    super(payload);
  }

  override get name(): string {
    return 'cli.command.invoked';
  }
}
