export interface ConnectorTargetConflictResponseDto {
  conflict: boolean;
  dataMart: { id: string; title: string } | null;
}
