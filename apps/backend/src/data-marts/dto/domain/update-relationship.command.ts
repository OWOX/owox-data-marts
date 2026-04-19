import { JoinCondition } from '../schemas/relationship-schemas';

export class UpdateRelationshipCommand {
  constructor(
    public readonly relationshipId: string,
    public readonly sourceDataMartId: string,
    public readonly userId: string,
    public readonly projectId: string,
    public readonly targetAlias?: string,
    public readonly joinConditions?: JoinCondition[]
  ) {}
}
