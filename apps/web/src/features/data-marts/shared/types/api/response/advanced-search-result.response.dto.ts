export interface AdvancedSearchResultResponseDto {
  entityType: 'DATA_MART';
  entityId: string;
  title: string;
  description: string | null;
  finalScore: number;
  kwScore: number;
  vecScore: number | null;
  extendability: number;
}
