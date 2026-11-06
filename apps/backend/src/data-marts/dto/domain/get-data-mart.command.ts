export class GetDataMartCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly userId: string = '',
    public readonly roles: string[] = [],
    /** Read stored setup without changes from legacy synchronization. */
    public readonly disableLegacySync: boolean = false
  ) {}
}
