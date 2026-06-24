export interface SearchResultResponseDto {
  entityType: 'DATA_MART' | 'DATA_STORAGE' | 'DATA_DESTINATION';
  entityId: string;
  title: string;
  description: string | null;
  finalScore: number;
  kwScore: number;
  vecScore: number | null;
  extendability: number;
}
