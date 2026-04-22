import { DataMartRelationship } from '../../../entities/data-mart-relationship.entity';
import { BlendedQueryContext, ResolvedRelationshipChain } from '../blended-query-builder.interface';

export function makeRelationship(
  overrides: Partial<DataMartRelationship> = {}
): DataMartRelationship {
  return {
    id: 'rel-1',
    targetAlias: 'orders',
    joinConditions: [{ sourceFieldName: 'id', targetFieldName: 'customer_id' }],
    blendedFields: [],
    projectId: 'proj',
    createdById: 'user-1',
    createdAt: new Date(),
    modifiedAt: new Date(),
    ...overrides,
  } as DataMartRelationship;
}

export function makeChain(
  partial: Omit<ResolvedRelationshipChain, 'targetDataMartTitle' | 'targetDataMartUrl'>
): ResolvedRelationshipChain {
  return {
    ...partial,
    targetDataMartTitle: 'Test Subsidiary',
    targetDataMartUrl: '/ui/proj/data-marts/sub-1/data-setup',
  };
}

export function createBuildContext(mainTableReference: string) {
  return (chains: ResolvedRelationshipChain[], columns: string[]): BlendedQueryContext => ({
    mainTableReference,
    mainDataMartTitle: 'Test Main',
    mainDataMartUrl: '/ui/proj/data-marts/main-1/data-setup',
    chains,
    columns,
  });
}
