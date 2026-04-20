import { JoinCondition } from '../schemas/relationship-schemas';

export class CreateRelationshipCommand {
  constructor(
    public readonly sourceDataMartId: string,
    public readonly targetDataMartId: string,
    public readonly targetAlias: string,
    public readonly joinConditions: JoinCondition[],
    public readonly userId: string,
    public readonly projectId: string,
    public readonly roles: string[]
  ) {}
}
