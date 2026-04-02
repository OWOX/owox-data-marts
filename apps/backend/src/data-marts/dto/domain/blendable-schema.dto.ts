import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';

export class BlendedFieldDto {
  name: string;
  sourceRelationshipId: string;
  sourceDataMartId: string;
  sourceDataMartTitle: string;
  targetAlias: string;
  originalFieldName: string;
  type: string;
  isHidden: boolean;
  aggregateFunction: string;
  transitiveDepth: number;
}

export class BlendableSchemaDto {
  nativeFields: DataMartSchema['fields'];
  blendedFields: BlendedFieldDto[];
}
