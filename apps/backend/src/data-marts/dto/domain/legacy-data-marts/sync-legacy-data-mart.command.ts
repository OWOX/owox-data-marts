import { DataStorage } from '../../../entities/data-storage.entity';

export class SyncLegacyDataMartCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly storage?: DataStorage
  ) {}
}
