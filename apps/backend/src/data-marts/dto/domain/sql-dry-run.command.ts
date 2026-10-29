export class SqlDryRunCommand {
  constructor(
    public readonly dataMartId: string,
    public readonly projectId: string,
    public readonly sql: string,
    public readonly userId: string = '',
    public readonly roles: string[] = [],
    /**
     * The sender's access to the Data Marts this SQL references was checked when the dry run was
     * requested (see `SqlDryRunService.checkReferences`). Without it, a dry run with no user allows
     * only the references the saved SQL already has.
     */
    public readonly referenceAccessChecked: boolean = false
  ) {}
}
