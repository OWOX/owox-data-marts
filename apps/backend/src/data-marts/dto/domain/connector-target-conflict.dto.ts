export class ConnectorTargetConflictDto {
  constructor(
    public readonly conflict: boolean,
    public readonly dataMart: { id: string; title: string } | null
  ) {}
}
