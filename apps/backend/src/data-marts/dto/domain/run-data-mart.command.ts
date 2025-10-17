import { RunType } from '../../../common/scheduler/shared/types';

export class RunDataMartCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly createdById: string,
    public readonly runType: RunType,
    public readonly payload?: Record<string, unknown> | undefined
  ) {}
}
