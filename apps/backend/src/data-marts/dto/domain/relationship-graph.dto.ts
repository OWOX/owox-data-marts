import { RelationshipDto } from './relationship.dto';

export interface RelationshipGraphNodeDto {
  relationship: RelationshipDto;
  aliasPath: string;
  depth: number;
  isCycleStub: boolean;
  isBlocked: boolean;
}

export interface RelationshipGraphDto {
  rootDataMartId: string;
  nodes: RelationshipGraphNodeDto[];
}
