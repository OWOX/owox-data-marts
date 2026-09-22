export interface DataMartPreviewColumnDto {
  name: string;
  alias?: string;
  /** Storage field type, e.g. STRING or INTEGER. */
  type?: string;
}

export type DataMartPreviewCell = string | number | boolean | null;

export interface PreviewDataMartResponseDto {
  /** Run History entry this preview created. */
  runId: string;
  columns: DataMartPreviewColumnDto[];
  rows: DataMartPreviewCell[][];
  rowCount: number;
  limit: number;
  /** More rows matched than `limit`. */
  truncated: boolean;
}
