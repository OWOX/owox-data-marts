import type { AuthorizationContext } from '../../../idp/types/auth.types';

export class ListProjectPluginSchedulesCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly limit: number,
    readonly offset: number,
    readonly installationId: string | null
  ) {}
}

export class ProjectPluginScheduleCommand {
  constructor(
    readonly context: AuthorizationContext,
    readonly id: string
  ) {}
}
