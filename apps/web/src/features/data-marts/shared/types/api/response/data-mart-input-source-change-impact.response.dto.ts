/**
 * Everything that depends on a Data Mart, used to show the blast radius before its input source
 * is changed or it is deleted.
 */
export interface DataMartInputSourceChangeImpactResponseDto {
  outboundRelationshipsCount: number;
  inboundRelationshipsCount: number;
  reportsCount: number;
  /** SQL Data Marts that reference this one in their query, including ones the caller cannot see. */
  referencingDataMartsCount?: number;
  /** The referencing Data Marts the caller can see. */
  referencingDataMarts?: { id: string; title: string }[];
}
