export interface SearchReportRefResponseDto {
  dataMart: { id: string; title: string };
  dataDestination: { id: string; title: string; type: string };
}

export interface SearchResultResponseDto {
  entityType: 'DATA_MART' | 'DATA_STORAGE' | 'DATA_DESTINATION' | 'REPORT';
  entityId: string;
  title: string;
  description: string | null;
  finalScore: number;
  kwScore: number;
  vecScore: number | null;
  report?: SearchReportRefResponseDto;
  url?: string;
}
