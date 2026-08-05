export interface PublishDataStorageDraftsResponseDto {
  successCount: number;
  failedCount: number;
  error?: string;
  /**
   * Distinct reasons the failed drafts could not be published. The API returns
   * no Data Mart ids or titles here: editing a storage does not imply
   * visibility of every Data Mart inside it.
   */
  failureReasons?: string[];
}
