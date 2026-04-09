export class UpdateDataMartOwnersCommand {
  constructor(
    public readonly id: string,
    public readonly projectId: string,
    public readonly businessOwnerIds: string[],
    public readonly technicalOwnerIds: string[],
    public readonly userId: string = '',
    public readonly roles: string[] = []
  ) {}
}
