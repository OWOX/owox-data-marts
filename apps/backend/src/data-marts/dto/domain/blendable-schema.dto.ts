import { DataMartSchema } from '../../data-storage-types/data-mart-schema.type';

export class BlendedFieldDto {
  name: string;
  sourceRelationshipId: string;
  sourceDataMartId: string;
  sourceDataMartTitle: string;
  targetAlias: string;
  originalFieldName: string;
  type: string;
  alias: string;
  description: string;
  isHidden: boolean;
  aggregateFunction: string;
  transitiveDepth: number;
  aliasPath: string;
  outputPrefix: string;
}

export class AvailableSourceDto {
  aliasPath: string;
  title: string;
  defaultAlias: string;
  depth: number;
  fieldCount: number;
  isIncluded: boolean;
  relationshipId: string;
  dataMartId: string;
}

export class BlendableSchemaDto {
  nativeFields: DataMartSchema['fields'];
  blendedFields: BlendedFieldDto[];
  availableSources: AvailableSourceDto[];
}
