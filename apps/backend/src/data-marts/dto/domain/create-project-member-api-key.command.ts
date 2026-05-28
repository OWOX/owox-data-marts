import type { Role } from '@owox/idp-protocol';

export class CreateProjectMemberApiKeyCommand {
  constructor(
    public readonly projectId: string,
    public readonly userId: string,
    public readonly name: string,
    public readonly role: Role,
    public readonly expiresAt: string | undefined
  ) {}
}
