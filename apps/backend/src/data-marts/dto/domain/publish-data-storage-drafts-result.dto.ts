export class PublishDataStorageDraftsResultDto {
  constructor(
    public readonly successCount: number,
    public readonly failedCount: number
  ) {}
}
