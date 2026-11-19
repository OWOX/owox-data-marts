export interface OwoxStorageUsageResponseDto {
  plan: 'FREE' | 'PAID' | 'NOT_PAID';
  usedBytes: number;
  limitBytes: number;
  tables: { name: string; sizeBytes: number; rowCount: number }[];
  deletion: { reason: 'NOT_PAID' | 'INACTIVE'; date: string } | null;
  deletedAt: string | null;
}
