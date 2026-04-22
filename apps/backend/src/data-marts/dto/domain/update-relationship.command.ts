import { JoinCondition } from '../schemas/join-condition.schema';

export class UpdateRelationshipCommand {
  constructor(
    public readonly relationshipId: string,
    public readonly sourceDataMartId: string,
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[],
    public readonly targetAlias?: string,
    public readonly joinConditions?: JoinCondition[]
  ) {}
}
