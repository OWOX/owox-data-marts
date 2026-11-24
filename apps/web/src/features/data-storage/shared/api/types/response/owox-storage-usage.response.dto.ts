export interface OwoxStorageUsageResponseDto {
  usedBytes: number;
  limitBytes: number;
  tables: { name: string; sizeBytes: number; rowCount: number }[];
  deletedAt: string | null;
}
