import { DataStorage } from '../../entities/data-storage.entity';

export class SyncLegacyDataMartCommand {
  constructor(
    public readonly projectId: string,
    public readonly gcpProjectId: string,
    public readonly dataMartId: string,
    public readonly storage?: DataStorage
  ) {}
}
