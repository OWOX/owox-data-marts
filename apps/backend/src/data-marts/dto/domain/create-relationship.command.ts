import { JoinCondition } from '../schemas/join-condition.schema';

export class CreateRelationshipCommand {
  constructor(
    public readonly sourceDataMartId: string,
    public readonly targetDataMartId: string,
    public readonly targetAlias: string,
    public readonly joinConditions: JoinCondition[],
    public readonly projectId: string,
    public readonly userId: string,
    public readonly roles: string[]
  ) {}
}
