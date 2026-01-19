export interface DatabricksQueryMetadata {
  queryId: string;
  statementId: string;
  duration?: number;
  bytesScanned?: number;
  rowsProduced?: number;
}
