import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { BlendedFieldConfig } from '../../dto/schemas/relationship-schemas';

export interface ResolvedRelationshipChain {
  relationship: DataMartRelationship;
  targetTableReference: string;
  parentAlias: string;
  blendedFields: BlendedFieldConfig[];
}

export interface BlendedQueryBuilder {
  readonly type: DataStorageType;
  buildBlendedQuery(
    mainTableReference: string,
    chains: ResolvedRelationshipChain[],
    columns: string[]
  ): string;
}
