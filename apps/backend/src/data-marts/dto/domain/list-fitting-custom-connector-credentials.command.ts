export interface FittingCredentialsQuery {
  readonly manifest?: Record<string, unknown>;
  readonly connectorName?: string;
  readonly version?: number;
  /** Fit only what a test of this node runs. */
  readonly node?: string;
  readonly selection?: string;
}

/** The caller is part of the command: only Credentials the member can USE are listed. */
export class ListFittingCustomConnectorCredentialsCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly query: FittingCredentialsQuery
  ) {}
}
