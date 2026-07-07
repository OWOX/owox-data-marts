import { JoinCondition } from '../schemas/join-condition.schema';

export class DataMartRelationshipGraphEdgeDto {
  constructor(
    public readonly id: string,
    public readonly sourceDataMartId: string,
    public readonly targetDataMartId: string,
    public readonly joinConditions: JoinCondition[]
  ) {}
}
