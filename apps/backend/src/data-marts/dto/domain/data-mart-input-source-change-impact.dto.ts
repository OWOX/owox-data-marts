export class DataMartInputSourceChangeImpactDto {
  constructor(
    /** Relationships where this data mart joins another one. */
    public readonly outboundRelationshipsCount: number,
    /** Relationships where another data mart joins this one. */
    public readonly inboundRelationshipsCount: number,
    public readonly reportsCount: number
  ) {}
}
