import { PublishDraftFailureDto } from './publish-draft-failure.dto';

export class PublishDataStorageDraftsResultDto {
  constructor(
    public readonly successCount: number,
    public readonly failedCount: number,
    public readonly failures: PublishDraftFailureDto[] = []
  ) {}
}
