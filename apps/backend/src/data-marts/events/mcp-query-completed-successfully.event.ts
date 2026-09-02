import { BaseEvent } from '@owox/internal-helpers';

export interface McpQueryCompletedSuccessfullyEventPayload {
  dataMartRunId: string;
  dataMartId: string;
  /** Owner of the run — used to mark the user-scoped checklist step. */
  userId: string;
}

export class McpQueryCompletedSuccessfullyEvent extends BaseEvent<McpQueryCompletedSuccessfullyEventPayload> {
  get name() {
    return 'mcp-query.completed.successfully' as const;
  }

  constructor(dataMartRunId: string, dataMartId: string, userId: string) {
    super({ dataMartRunId, dataMartId, userId });
  }
}
