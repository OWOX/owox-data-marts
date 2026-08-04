export interface PublishDraftFailureDto {
  dataMartId: string;
  title: string;
  error: string;
}

export interface PublishDataStorageDraftsResponseDto {
  successCount: number;
  failedCount: number;
  error?: string;
  failures?: PublishDraftFailureDto[];
}
