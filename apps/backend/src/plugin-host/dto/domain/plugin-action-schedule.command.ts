import { AuthorizationContext } from '../../../idp/types/auth.types';

export class CreatePluginScheduleCommand {
  constructor(
    readonly context: AuthorizationContext,
    /** The raw request body; the use case checks its keys and types. */
    readonly body: unknown
  ) {}
}

export class UpdatePluginScheduleCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly id: string,
    /** The raw request body; the use case checks its keys and types. */
    readonly body: unknown
  ) {}
}

/** get, pause, resume and delete. */
export class PluginScheduleCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly id: string
  ) {}
}

export class ListPluginSchedulesCommand {
  constructor(readonly context: AuthorizationContext) {}
}
