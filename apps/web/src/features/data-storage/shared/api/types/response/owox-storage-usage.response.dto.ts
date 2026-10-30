export interface OwoxStorageUsageResponseDto {
  plan: 'FREE' | 'PAID' | 'NOT_PAID';
  usedBytes: number;
  limitBytes: number;
  tables: { name: string; sizeBytes: number; rowCount: number }[];
}
