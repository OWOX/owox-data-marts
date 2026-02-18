export class ProjectMemberDto {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly displayName: string | undefined,
    public readonly avatarUrl: string | undefined,
    public readonly role: string,
    public readonly hasNotificationsEnabled: boolean
  ) {}
}
