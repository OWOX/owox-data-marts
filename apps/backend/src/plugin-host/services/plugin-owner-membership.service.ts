import { Injectable } from '@nestjs/common';
import type { ProjectMemberDto } from '../../idp/dto/domain/project-member.dto';
import { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';

const MEMBERS_TTL_MS = 30_000;

/** Better Auth still lists a removed member, marked outbound. */
export function isActiveMember(member: ProjectMemberDto | undefined): member is ProjectMemberDto {
  return member !== undefined && !member.isOutbound;
}

/** Owner checks of runs and of Plugins → Schedules; one IDP call per project serves them for 30 s, except a run's no. */
@Injectable()
export class PluginOwnerMembershipService {
  private readonly members = new Map<string, Promise<ProjectMemberDto[]>>();

  constructor(private readonly idp: IdpProjectionsFacade) {}

  /** Null unless an active member; rejects only when the IDP has no list: OWOX Cloud answers its stored one through an IB outage. */
  async activeMember(projectId: string, userId: string): Promise<ProjectMemberDto | null> {
    const cached = this.members.get(projectId);
    let member = await this.find(cached ?? this.ask(projectId), userId);
    // A cached list may predate the owner's return.
    if (cached && !isActiveMember(member)) {
      this.evict(projectId, cached);
      member = await this.find(this.members.get(projectId) ?? this.ask(projectId), userId);
    }
    return isActiveMember(member) ? member : null;
  }

  /** For display: a list up to 30 s old will do. */
  async activeMemberIds(projectId: string): Promise<ReadonlySet<string>> {
    const members = await (this.members.get(projectId) ?? this.ask(projectId));
    return new Set(members.filter(isActiveMember).map(member => member.userId));
  }

  private async find(
    members: Promise<ProjectMemberDto[]>,
    userId: string
  ): Promise<ProjectMemberDto | undefined> {
    return (await members).find(m => m.userId === userId);
  }

  private ask(projectId: string): Promise<ProjectMemberDto[]> {
    const members = this.idp.getProjectMembersOrThrow(projectId);
    this.members.set(projectId, members);
    setTimeout(() => this.evict(projectId, members), MEMBERS_TTL_MS).unref();
    members.catch(() => this.evict(projectId, members));
    return members;
  }

  // Only this call's entry: a failure may already have been replaced by a newer call.
  private evict(projectId: string, members: Promise<ProjectMemberDto[]>): void {
    if (this.members.get(projectId) === members) {
      this.members.delete(projectId);
    }
  }
}
