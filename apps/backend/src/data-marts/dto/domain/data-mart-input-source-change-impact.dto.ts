/** A Data Mart named in the impact answer: enough to list and link it. */
export interface DataMartImpactItem {
  id: string;
  title: string;
}

export class DataMartInputSourceChangeImpactDto {
  constructor(
    /** Relationships where this data mart joins another one. */
    public readonly outboundRelationshipsCount: number,
    /** Relationships where another data mart joins this one. */
    public readonly inboundRelationshipsCount: number,
    public readonly reportsCount: number,
    /** SQL Data Marts whose query references this one, whether or not the caller can see them. */
    public readonly referencingDataMartsCount: number = 0,
    /** The referencing Data Marts the caller can see; the rest are only counted. */
    public readonly referencingDataMarts: DataMartImpactItem[] = []
  ) {}
}
