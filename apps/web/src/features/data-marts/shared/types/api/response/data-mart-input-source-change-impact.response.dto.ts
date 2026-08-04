/**
 * Counts of everything that depends on a Data Mart, used to show the blast radius before its
 * input source is repointed.
 */
export interface DataMartInputSourceChangeImpactResponseDto {
  outboundRelationshipsCount: number;
  inboundRelationshipsCount: number;
  reportsCount: number;
}
